import type { ComponentProps } from 'react';
import { useVideoWatch, withYouTubeJsApi } from '@/hooks/use-video-watch';

type WatchProps = { watchVideoId?: string | null; watchSubjectId?: string | null };

/** <video> that reports real watch time (see useVideoWatch). */
export function TrackedVideo({ watchVideoId, watchSubjectId, ...props }: ComponentProps<'video'> & WatchProps) {
  const { html5Props } = useVideoWatch({ videoId: watchVideoId, subjectId: watchSubjectId });
  const { onPlaying, onPause, onEnded, onWaiting, onEmptied } = props;
  return (
    <video
      {...props}
      onPlaying={(e) => {
        html5Props.onPlaying();
        onPlaying?.(e);
      }}
      onPause={(e) => {
        html5Props.onPause();
        onPause?.(e);
      }}
      onEnded={(e) => {
        html5Props.onEnded();
        onEnded?.(e);
      }}
      onWaiting={(e) => {
        html5Props.onWaiting();
        onWaiting?.(e);
      }}
      onEmptied={(e) => {
        html5Props.onEmptied();
        onEmptied?.(e);
      }}
    />
  );
}

/** YouTube embed <iframe> that reports real watch time via the iframe API. */
export function TrackedYouTubeIframe({
  watchVideoId,
  watchSubjectId,
  src,
  ...props
}: ComponentProps<'iframe'> & WatchProps) {
  const { youtubeRef } = useVideoWatch({ videoId: watchVideoId, subjectId: watchSubjectId });
  // Remount when the video changes so the YT player binds to the new embed.
  return <iframe key={src} {...props} src={withYouTubeJsApi(String(src || ''))} ref={youtubeRef} />;
}
