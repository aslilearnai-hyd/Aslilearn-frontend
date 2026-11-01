import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Clock, Play, Video as VideoIcon } from 'lucide-react';
import {
  getEduOTTPlaybackUrl,
  getEduOTTThumbnailUrl,
  resolveContentDurationSeconds,
  formatEduOTTDurationLabel,
  type EduOTTVideoLike,
} from '@/lib/eduott-video-utils';
import { cn } from '@/lib/utils';

export type EduOTTVideoCardItem = EduOTTVideoLike & {
  _id?: string;
  id?: string;
  title: string;
  description?: string;
  views?: number;
  createdAt?: string;
  durationSeconds?: number;
  duration?: number;
  subjectName?: string;
  subject?: string;
  subjectId?: string;
};

type EduOTTVideoCardProps = {
  video: EduOTTVideoCardItem;
  onPlay: () => void;
  durationLabel?: string;
  subjectBadges?: React.ReactNode;
  playAccentClass?: string;
  className?: string;
};

const ACCENT_RINGS = [
  'from-teal-green-400 to-indigo-blue-500',
  'from-amber-400 to-orange-500',
  'from-sky-400 to-teal-green-500',
  'from-rose-400 to-amber-400',
];

function accentForKey(key: string) {
  let n = 0;
  for (let i = 0; i < key.length; i++) n += key.charCodeAt(i);
  return ACCENT_RINGS[n % ACCENT_RINGS.length];
}

export function EduOTTVideoCard({
  video,
  onPlay,
  durationLabel: durationLabelProp,
  subjectBadges,
  playAccentClass: _playAccentClass,
  className,
}: EduOTTVideoCardProps) {
  const [thumbError, setThumbError] = useState(false);
  const [secondsFromFile, setSecondsFromFile] = useState<number | null>(null);
  const thumbnailSrc = getEduOTTThumbnailUrl(video);
  const { isYouTube, url: playbackUrl } = getEduOTTPlaybackUrl(video);
  const videoKey = video._id || video.id || video.title;
  const accent = accentForKey(String(videoKey));

  const dbSeconds = useMemo(() => resolveContentDurationSeconds(video), [video]);

  useEffect(() => {
    setSecondsFromFile(null);
  }, [videoKey, playbackUrl]);

  const displaySeconds = secondsFromFile ?? dbSeconds;
  const durationLabel =
    durationLabelProp?.trim() ||
    formatEduOTTDurationLabel(displaySeconds) ||
    '';

  return (
    <article
      className={cn(
        'group cursor-pointer overflow-hidden rounded-3xl bg-white shadow-[0_10px_30px_-12px_rgba(6,36,51,0.22)] transition-all duration-300',
        'ring-1 ring-ink/5 hover:-translate-y-1.5 hover:shadow-[0_22px_50px_-18px_rgba(13,148,136,0.35)] hover:ring-teal-green-400/40',
        className
      )}
      onClick={onPlay}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPlay();
        }
      }}
    >
      <div className={cn('h-1.5 w-full bg-gradient-to-r', accent)} />

      <div className="relative aspect-[16/10] overflow-hidden bg-mist">
        {!isYouTube && playbackUrl && dbSeconds <= 0 ? (
          <video
            className="hidden"
            preload="metadata"
            src={playbackUrl}
            aria-hidden
            tabIndex={-1}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) {
                setSecondsFromFile(Math.round(d));
              }
            }}
          />
        ) : null}
        {thumbnailSrc && !thumbError ? (
          <img
            src={thumbnailSrc}
            alt={video.title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]"
            onError={() => setThumbError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal-green-100 to-sky-100">
            <VideoIcon className="h-14 w-14 text-teal-green-500/50" />
          </div>
        )}

        <div
          className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ backgroundColor: 'rgba(6, 36, 51, 0.35)' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              'flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-lg transition duration-300',
              'scale-95 opacity-90 group-hover:scale-110 group-hover:opacity-100 group-hover:shadow-glow',
              accent
            )}
          >
            <Play className="ml-1 h-8 w-8" fill="currentColor" />
          </div>
        </div>

        {durationLabel ? (
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-ink/85 px-3 py-1.5 text-[0.9375rem] font-semibold text-white backdrop-blur-sm">
            <Clock className="h-4 w-4 shrink-0" />
            <span>{durationLabel}</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 p-5">
        <h3 className="font-display text-lg font-bold leading-snug text-ink line-clamp-2 sm:text-xl">
          {video.title}
        </h3>
        {subjectBadges ? <div className="flex flex-wrap gap-2">{subjectBadges}</div> : null}
        {video.description ? (
          <p className="line-clamp-2 text-base leading-relaxed text-muted-foreground">{video.description}</p>
        ) : null}
        <p className="text-[0.9375rem] font-semibold text-teal-green-700 opacity-0 transition group-hover:opacity-100">
          Tap to watch →
        </p>
      </div>
    </article>
  );
}

export function EduOTTSubjectBadges({
  subjectLabel,
  classLabel,
}: {
  subjectLabel?: string;
  classLabel?: string;
}) {
  if (!subjectLabel && !classLabel) return null;
  return (
    <>
      {subjectLabel ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-green-50 px-3 py-1 text-[0.9375rem] font-semibold text-teal-green-800 ring-1 ring-teal-green-200">
          <BookOpen className="h-4 w-4" />
          {subjectLabel}
        </span>
      ) : null}
      {classLabel ? (
        <span className="inline-flex w-fit items-center rounded-full bg-amber-50 px-3 py-1 text-[0.9375rem] font-semibold text-amber-800 ring-1 ring-amber-200">
          Class {classLabel}
        </span>
      ) : null}
    </>
  );
}
