import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { authJsonHeaders, hasAuthSession } from '@/lib/auth-utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Brain,
  Sparkles,
  Video,
  FileText,
  ClipboardList,
  ChevronRight,
  BookOpen,
  Headphones,
  FileBadge,
  GraduationCap,
  Loader2,
  AlertCircle,
  Target,
} from 'lucide-react';
import { API_BASE_URL } from '@/lib/api-config';
import { subjectDisplayLabel } from '@/lib/subject-names';
import { extractYouTubeId } from '@/lib/eduott-video-utils';
import { capAdaptiveRecommendationsPerSubject } from '@/utils/adaptive-recommendations-display';
import PdfPreviewPanel from '@/components/shared/PdfPreviewPanel';

/** Optional legacy props (dashboard may still pass them; recommendations come from API). */
export interface AdaptiveRecommendationsProps {
  subjectProgress?: unknown[];
  examResults?: unknown[];
  quizzes?: unknown[];
  subjects?: unknown[];
  videos?: unknown[];
  content?: unknown[];
}

interface RecommendedItem {
  kind: string;
  _id: string;
  title: string;
  displayType: string;
  nativeType?: string;
  topicHint?: string;
  fileUrl?: string;
  navigatePath?: string;
  examId?: string;
  openMode?: string;
}

interface AdaptiveCard {
  subjectId: string;
  subjectName: string;
  progressPercent: number;
  examScorePercent?: number;
  weakTopicCount: number;
  priority: 'High' | 'Medium' | 'Low';
  focusChapters?: Array<{
    chapter: string;
    wrong?: number;
    skipped?: number;
    weight?: number;
    navigatePath?: string;
  }>;
  gapsWithoutContent: string[];
  usesLibraryFallback?: boolean;
  recommendedContent: RecommendedItem[];
}

interface AdaptiveApiPayload {
  cards: AdaptiveCard[];
  dailyPlan?: AdaptiveDailyPlan | null;
  meta?: {
    generatedAt?: string;
    reason?: string;
    examResultsAnalyzed?: number;
    libraryItemsLoaded?: number;
  };
}

interface AdaptiveDailyPlan {
  subjectName: string;
  focusTopic: string;
  reason: string;
  steps: Array<{ key: string; title: string; description: string; navigatePath: string }>;
}

function parseAdaptivePayload(json: Record<string, unknown>): AdaptiveApiPayload {
  const root = json as { success?: boolean; data?: unknown };
  let payload = root.data ?? json;
  if (payload && typeof payload === 'object' && 'data' in (payload as object)) {
    const nested = (payload as { data?: AdaptiveApiPayload }).data;
    if (nested && typeof nested === 'object' && Array.isArray((nested as AdaptiveApiPayload).cards)) {
      payload = nested;
    }
  }
  const cards = Array.isArray((payload as AdaptiveApiPayload)?.cards)
    ? (payload as AdaptiveApiPayload).cards
    : [];
  const meta =
    payload && typeof payload === 'object' && 'meta' in payload
      ? (payload as AdaptiveApiPayload).meta
      : undefined;
  const dailyPlan = (payload as AdaptiveApiPayload)?.dailyPlan || null;
  return { cards, meta, dailyPlan };
}

function getSubjectIcon(name: string) {
  const n = (name || '').toLowerCase();
  if (n.includes('math')) return '∑';
  if (n.includes('physics')) return 'Φ';
  if (n.includes('chemistry')) return '⚗';
  if (n.includes('bio')) return '🧬';
  return (name || 'Su').substring(0, 2).toUpperCase();
}

function priorityBadgeClass(priority: string) {
  if (priority === 'High') return 'bg-rose-100 text-rose-800 border-rose-200';
  if (priority === 'Medium') return 'bg-amber-100 text-amber-900 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function priorityBorderClass(priority: string) {
  if (priority === 'High') return 'border-rose-300 bg-rose-50/40';
  if (priority === 'Medium') return 'border-amber-300 bg-amber-50/40';
  return 'border-sky-300 bg-sky-50/40';
}

