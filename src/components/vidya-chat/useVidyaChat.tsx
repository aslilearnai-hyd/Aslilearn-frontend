import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL, apiFetch } from "@/lib/api-config";
import { getAuthToken } from "@/lib/auth-utils";
import { isLikelyMongoObjectId } from "@/lib/vidya-subjects";
import { ChatMessageContent } from "./ChatMessageContent";
import { preparePhoto } from "./preparePhoto";
import type {
  AIChatContext,
  UseVidyaChatResult,
  VidyaChatRole,
  Message,
} from "./types";

function conversationPayload(messages: Message[]) {
  const rows = messages.filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({
      role: m.role,
      content: String(m.content || ""),
      ...(Array.isArray(m.citations) && m.citations.length ? { citations: m.citations } : {}),
    }));
  if (rows.reduce((sum, m) => sum + m.content.length, 0) <= 120000) return rows;
  const limit = Math.max(1, Math.floor(120000 / Math.max(1, rows.length)));
  return rows.map(m => ({ ...m, content: m.content.length > limit
    ? `${m.content.slice(0, Math.floor(limit * 0.7))}\n[Earlier message shortened]\n${m.content.slice(-Math.max(1, Math.floor(limit * 0.3)))}` : m.content }));
}

type VidyaReply = {
  message?: string;
  citations?: Message["citations"];
  actions?: Message["actions"];
};

/**
 * Reads a streamed Vidya reply (?stream=1): calls onText with the text so far,
 * returns the final payload. Plain JSON (older servers) is returned as is.
 */
async function readVidyaReply(response: Response, onText: (text: string) => void): Promise<VidyaReply> {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/event-stream") || !response.body) return response.json();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const raw = /^data: (.*)$/m.exec(block)?.[1];
      if (!event || raw === undefined) continue;
      const data = JSON.parse(raw);
      if (event === "delta") {
        text += String(data.text || "");
        onText(text);
      } else if (event === "reset") {
        text = "";
        onText("");
      } else if (event === "done") {
        return data;
      } else if (event === "error") {
        throw new Error(String(data.message || "Vidya request failed"));
      }
    }
    if (done) break;
  }
  throw new Error("The reply was interrupted. Please try again.");
}

const CONTROL_ASSISTANT_QUICK_QUESTIONS_ADMIN = [
  "School dashboard overview",
  "How many students and teachers are active?",
  "How many OMR batches do we have?",
  "How is Class 7 performing?",
  "Tell me about a student by name",
  "How many homework submissions are there?",
  "Show published videos and assessments count",
  "Login attendance summary for today",
];

const CONTROL_ASSISTANT_QUICK_QUESTIONS_SUPER = [
  "Platform overview — schools, students, teachers",
  "How many OMR batches and exam results this month?",
  "Details about a school by name",
  "How many trial members are there?",
  "How is a student or teacher doing by name?",
  "How many published videos and assessments?",
  "Login sessions today across the platform",
  "How many risk reports exist?",
];

const QUICK_QUESTIONS_BY_ROLE: Record<VidyaChatRole, string[]> = {
  student: [
    "Teach me magnetic field",
    "What should I do today?",
    "What is my homework today?",
    "What are my upcoming exams?",
    "How many subjects do I have?",
    "How many videos in maths?",
    "What is my recent OMR exam result?",
    "What quizzes do I have?",
    "What is on my calendar?",
  ],
  teacher: [
    "Help me explain a topic to my class",
    "What should I do today?",
    "List my classes and students",
    "Who logged in today?",
    "Show homework pending review",
    "What are upcoming exams?",
    "OMR batches for my school",
    "Tell me about a student by name",
    "How is Class 7 performing?",
  ],
  admin: CONTROL_ASSISTANT_QUICK_QUESTIONS_ADMIN,
  super_admin: CONTROL_ASSISTANT_QUICK_QUESTIONS_SUPER,
};

const INPUT_PLACEHOLDER_BY_ROLE: Record<VidyaChatRole, string> = {
  student: "Ask a topic doubt, a follow-up, or about your exams and progress…",
  teacher: "Ask for teaching help or about your classes, students and exams…",
  admin: "Ask live school data: students, OMR, exams, homework, classes…",
  super_admin: "Ask live platform data: schools, OMR, exams, trials, AI…",
};

