import { useCallback, useEffect, useRef } from 'react';
import { API_BASE_URL } from '@/lib/api-config';
import { getAuthToken, getUser } from '@/lib/auth-utils';

/**
 * Video watch-time heartbeats for super-admin usage analysis.
 * Counts only time the player is actually playing (HTML5 `playing` / YouTube
 * PLAYING state) and posts it to /api/{student|teacher}/video-watch every ~30 s.
 * The server caps each beat at 60 s and never credits more than wall-clock
 * time since the previous beat, so this stays a best-effort, fire-and-forget call.
 */
const BEAT_MS = 30_000;
const MAX_BEAT_SECONDS = 60;
const MIN_FLUSH_SECONDS = 5;

type WatchTarget = { videoId?: string | null; subjectId?: string | null; enabled?: boolean };

/** Students and teachers each have their own endpoint; other roles are not tracked. */
function beatUrl(): string | null {
  const role = String(getUser()?.role || '').toLowerCase();
  if (role === 'student') return `${API_BASE_URL}/api/student/video-watch`;
  if (role === 'teacher') return `${API_BASE_URL}/api/teacher/video-watch`;
  return null;
}

function sendBeat(videoId: string, seconds: number, subjectId?: string | null, keepalive = false) {
  const url = beatUrl();
  if (!url) return;
  const token = getAuthToken();
  void fetch(url, {
    method: 'POST',
    credentials: 'include',
    keepalive,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ videoId, seconds, ...(subjectId ? { subjectId } : {}) }),
  }).catch(() => {});
}

type YTPlayer = object;
type YTNamespace = {
  Player: new (el: HTMLIFrameElement, opts: { events: { onStateChange: (e: { data: number }) => void } }) => YTPlayer;
};

let ytApiPromise: Promise<YTNamespace | null> | null = null;
function loadYouTubeApi(): Promise<YTNamespace | null> {
  const w = window as unknown as { YT?: YTNamespace & { loaded?: number }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const prev = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(w.YT ?? null);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => {
        ytApiPromise = null;
        resolve(null);
      };
      document.head.appendChild(s);
    });
  }
  return ytApiPromise;
}

/** Add `enablejsapi=1` (and origin) so the iframe reports its play state. */
export function withYouTubeJsApi(src: string): string {
  if (!src || /[?&]enablejsapi=1/.test(src)) return src;
  const sep = src.includes('?') ? '&' : '?';
  const origin = typeof window !== 'undefined' ? `&origin=${encodeURIComponent(window.location.origin)}` : '';
  return `${src}${sep}enablejsapi=1${origin}`;
}

/**
 * Track watch time for one video. Spread `html5Props` onto a <video>, or pass
 * `youtubeRef` as the ref of a YouTube embed iframe whose src went through
 * `withYouTubeJsApi`.
 */
export function useVideoWatch({ videoId, subjectId, enabled = true }: WatchTarget) {
  const id = enabled ? String(videoId || '').trim() : '';
  const state = useRef({ playingSince: 0, pending: 0 });
  const target = useRef({ id, subjectId });
  target.current = { id, subjectId };

  const settle = useCallback(() => {
    const s = state.current;
    if (s.playingSince) {
      const now = Date.now();
      s.pending += (now - s.playingSince) / 1000;
      s.playingSince = now;
    }
  }, []);

  const flush = useCallback(
    (force: boolean, keepalive = false) => {
      settle();
      const s = state.current;
      const { id: vid, subjectId: sub } = target.current;
      if (!vid) return;
      const whole = Math.floor(Math.min(s.pending, MAX_BEAT_SECONDS));
      if (whole < (force ? MIN_FLUSH_SECONDS : 1)) return;
      s.pending -= whole;
      sendBeat(vid, whole, sub, keepalive);
    },
    [settle],
  );

  const setPlaying = useCallback(
    (playing: boolean) => {
      const s = state.current;
      if (playing) {
        if (!s.playingSince) s.playingSince = Date.now();
      } else {
        settle();
        s.playingSince = 0;
      }
    },
    [settle],
  );

  // Periodic beats while this video is mounted; final flush on change/unmount.
  useEffect(() => {
    if (!id) return undefined;
    state.current = { playingSince: 0, pending: 0 };
    const timer = window.setInterval(() => flush(false), BEAT_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush(true, true);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      setPlaying(false);
      flush(true, true);
    };
  }, [id, flush, setPlaying]);

  const html5Props = {
    onPlaying: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onWaiting: () => setPlaying(false),
    onEmptied: () => setPlaying(false),
  };

  const playerRef = useRef<YTPlayer | null>(null);
  const youtubeRef = useCallback(
    (el: HTMLIFrameElement | null) => {
      // No destroy(): it removes the iframe, which React owns.
      playerRef.current = null;
      if (!el) {
        setPlaying(false);
        return;
      }
      void loadYouTubeApi().then((YT) => {
        if (!YT || !el.isConnected) return;
        // 1 = PLAYING; paused, buffering, ended and cued all stop the clock.
        playerRef.current = new YT.Player(el, { events: { onStateChange: (e) => setPlaying(e.data === 1) } });
      });
    },
    [setPlaying],
  );

  return { html5Props, youtubeRef };
}