function itemBorderClass(displayType: string) {
  const d = (displayType || '').toLowerCase();
  if (d === 'video') return 'border-violet-300 hover:border-violet-400 hover:bg-violet-50/70';
  if (d === 'pdf') return 'border-sky-300 hover:border-sky-400 hover:bg-sky-50/70';
  if (d === 'practice') return 'border-orange-300 hover:border-orange-400 hover:bg-orange-50/70';
  if (d === 'assignment') return 'border-teal-300 hover:border-teal-400 hover:bg-teal-50/70';
  if (d === 'audio') return 'border-blue-300 hover:border-blue-400 hover:bg-blue-50/70';
  if (d.includes('previous') || d.includes('paper')) {
    return 'border-indigo-300 hover:border-indigo-400 hover:bg-indigo-50/70';
  }
  return 'border-slate-300 hover:border-slate-400 hover:bg-slate-50/70';
}

function typeBadgeClass(displayType: string) {
  const d = displayType.toLowerCase();
  if (d === 'video') return 'bg-violet-100 text-violet-800';
  if (d === 'pdf') return 'bg-red-50 text-red-800';
  if (d === 'practice') return 'bg-orange-100 text-orange-900';
  if (d === 'assignment') return 'bg-teal-100 text-teal-900';
  if (d === 'audio') return 'bg-blue-100 text-blue-900';
  if (d.includes('previous') || d.includes('paper')) return 'bg-indigo-100 text-indigo-900';
  return 'bg-gray-100 text-gray-800';
}

function getTypeIcon(displayType: string) {
  const d = displayType.toLowerCase();
  if (d === 'video') return Video;
  if (d === 'pdf') return FileBadge;
  if (d === 'practice') return ClipboardList;
  if (d === 'assignment') return GraduationCap;
  if (d === 'audio') return Headphones;
  if (d.includes('previous') || d.includes('paper')) return FileText;
  return BookOpen;
}

function resolveFileUrl(url: string) {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('//')) return url;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return `${API_BASE_URL}/${url}`;
}

function isVideoItem(item: RecommendedItem, url = '') {
  const type = String(item.displayType || '').toLowerCase();
  const u = String(url || item.fileUrl || '').toLowerCase();
  return (
    type === 'video' ||
    u.includes('youtube.com') ||
    u.includes('youtu.be') ||
    /\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(u)
  );
}