const CONTROL_INPUT_PLACEHOLDER =
  "Ask live app metrics — students, teachers, OMR, exams, homework, videos, risk…";

interface UseVidyaChatOptions {
  userId: string;
  role: VidyaChatRole;
  context?: AIChatContext;
}

type VidyaChatPrefillEvent = CustomEvent<{
  role?: VidyaChatRole;
  message: string;
}>;

function mergeSubjectOptions(
  subjectOptions: string[] | undefined,
  currentSubject: string | undefined
): string[] {
  const opts = (subjectOptions ?? []).map((s) => String(s || "").trim()).filter(Boolean);
  const cur = String(currentSubject || "").trim();
  const list = opts.length > 0 ? [...opts] : cur ? [cur] : ["General Study"];
  const hasCur = cur && list.some((x) => x.localeCompare(cur, undefined, { sensitivity: "accent" }) === 0);
  const merged = cur && !hasCur ? [cur, ...list] : list;
  return Array.from(new Set(merged)).filter((s) => !isLikelyMongoObjectId(s));
}

export function useVidyaChat({
  userId,
  role,
  context,
}: UseVidyaChatOptions): UseVidyaChatResult {
  const isDatabaseBackedAssistant = role === "super_admin" || role === "admin";
  const isStudentMentorMode = role === "student";
  const isTeacherMentorMode = role === "teacher";
  const isAppMentorMode = isStudentMentorMode || isTeacherMentorMode;

  const [message, setMessage] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [preparingImage, setPreparingImage] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [lastControlLatencyMs, setLastControlLatencyMs] = useState<number | null>(null);
  const [todayFocusAction, setTodayFocusAction] = useState("");
  const [todayFocusReason, setTodayFocusReason] = useState("");
  const [studyStreakMessage, setStudyStreakMessage] = useState("");
  const [proactivePrompt, setProactivePrompt] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localMessagesRef = useRef<Message[]>([]);
  const sendingRef = useRef(false);
  const historyHydratedRef = useRef(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    localMessagesRef.current = localMessages;
  }, [localMessages]);

  const mergedSubjectOptions = useMemo(
    () => mergeSubjectOptions(context?.subjectOptions, context?.currentSubject),
    [
      context?.currentSubject,
      Array.isArray(context?.subjectOptions) ? context!.subjectOptions!.join("\u0001") : "",
    ]
  );

  const subjectSelectOptions = useMemo(() => {
    const rows = Array.isArray(context?.subjectSelectOptions) ? context.subjectSelectOptions : [];
    if (rows.length === 0) return undefined;
    // Keep only options whose values exist in the selectable list (plus current).
    const allowed = new Set(mergedSubjectOptions.map((s) => s.toLowerCase()));
    return rows.filter((row) => allowed.has(String(row.value || "").toLowerCase()));
  }, [context?.subjectSelectOptions, mergedSubjectOptions]);

  const [selectedSubject, setSelectedSubject] = useState(
    () => mergedSubjectOptions[0] || "General Study"
  );
  const selectedSubjectRef = useRef(selectedSubject);
  selectedSubjectRef.current = selectedSubject;

  useEffect(() => {
    const fallback = mergedSubjectOptions[0] || "General Study";
    setSelectedSubject((prev) =>
      mergedSubjectOptions.some((s) => s === prev) ? prev : fallback
    );
  }, [mergedSubjectOptions]);

  // Saved student/teacher conversation, so Vidya remembers after reload / page change.
  const { data: mentorHistory, isLoading: sessionsLoading } = useQuery({
    queryKey: ["vidya-mentor-history", userId],
    queryFn: async (): Promise<Message[]> => {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/vidya/mentor/history`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error("Failed to fetch chat history");
      const data = await response.json();
      const rows = Array.isArray(data?.messages) ? data.messages : [];
      return rows
        .filter((m: Message) => m?.role === "user" || m?.role === "assistant")
        .map((m: Message) => ({ ...m, timestamp: m.timestamp ? new Date(m.timestamp) : new Date() }));
    },
    refetchInterval: false,
    refetchOnWindowFocus: false,
    enabled: Boolean(userId) && !isDatabaseBackedAssistant,
  });

  const { data: controlHistory, isLoading: controlHistoryLoading } = useQuery({
    queryKey: ["vidya-control-history", userId],
    queryFn: async () => {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/vidya/control/history?limit=50`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error("Failed to fetch control history");
      return response.json() as Promise<{
        success: boolean;
        items: Array<{ prompt: string; responseText: string; createdAt?: string }>;
      }>;
    },
    enabled: Boolean(userId) && isDatabaseBackedAssistant,
  });

  useEffect(() => {
    if (role !== "student") return;
    let mounted = true;
    apiFetch("/api/vidya/student/focus-card")
      .then((r) => r.json())
      .then((data) => {
        if (!mounted || !data?.success) return;
        setTodayFocusAction(data.focusCard?.action || data.todayFocus?.action || "");
        setTodayFocusReason(data.focusCard?.reason || "");
        const streakCount = Number(data.studyStreak?.count || 0);
        setStudyStreakMessage(streakCount > 0 ? `🔥 ${streakCount}-day streak!` : data.studyStreak?.message || "");
        setProactivePrompt(data.proactivePrompt?.promptText || "");
        if (data.autoGreeting && localMessagesRef.current.length === 0) {
          setLocalMessages([
            {
              role: "assistant",
              content: String(data.autoGreeting),
              timestamp: new Date(),
            },
          ]);
        }
      })
      .catch(() => null);
    return () => {
      mounted = false;
    };
  }, [role, userId]);

  const sessionMessages: Message[] = useMemo(() => mentorHistory ?? [], [mentorHistory]);

  useEffect(() => {
    if (isDatabaseBackedAssistant) return;
    if (mentorHistory === undefined || historyHydratedRef.current) return;
    historyHydratedRef.current = true;
    // Saved chat replaces the auto-greeting, but never overwrites a chat the user already started.
    if (sessionMessages.length > 0 && !localMessagesRef.current.some(m => m.role === "user")) {
      setLocalMessages(sessionMessages);
    }
  }, [isDatabaseBackedAssistant, mentorHistory, sessionMessages]);

  useEffect(() => {
    if (!isDatabaseBackedAssistant) return;
    if (controlHistory === undefined) return;
    if (!controlHistory?.success) return;
    const items = controlHistory.items || [];
    if (items.length === 0) {
      setLocalMessages([]);
      return;
    }
    setLocalMessages((prev) => {
      if (prev.length > 0) return prev;
      const mapped: Message[] = [];
      for (const it of items) {
        const ts = it.createdAt ? new Date(it.createdAt) : new Date();
        mapped.push({ role: "user", content: it.prompt, timestamp: ts });
        mapped.push({ role: "assistant", content: it.responseText, timestamp: ts });
      }
      return mapped;
    });
  }, [isDatabaseBackedAssistant, controlHistory]);

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { message: string; context?: AIChatContext }) => {
      const token = getAuthToken();
      const userMessage: Message = {
        role: "user",
        content: data.message,
        timestamp: new Date(),
      };

      const historyPayload = conversationPayload(localMessagesRef.current);

      setLocalMessages((prev) => [...prev, userMessage]);

      // Shows the reply while it arrives, in one "streaming" message that is replaced at the end.
      const showStreamingText = (text: string) =>
        setLocalMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.streaming) return [...prev.slice(0, -1), { ...last, content: text }];
          return text ? [...prev, { role: "assistant", content: text, timestamp: new Date(), streaming: true }] : prev;
        });
      const addFinalReply = (result: VidyaReply) => {
        const aiMessage: Message = {
          role: "assistant",
          content: String(result.message),
          timestamp: new Date(),
          ...(Array.isArray(result.citations) && result.citations.length ? { citations: result.citations } : {}),
          ...(Array.isArray(result.actions) && result.actions.length ? { actions: result.actions } : {}),
        };
        setLocalMessages((prev) => [...prev.filter((m) => !m.streaming), aiMessage]);
      };

      if (isDatabaseBackedAssistant) {
        const response = await fetch(`${API_BASE_URL}/api/vidya/control/query`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: data.message,
            history: historyPayload,
          }),
        });

        if (!response.ok) {
          let errorMessage = "Control assistant request failed";
          try {
            const errorJson = await response.json();
            if (errorJson?.message) errorMessage = String(errorJson.message);
          } catch (_) {
            // ignore
          }
          throw new Error(errorMessage);
        }

        const result = await response.json();
        if (result.message) {
          setLastControlLatencyMs(
            typeof result.latencyMs === "number" ? result.latencyMs : null
          );
          const aiMessage: Message = {
            role: "assistant",
            content: result.message,
            timestamp: new Date(),
          };
          setLocalMessages((prev) => [...prev, aiMessage]);
        }
        return result;
      }

      if (isStudentMentorMode) {
        const historyPayload = conversationPayload(localMessagesRef.current);
        const response = await fetch(`${API_BASE_URL}/api/vidya/student/chat?stream=1`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: data.message,
            studentId: userId,
            history: historyPayload,
          }),
        });

        if (!response.ok) {
          let errorMessage = "Student mentor request failed";
          try {
            const errorJson = await response.json();
            if (errorJson?.message) errorMessage = String(errorJson.message);
          } catch (_) {
            // ignore
          }
          throw new Error(errorMessage);
        }

        const result = await readVidyaReply(response, showStreamingText);
        if (result.message) addFinalReply(result);
        return result;
      }

      if (isTeacherMentorMode) {
        const response = await fetch(`${API_BASE_URL}/api/vidya/teacher/chat?stream=1`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: data.message,
            history: historyPayload,
            context: {
              currentSubject: selectedSubjectRef.current,
              currentTopic: data.context?.currentTopic ?? context?.currentTopic ?? "",
            },
          }),
        });

        if (!response.ok) {
          let errorMessage = "Teacher assistant request failed";
          try {
            const errorJson = await response.json();
            if (errorJson?.message) errorMessage = String(errorJson.message);
          } catch (_) {
            // ignore
          }
          throw new Error(errorMessage);
        }

        const result = await readVidyaReply(response, showStreamingText);
        if (result.message) addFinalReply(result);
        return result;
      }

      const response = await fetch(`${API_BASE_URL}/api/ai-chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          message: data.message,
          context: {
            ...context,
            ...data.context,
            studentName: context?.studentName || data.context?.studentName || "Student",
            currentSubject:
              data.context?.currentSubject ??
              selectedSubjectRef.current ??
              context?.currentSubject,
            currentTopic: data.context?.currentTopic ?? context?.currentTopic,
          },
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to send message";
        try {
          const errorJson = await response.json();
          if (errorJson?.message) {
            errorMessage = String(errorJson.message);
          }
        } catch (_) {
          // Keep default message when response is not JSON.
        }
        throw new Error(errorMessage);
      }
      const result = await response.json();

      if (result.session?.messages) {
        setLocalMessages(result.session.messages);
      } else if (result.message) {
        const aiMessage: Message = {
          role: "assistant",
          content: result.message,
          timestamp: new Date(),
        };
        setLocalMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.role === "assistant" && lastMessage.content === result.message) {
            return prev;
          }
          return [...prev, aiMessage];
        });
      }

      return result;
    },
    onSuccess: (_data, _vars, _ctx) => {
      if (isDatabaseBackedAssistant) {
        queryClient.invalidateQueries({ queryKey: ["vidya-control-history", userId] });
      } else if (isStudentMentorMode) {
        queryClient.invalidateQueries({ queryKey: ["vidya-student-focus", userId] });
      }
    },
    onError: (error: unknown, variables) => {
      const msg = error instanceof Error ? error.message : "Failed to send message.";
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
      // Drop any half-streamed reply, then the unanswered question (it goes back into the input).
      setLocalMessages((prev) => prev.filter((m) => !m.streaming).slice(0, -1));
      setMessage(prev => prev || variables.message);
    },
    onSettled: () => { sendingRef.current = false; },
  });

  const analyzeImageMutation = useMutation({
    mutationFn: async (data: { image: string; mimeType: string; context?: string; history: ReturnType<typeof conversationPayload> }) => {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/ai-chat/analyze-image`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        let errorMessage = "Failed to analyze image";
        try {
          const errorJson = await response.json();
          if (errorJson?.message) {
            errorMessage = String(errorJson.message);
          }
        } catch (_) {
          // Keep default message when response is not JSON.
        }
        throw new Error(errorMessage);
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      setLocalMessages(prev => [...prev,
        { role: "user", content: `[Uploaded image] ${variables.context || "Explain this image"}`, timestamp: new Date() },
        { role: "assistant", content: String(data.analysis || data.message || "No readable answer was returned. Please retry with a clearer photo."), timestamp: new Date() },
      ]);
    },
    onError: (error: unknown, variables) => {
      setMessage(prev => prev || variables.context || "");
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to analyze image. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => { sendingRef.current = false; },
  });

  const sendSpecificMessage = (text: string) => {
    if (!text.trim()) return;
    if (sendingRef.current || analyzeImageMutation.isPending) return;
    const trimmed = text.trim();
    if (isDatabaseBackedAssistant && role === "admin") {
      const asksExamAnswers =
        /\b(answer\s*key|exam\s+answers?|solved?\s+paper|marking\s+scheme|give\s+me\s+the\s+answers?)\b/i.test(
          trimmed,
        );
      if (asksExamAnswers) {
        setLocalMessages((prev) => [
          ...prev,
          {
            role: "user",
            content: trimmed,
            timestamp: new Date(),
          },
          {
            role: "assistant",
            content:
              "I can report exam **counts and schedules** for your school, but I can’t provide answer keys or solve exam papers. Try: “How many exams are scheduled this week?”",
            timestamp: new Date(),
          },
        ]);
        setMessage("");
        return;
      }
    }
    if (sendMessageMutation.isPending) {
      // Don't drop the request — put it in the composer so the user can send when ready.
      setMessage(trimmed);
      return;
    }
    sendingRef.current = true;
    setMessage("");
    sendMessageMutation.mutate({
      message: trimmed,
      context: {
        ...context,
        currentSubject: selectedSubjectRef.current || context?.currentSubject || "General Study",
      },
    });
  };

  const handleSendMessage = () => sendSpecificMessage(message);

  const clearChatMutation = useMutation({
    mutationFn: async () => {
      const token = getAuthToken();
      const historyPath = isDatabaseBackedAssistant ? "/api/vidya/control/history" : "/api/vidya/mentor/history";
      const response = await fetch(`${API_BASE_URL}${historyPath}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        let errorMessage = "Failed to clear chat history";
        try {
          const errorJson = await response.json();
          if (errorJson?.message) errorMessage = String(errorJson.message);
        } catch (_) {
          // ignore json parse errors
        }
        throw new Error(errorMessage);
      }
      return response.json();
    },
    onSuccess: () => {
      setLocalMessages([]);
      setMessage("");
      if (isDatabaseBackedAssistant) {
        queryClient.invalidateQueries({ queryKey: ["vidya-control-history", userId] });
      } else {
        queryClient.setQueryData(["vidya-mentor-history", userId], []);
      }
      toast({
        title: "Chat cleared",
        description: "Conversation history has been cleared.",
      });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Failed to clear chat history.";
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const onPrefill = (event: Event) => {
      const prefillEvent = event as VidyaChatPrefillEvent;
      const payload = prefillEvent.detail;
      if (!payload?.message?.trim()) return;
      if (payload.role && payload.role !== role) return;
      sendSpecificMessage(payload.message);
    };

    window.addEventListener("vidya-chat-prefill", onPrefill);
    return () => {
      window.removeEventListener("vidya-chat-prefill", onPrefill);
    };
  }, [role, sendMessageMutation.isPending, context, userId, selectedSubject]);

  useEffect(() => {
    const onClear = (event: Event) => {
      const detail = (event as CustomEvent<{ role?: VidyaChatRole }>).detail;
      if (detail?.role && detail.role !== role) return;
      if (clearChatMutation.isPending) return;
      clearChatMutation.mutate();
    };

    window.addEventListener("vidya-chat-clear", onClear);
    return () => window.removeEventListener("vidya-chat-clear", onClear);
  }, [role, clearChatMutation.isPending]);

  const onPromptClick = (question: string) => {
    sendSpecificMessage(question);
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (sendingRef.current) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast({ title: "Choose a supported photo", description: "Use a JPEG, PNG or WebP image smaller than 5 MB.", variant: "destructive" });
      return;
    }
    sendingRef.current = true;
    const question = message.trim() || `Explain this educational image. Subject: ${selectedSubjectRef.current || "General Study"}.`;
    setMessage("");
    setPreparingImage(true);

    preparePhoto(file).then(base64Data => {
      analyzeImageMutation.mutate({
        image: base64Data,
        mimeType: "image/jpeg",
        context: question,
        history: conversationPayload(localMessagesRef.current),
      });
    }).catch(error => {
      sendingRef.current = false;
      setMessage(prev => prev || question);
      toast({ title: "Photo could not be read", description: error instanceof Error ? error.message : "Please select the photo again.", variant: "destructive" });
    }).finally(() => setPreparingImage(false));
  };

  const handleVoiceInput = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast({
        title: "Not Supported",
        description: "Speech recognition is not supported in your browser.",
        variant: "destructive",
      });
      return;
    }

    const Win = window as unknown as {
      webkitSpeechRecognition?: new () => { start: () => void; onstart: (() => void) | null };
      SpeechRecognition?: new () => { start: () => void; onstart: (() => void) | null };
    };
    const SpeechRecognitionCtor = Win.webkitSpeechRecognition || Win.SpeechRecognition;
    if (!SpeechRecognitionCtor) return;
    // Minimal typing: Web Speech API is not modeled in TS for all browsers here.
    const recognition = new SpeechRecognitionCtor() as {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start: () => void;
      onstart: ((this: unknown) => void) | null;
      onerror: ((this: unknown) => void) | null;
      onresult: ((this: unknown, event: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
      onend: ((this: unknown) => void) | null;
    };
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => setIsListening(true);
    recognition.onerror = () => {
      toast({
        title: "Error",
        description: "Failed to recognize speech. Please try again.",
        variant: "destructive",
      });
    };
    recognition.onresult = (event: {
      results: { 0: { 0: { transcript: string } } };
    }) => {
      const transcript = event.results[0][0].transcript;
      if (transcript.trim()) {
        setMessage(transcript);
        setTimeout(() => sendSpecificMessage(transcript), 100);
      }
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const displayMessages = useMemo(() => {
    if (isDatabaseBackedAssistant) return localMessages;
    return localMessages.length > 0 ? localMessages : sessionMessages;
  }, [isDatabaseBackedAssistant, localMessages, sessionMessages]);

  const lastMessageLength = displayMessages[displayMessages.length - 1]?.content.length ?? 0;
  const lastMessageCount = useRef(0);
  useEffect(() => {
    const end = messagesEndRef.current;
    if (!end) return;
    // Scroll only the chat box, never the page. A smooth scrollIntoView on every
    // streamed piece restarted the animation many times a second (stutter) and
    // pulled the student back down while they were reading above.
    let box: HTMLElement | null = end.parentElement;
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    const newMessage = displayMessages.length !== lastMessageCount.current;
    lastMessageCount.current = displayMessages.length;
    if (!box) {
      if (newMessage) end.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
    if (newMessage) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
    else if (nearBottom) box.scrollTop = box.scrollHeight; // streaming: follow instantly
  }, [displayMessages.length, lastMessageLength]); // also follow a reply while it streams

  const formatMessage = (text: string) => {
    if (!text) return null;
    return <ChatMessageContent text={text} />;
  };

  const quickQuestions = isDatabaseBackedAssistant
    ? role === "super_admin"
      ? CONTROL_ASSISTANT_QUICK_QUESTIONS_SUPER
      : CONTROL_ASSISTANT_QUICK_QUESTIONS_ADMIN
    : QUICK_QUESTIONS_BY_ROLE[role];

  const inputPlaceholder = isDatabaseBackedAssistant
    ? CONTROL_INPUT_PLACEHOLDER
    : INPUT_PLACEHOLDER_BY_ROLE[role];

  const isLoading = isDatabaseBackedAssistant
    ? controlHistoryLoading && localMessages.length === 0
    : sessionsLoading && localMessages.length === 0;

  return {
    message,
    setMessage,
    isListening,
    isLoading,
    isPending: preparingImage || sendMessageMutation.isPending || analyzeImageMutation.isPending,
    displayMessages,
    quickQuestions,
    inputPlaceholder,
    currentSubject: selectedSubject,
    subjectOptions: mergedSubjectOptions,
    subjectSelectOptions,
    setSelectedSubject,
    userInitial: context?.studentName?.charAt(0)?.toUpperCase() || "A",
    fileInputRef,
    messagesEndRef,
    handleSendMessage,
    sendSpecificMessage,
    handleImageUpload,
    handleVoiceInput,
    onPromptClick,
    clearChat: () => {
      if (clearChatMutation.isPending) return;
      clearChatMutation.mutate();
    },
    isClearingChat: clearChatMutation.isPending,
    formatMessage,
    isDatabaseBackedAssistant,
    lastControlLatencyMs,
    todayFocusAction,
    todayFocusReason,
    studyStreakMessage,
    proactivePrompt,
  };
}
