import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BookOpen, Clock3, PlayCircle, Video as VideoIcon } from 'lucide-react';
import {
  extractYouTubeId,
  formatEduOTTDurationLabel,
  getEduOTTPlaybackUrl,
  resolveContentDurationSeconds,
} from '@/lib/eduott-video-utils';
import type { EduOTTVideoCardItem } from '@/components/eduott/EduOTTVideoCard';

type EduOTTVideoPlayerDialogProps = {
  video: EduOTTVideoCardItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EduOTTVideoPlayerDialog({
  video,
  open,
  onOpenChange,
}: EduOTTVideoPlayerDialogProps) {
  const { isYouTube, url: playbackUrl } = video
    ? getEduOTTPlaybackUrl(video)
    : { isYouTube: false, url: null as string | null };
  const subject = String(video?.subjectName || video?.subject || '').trim();
  const duration = video ? formatEduOTTDurationLabel(resolveContentDurationSeconds(video)) : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94vh] !w-[96vw] !max-w-[96vw] flex-col gap-0 overflow-hidden border-white/10 bg-[#071318] p-0 text-white shadow-[0_32px_90px_-20px_rgba(0,0,0,0.85)] sm:!max-w-[94vw] lg:!max-w-[1200px] sm:rounded-3xl [&>button]:right-5 [&>button]:top-5 [&>button]:z-20 [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:bg-black/50 [&>button]:text-white [&>button]:opacity-100 [&>button]:backdrop-blur-md [&>button_svg]:h-6 [&>button_svg]:w-6">
        <DialogHeader className="relative border-b border-white/10 bg-gradient-to-r from-[#0b2a32] to-[#071318] px-6 py-5 pr-20 text-left sm:px-8 sm:py-6">
          <div className="flex items-start gap-4">
            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-green-500 to-indigo-blue-600 shadow-glow sm:flex">
              <PlayCircle className="h-8 w-8 text-white" />
            </div>
            <div className="min-w-0">
              <DialogDescription className="mb-1 text-mini font-bold uppercase tracking-[0.18em] text-teal-green-300 sm:text-[0.9375rem]">
                Now playing
              </DialogDescription>
              <DialogTitle className="font-display text-xl font-bold leading-snug text-white sm:text-2xl lg:text-3xl">
                {video?.title ?? 'Content preview'}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        {video ? (
          <>
            <div className="min-h-0 flex-1 overflow-hidden bg-black">
              {!playbackUrl ? (
                <div className="flex aspect-video items-center justify-center">
                  <p className="text-lg text-white/60">Video not available.</p>
                </div>
              ) : isYouTube ? (
                <div className="w-full bg-black">
                  <div className="relative mx-auto aspect-video w-full max-h-[70vh] overflow-hidden bg-black">
                    {(() => {
                      const ytId = extractYouTubeId(playbackUrl);
                      if (!ytId) {
                        return (
                          <p className="p-6 text-center text-lg text-white/60">
                            Invalid YouTube URL.
                          </p>
                        );
                      }
                      return (
                        <iframe
                          title={video.title}
                          // No web-share permission: YouTube's Share button can no longer open the device share sheet.
                          src={`https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1`}
                          className="absolute inset-0 box-border h-full w-full border-0"
                          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="flex w-full flex-col items-stretch overflow-hidden bg-black">
                  <video
                    key={playbackUrl}
                    src={playbackUrl}
                    controls
                    autoPlay
                    playsInline
                    preload="metadata"
                    className="mx-auto block w-full bg-black object-contain"
                    style={{
                      aspectRatio: '16 / 9',
                      minHeight: 240,
                      maxHeight: '70vh',
                    }}
                  >
                    <track kind="captions" />
                    Your browser does not support embedded video.
                  </video>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 bg-[#0b1e25] px-6 py-4 text-base text-white/65 sm:px-8">
              <span className="flex items-center gap-2 font-semibold text-teal-green-200">
                <VideoIcon className="h-5 w-5" />
                Video lesson
              </span>
              {subject ? (
                <span className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  {subject}
                </span>
              ) : null}
              {duration ? (
                <span className="flex items-center gap-2">
                  <Clock3 className="h-5 w-5" />
                  {duration}
                </span>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