function youtubeEmbedSrc(url: string): string | null {
  const id = extractYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&autoplay=1` : null;
}

const EMPTY_REASON_MESSAGES: Record<string, string> = {
  student_not_found: 'Your student profile could not be loaded. Try signing out and back in.',
  no_subjects: 'No subjects are assigned to your class yet. Ask your teacher or admin to assign subjects.',
};

export default function AdaptiveRecommendations(_props: AdaptiveRecommendationsProps) {
  const [, setLocation] = useLocation();
  const [cards, setCards] = useState<AdaptiveCard[]>([]);
  const [meta, setMeta] = useState<AdaptiveApiPayload['meta']>();
  const [dailyPlan, setDailyPlan] = useState<AdaptiveDailyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<RecommendedItem | null>(null);

  const fetchAdaptive = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (!hasAuthSession()) {
        setCards([]);
        setError('Sign in to load adaptive recommendations.');
        return;
      }
      const response = await fetch(`${API_BASE_URL}/api/student/adaptive-learning`, {
        headers: authJsonHeaders(),
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to load adaptive learning');
      }
      const json = await response.json();
      const payload = parseAdaptivePayload(json);
      setCards(payload.cards);
      setMeta(payload.meta);
      setDailyPlan(payload.dailyPlan || null);
    } catch (e) {
      console.error('Adaptive learning fetch failed:', e);
      setError(e instanceof Error ? e.message : 'Could not load recommendations');
      setCards([]);
      setMeta(undefined);
      setDailyPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdaptive();
  }, [fetchAdaptive]);

  const openResource = (item: RecommendedItem) => {
    const mode = item.openMode || 'url';
    const rawUrl = item.fileUrl || '';
    const fullUrl = rawUrl ? resolveFileUrl(rawUrl) : '';
    const video = isVideoItem(item, fullUrl);

    // Videos always stay on this page (modal player) — never navigate away.
    if (video && fullUrl) {
      setPreviewItem({ ...item, fileUrl: fullUrl, openMode: 'preview' });
      return;
    }

    if (mode === 'navigate' && item.navigatePath && !video) {
      if (item.examId) {
        try {
          sessionStorage.setItem('adaptiveJumpExamId', item.examId);
        } catch {
          /* ignore */
        }
      }
      setLocation(item.navigatePath);
      return;
    }

    if (!fullUrl) {
      // Video/library row with no playable URL — stay put rather than leaving the dashboard.
      if (item.navigatePath && !video) {
        setLocation(item.navigatePath);
      }
      return;
    }

    setPreviewItem({ ...item, fileUrl: fullUrl });
  };

  const headerBlock = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center space-x-3">
        <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shrink-0">
          <Brain className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
        </div>
        <div>
          <CardTitle className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent text-xl sm:text-2xl">
            Adaptive Learning
          </CardTitle>
          <p className="text-xs sm:text-sm text-gray-600">
            Chapters and subtopics from your exam misses — then matching library resources
          </p>
        </div>
      </div>
      <Badge className="bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-md w-fit shrink-0">
        <Sparkles className="w-3 h-3 mr-1" />
        AI Powered
      </Badge>
    </div>
  );

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-2 border-purple-200 shadow-xl">
        <CardHeader>{headerBlock}</CardHeader>
        <CardContent className="flex items-center justify-center gap-2 py-12 text-gray-600">
          <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 animate-spin text-purple-600" />
          <span>Analyzing your weak topics and matching library content…</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-2 border-purple-200 shadow-xl">
        <CardHeader>{headerBlock}</CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-white/90 p-4 text-red-800">
            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{error}</p>
              <button
                type="button"
                onClick={fetchAdaptive}
                className="mt-2 text-xs sm:text-sm text-purple-700 underline underline-offset-2 hover:text-purple-900"
              >
                Try again
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (cards.length === 0) {
    const reasonKey = meta?.reason ? String(meta.reason) : '';
    const reasonMessage = reasonKey ? EMPTY_REASON_MESSAGES[reasonKey] : null;
    const analyzed = meta?.examResultsAnalyzed ?? 0;
    const libraryItems = meta?.libraryItemsLoaded ?? 0;

    return (
      <Card className="bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-2 border-purple-200 shadow-xl">
        <CardHeader>{headerBlock}</CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-lg p-3 sm:p-4 lg:p-6 border border-purple-100 text-center">
            <p className="text-gray-600 mb-2">
              {reasonMessage || 'No adaptive recommendations yet.'}
            </p>
            <p className="text-xs sm:text-sm text-gray-500">
              {reasonMessage
                ? 'Once subjects and library content are set up, recommendations will appear here.'
                : 'Attempt exams so we can infer weak chapters and topics, then map them to notes, videos, quizzes, and papers in your class library.'}
            </p>
            {!reasonMessage && (analyzed > 0 || libraryItems > 0) ? (
              <p className="text-mini text-gray-400 mt-2">
                Analyzed {analyzed} exam attempt{analyzed === 1 ? '' : 's'} · {libraryItems} library
                item{libraryItems === 1 ? '' : 's'} loaded
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-2 border-purple-200 shadow-xl">
        <CardHeader>{headerBlock}</CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 lg:space-y-6">
          {dailyPlan ? (
            <div className="rounded-xl border border-indigo-200 bg-white/90 p-4 shadow-sm">
              <div className="mb-3 flex items-start gap-2">
                <Brain className="mt-0.5 h-5 w-5 text-indigo-600" />
                <div>
                  <p className="font-semibold text-gray-900">Today’s plan: {dailyPlan.focusTopic}</p>
                  <p className="text-xs text-gray-500">{dailyPlan.reason}</p>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {dailyPlan.steps.map((step, index) => (
                  <button key={step.key} type="button" onClick={() => setLocation(step.navigatePath)} className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50">
                    <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Step {index + 1}</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">{step.title}</p>
                    <p className="mt-1 text-xs text-gray-500">{step.description}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {cards.map((rec) => {
            const displayContent = capAdaptiveRecommendationsPerSubject(rec.recommendedContent ?? []);
            const hasContent = displayContent.length > 0;
            const examScore = rec.examScorePercent ?? rec.progressPercent;
            return (
              <div
                key={rec.subjectId}
                className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-purple-100 shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0 mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold bg-gradient-to-r from-purple-500 to-blue-500 shrink-0">
                    {getSubjectIcon(rec.subjectName)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{subjectDisplayLabel(rec.subjectName) || rec.subjectName}</h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                      <span>Exam score {Math.round(examScore)}%</span>
                      <span aria-hidden className="text-gray-300">
                        ·
                      </span>
                      <span>Weak topics: {rec.weakTopicCount}</span>
                      <Badge
                        variant="outline"
                        className={`text-micro uppercase tracking-wide ${priorityBadgeClass(rec.priority)}`}
                      >
                        Priority: {rec.priority}
                      </Badge>
                    </div>
                  </div>
                </div>

                {Array.isArray(rec.focusChapters) && rec.focusChapters.length > 0 ? (
                  <div className="mb-4">
                    <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-rose-700">
                      <Target className="h-3.5 w-3.5" />
                      Chapters / subtopics to focus on
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {rec.focusChapters.map((ch) => (
                        <button
                          key={ch.chapter}
                          type="button"
                          onClick={() => {
                            if (ch.navigatePath) setLocation(ch.navigatePath);
                            else setLocation(`/learning-paths?focus=${encodeURIComponent(ch.chapter)}`);
                          }}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left text-xs sm:text-sm text-rose-950 hover:bg-rose-100 transition-colors"
                        >
                          <span className="font-semibold">{ch.chapter}</span>
                          <span className="mt-0.5 block text-[11px] text-rose-700/80">
                            {(ch.wrong || 0) > 0 ? `${ch.wrong} wrong` : null}
                            {(ch.wrong || 0) > 0 && (ch.skipped || 0) > 0 ? ' · ' : null}
                            {(ch.skipped || 0) > 0 ? `${ch.skipped} skipped` : null}
                            {(ch.wrong || 0) === 0 && (ch.skipped || 0) === 0
                              ? 'From recent exams'
                              : null}
                            {' · Study this'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {hasContent ? (
                  <div>
                    <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      <BookOpen className="h-3.5 w-3.5" />
                      {rec.usesLibraryFallback
                        ? 'Recommended from your library'
                        : 'Recommended for your weak areas'}
                    </p>
                    {/* Full-box colored border around the whole recommendation group */}
                    <ul
                      className={`space-y-2 rounded-xl border-2 p-2 ${priorityBorderClass(rec.priority)}`}
                    >
                      {displayContent.map((item) => {
                        const Icon = getTypeIcon(item.displayType);
                        const isPdf = item.displayType?.toLowerCase() === 'pdf';
                        const actionLabel =
                          item.kind === 'quiz' || item.kind === 'exam'
                            ? 'Open'
                            : isPdf
                              ? 'View only'
                              : item.displayType?.toLowerCase() === 'video'
                                ? 'Watch'
                                : 'View';
                        return (
                          <li key={`${item.kind}-${item._id}`}>
                            {/* Single-box colored border per resource row */}
                            <button
                              type="button"
                              onClick={() => openResource(item)}
                              className={`flex w-full items-center gap-2 rounded-lg border-2 bg-white px-3 py-2.5 text-left text-xs text-gray-800 shadow-sm transition-colors sm:text-sm ${itemBorderClass(item.displayType)}`}
                            >
                              <Icon className="h-3 w-3 shrink-0 text-purple-600 sm:h-4 sm:w-4" />
                              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="w-full truncate text-left">{item.title}</span>
                                {item.topicHint && item.topicHint !== 'From your library' ? (
                                  <span className="text-mini w-full truncate text-left text-gray-500">
                                    Focus: {item.topicHint}
                                  </span>
                                ) : null}
                              </div>
                              <Badge
                                className={`text-micro shrink-0 font-semibold ${typeBadgeClass(item.displayType)}`}
                              >
                                {item.displayType}
                              </Badge>
                              <span className="text-micro shrink-0 font-medium text-purple-700">
                                {actionLabel}
                              </span>
                              {item.navigatePath || item.fileUrl ? (
                                <ChevronRight className="h-3 w-3 shrink-0 text-gray-400 sm:h-4 sm:w-4" />
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {rec.gapsWithoutContent?.length > 0 ? (
                  <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 space-y-1">
                    <p className="font-semibold uppercase tracking-wide text-micro text-amber-900/90">
                      No matching library items
                    </p>
                    {rec.gapsWithoutContent.slice(0, 6).map((topic) => (
                      <p key={topic} className="text-amber-900/85">
                        No recommended content available for this topic:{' '}
                        <span className="font-medium">{topic}</span>
                      </p>
                    ))}
                  </div>
                ) : null}

                {!hasContent && !rec.gapsWithoutContent?.length ? (
                  <p className="text-xs sm:text-sm text-gray-500 italic mt-1">
                    No library content is available for this subject yet. Check back after your teacher
                    adds materials.
                  </p>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={Boolean(previewItem)} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent
          className={
            previewItem && isVideoItem(previewItem, previewItem.fileUrl || '')
              ? 'flex max-h-[94vh] w-[min(96vw,1100px)] max-w-[1100px] flex-col overflow-hidden border-slate-800 bg-[#071318] p-0 text-white shadow-2xl sm:rounded-2xl'
              : 'flex h-[min(96dvh,1120px)] max-h-[96dvh] w-[min(96vw,860px)] max-w-[860px] flex-col overflow-hidden p-4 sm:p-6'
          }
        >
          {previewItem ? (
            isVideoItem(previewItem, previewItem.fileUrl || '') ? (
              <>
                <DialogHeader className="shrink-0 border-b border-white/10 px-5 py-4 pr-12 text-left sm:px-6">
                  <DialogDescription className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-300">
                    Now playing
                  </DialogDescription>
                  <DialogTitle className="text-base text-white sm:text-lg">
                    {previewItem.title}
                  </DialogTitle>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-hidden bg-black">
                  {(() => {
                    const src = previewItem.fileUrl || '';
                    const yt = youtubeEmbedSrc(src);
                    if (yt) {
                      return (
                        <div className="relative mx-auto aspect-video w-full max-h-[70vh] bg-black">
                          <iframe
                            title={previewItem.title}
                            src={yt}
                            className="absolute inset-0 h-full w-full border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                          />
                        </div>
                      );
                    }
                    return (
                      <video
                        key={src}
                        src={src}
                        controls
                        autoPlay
                        playsInline
                        preload="metadata"
                        className="mx-auto block w-full bg-black object-contain"
                        style={{ aspectRatio: '16 / 9', minHeight: 240, maxHeight: '70vh' }}
                      >
                        <track kind="captions" />
                        Your browser does not support embedded video.
                      </video>
                    );
                  })()}
                </div>
              </>
            ) : (
              <>
                <DialogHeader className="shrink-0">
                  <DialogTitle className="pr-6 text-base sm:text-lg">{previewItem.title}</DialogTitle>
                  <DialogDescription className="text-xs sm:text-sm">
                    Read like a book — scroll pages vertically. Pinch on the page to zoom. Double-tap to
                    reset.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex min-h-0 flex-1 touch-manipulation flex-col overflow-hidden bg-[#d6d3d1]">
                  {previewItem.displayType?.toLowerCase() === 'pdf' ||
                  previewItem.fileUrl?.toLowerCase().includes('.pdf') ? (
                    <PdfPreviewPanel
                      fileUrl={previewItem.fileUrl || ''}
                      title={previewItem.title}
                      className="h-full min-h-0 w-full flex-1"
                      variant="book"
                    />
                  ) : (
                    <iframe
                      title={previewItem.title}
                      src={previewItem.fileUrl}
                      className="h-full w-full border-0"
                    />
                  )}
                </div>
              </>
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
