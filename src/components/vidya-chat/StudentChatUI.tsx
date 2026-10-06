import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Flame,
  Image as ImageIcon,
  Loader2,
  Mic,
  Send,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import type { UseVidyaChatResult } from "./types";

interface StudentChatUIProps {
  model: UseVidyaChatResult;
  className?: string;
}

const CHIP_STYLES = [
  "border-rose-200/90 bg-rose-50 text-rose-950 hover:bg-rose-100",
  "border-indigo-200/90 bg-indigo-50 text-indigo-950 hover:bg-indigo-100",
  "border-teal-200/90 bg-teal-50 text-teal-950 hover:bg-teal-100",
  "border-amber-200/90 bg-amber-50 text-amber-950 hover:bg-amber-100",
];

const CHIP_ICONS = [Target, ClipboardList, CalendarDays, BookOpen];

export function StudentChatUI({ model, className }: StudentChatUIProps) {
  const [insightsOpen, setInsightsOpen] = useState(true);
  const hasMessages = model.displayMessages.length > 0;

  useEffect(() => {
    if (hasMessages) setInsightsOpen(false);
  }, [hasMessages]);

  if (model.isLoading) {
    return (
      <div
        className={`${className ?? ""} flex h-full min-h-[200px] items-center justify-center bg-white`}
      >
        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
      </div>
    );
  }

  const hasNotifications =
    model.todayFocusAction || model.studyStreakMessage || model.proactivePrompt;
  const showInsightsExpanded = Boolean(hasNotifications && insightsOpen);

  return (
    <div
      className={`${className ?? ""} flex h-full max-h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,_#eef2ff_0%,_#f8fafc_45%,_#f0f9ff_100%)]`}
    >
      <div className="shrink-0 border-b border-indigo-100/80 bg-white/90 px-3 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-indigo-100 bg-white shadow-sm">
            <img src="/Vidya-ai.jpg" alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-slate-900">Vidya AI</h3>
            <p className="truncate text-[11px] text-slate-500">
              Your Asli Learn app assistant
            </p>
          </div>
          {hasNotifications ? (
            <button
              type="button"
              onClick={() => setInsightsOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
              aria-expanded={showInsightsExpanded}
            >
              <Sparkles className="h-3 w-3 text-amber-500" />
              Insights
              {showInsightsExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          ) : null}
          {hasMessages ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 rounded-full border-slate-200 bg-white px-2.5 text-[11px] text-slate-600 hover:bg-slate-50"
              onClick={model.clearChat}
              disabled={model.isPending || model.isClearingChat}
              aria-label="Clear chat"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {model.isClearingChat ? "Clearing..." : "Clear Chat"}
            </Button>
          ) : null}
        </div>
      </div>

      {hasNotifications && showInsightsExpanded ? (
        <div className="shrink-0 space-y-1.5 border-b border-indigo-100/70 bg-white/70 px-3 py-2">
          {model.todayFocusAction ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50 px-2.5 py-2">
              <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Today focus
                </p>
                <p className="text-xs font-semibold leading-snug text-amber-950">
                  {model.todayFocusAction}
                </p>
                {model.todayFocusReason ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-amber-800/90">
                    {model.todayFocusReason}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {model.studyStreakMessage ? (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50 px-2.5 py-2">
              <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <p className="text-[11px] font-medium leading-snug text-emerald-900">
                {model.studyStreakMessage}
              </p>
            </div>
          ) : null}
          {model.proactivePrompt ? (
            <button
              type="button"
              onClick={() => model.onPromptClick(model.proactivePrompt || "")}
              className="w-full rounded-xl border border-indigo-200/80 bg-indigo-50 px-2.5 py-2 text-left text-[11px] leading-snug text-indigo-900 hover:bg-indigo-100"
            >
              {model.proactivePrompt}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {!hasMessages ? (
          <div className="px-0.5 py-4">
            <div className="rounded-2xl border border-indigo-100/80 bg-white/90 p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Ask anything about your Asli app
                  </h4>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                    Today&apos;s plan, homework, upcoming exams, subjects, videos completed —
                    or any subject doubt.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {model.quickQuestions.map((question, index) => {
                  const Icon = CHIP_ICONS[index % CHIP_ICONS.length];
                  return (
                    <button
                      key={question}
                      type="button"
                      onClick={() => model.onPromptClick(question)}
                      className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium shadow-sm transition ${
                        CHIP_STYLES[index % CHIP_STYLES.length]
                      }`}
                    >
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" />
                      <span className="leading-snug">{question}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {model.displayMessages.map((msg, index) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={`${msg.role}-${index}`}
                  className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : ""}`}
                >
                  {isUser ? (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-semibold text-white">
                      {model.userInitial}
                    </div>
                  ) : (
                    <img
                      src="/Vidya-ai.jpg"
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-full border border-indigo-100 object-cover"
                    />
                  )}
                  <div
                    className={`min-w-0 max-w-[min(94%,26rem)] sm:max-w-[88%] ${
                      isUser ? "" : "w-full"
                    }`}
                  >
                    {!isUser ? (
                      <p className="mb-1 pl-0.5 text-[10px] font-medium text-slate-400">
                        Vidya AI
                      </p>
                    ) : null}
                    <div
                      className={
                        isUser
                          ? "rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-600 to-sky-600 px-3.5 py-2.5 text-left text-sm leading-relaxed text-white shadow-sm"
                          : "rounded-2xl rounded-bl-md border border-slate-200/90 bg-white/95 px-3.5 py-3 text-left text-sm text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                      }
                    >
                      {isUser ? (
                        <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                      ) : (
                        model.formatMessage(msg.content)
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {model.isPending ? (
              <div className="flex items-center gap-2 pl-9 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                Checking your Asli app data…
              </div>
            ) : null}
            <div ref={model.messagesEndRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-indigo-100/80 bg-white/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        {hasMessages && (
          <details open={!model.displayMessages.some(m => m.role === "user")} className="mb-2 text-xs text-slate-600">
            <summary className="cursor-pointer py-1">Suggested questions</summary>
            <div className="mt-2 flex max-h-32 flex-wrap gap-2 overflow-y-auto">
              {model.quickQuestions.map(question => (
                <button key={question} type="button" disabled={model.isPending}
                  onClick={() => model.onPromptClick(question)}
                  className="rounded-xl border border-indigo-100 px-3 py-2 text-left disabled:opacity-50">
                  {question}
                </button>
              ))}
            </div>
          </details>
        )}
        <div className="flex items-end gap-1.5 rounded-2xl border border-slate-200 bg-slate-50/80 px-2 py-1.5 shadow-sm focus-within:border-indigo-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-slate-500"
            onClick={() => model.fileInputRef.current?.click()}
            disabled={model.isPending}
            aria-label="Upload image"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-slate-500"
            onClick={model.handleVoiceInput}
            disabled={model.isPending || model.isListening}
            aria-label="Voice input"
          >
            <Mic className={`h-4 w-4 ${model.isListening ? "text-red-500" : ""}`} />
          </Button>
          <input
            ref={model.fileInputRef}
            type="file"
            accept="image/*"
            onChange={model.handleImageUpload}
            className="hidden"
          />
          <textarea
            value={model.message}
            onChange={(e) => model.setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                model.handleSendMessage();
              }
            }}
            placeholder={model.inputPlaceholder}
            rows={1}
            className="min-h-[36px] max-h-24 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm leading-snug text-slate-900 outline-none placeholder:text-slate-400"
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-r from-indigo-600 to-sky-600 text-white shadow-sm hover:from-indigo-700 hover:to-sky-700"
            onClick={model.handleSendMessage}
            disabled={model.isPending || !model.message.trim()}
            aria-label="Send"
          >
            {model.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
