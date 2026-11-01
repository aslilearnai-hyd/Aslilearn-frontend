import { API_BASE_URL } from '@/lib/api-config';
import { getAuthToken, getUser } from '@/lib/auth-utils';
import {
  endSession,
  getLocalIsoDateKey,
  startSession,
  updateStudyTime,
} from '@/utils/studyTimeTracker';

/**
 * Student foreground-time heartbeat, mounted by StudentShell so every student page
 * (exams, videos, AI tools, profile...) counts - not only /dashboard. It writes the
 * same daily UserSession row that the profile "This Week's Activity" card and the
 * teacher / super-admin weekly tracking read.
 */

// Shared across shell remounts (each page renders its own StudentShell), so page
// navigation does not POST the same value again.
let lastPosted: { date: string; minutes: number } | null = null;

async function persistStudentSessionTime(): Promise<void> {
  const token = getAuthToken();
  if (!token) return;
  const { today } = updateStudyTime();
  const date = getLocalIsoDateKey();
  if (today <= 0) return;
  if (lastPosted && lastPosted.date === date && lastPosted.minutes >= today) return;
  lastPosted = { date, minutes: today };
  await fetch(`${API_BASE_URL}/api/student/session-time`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ date, totalMinutes: today }),
    keepalive: true,
  }).catch(() => {
    lastPosted = null;
  });
}

export function startStudentPlatformSessionSync(): () => void {
  // /profile and /ai-tools render StudentShell for every role; only students post time here.
  if (!getAuthToken() || String(getUser()?.role || '').toLowerCase() !== 'student') return () => {};
  startSession();
  void persistStudentSessionTime();

  const tickInterval = setInterval(() => {
    if (!document.hidden) updateStudyTime();
  }, 60_000);
  const saveInterval = setInterval(() => {
    if (!document.hidden) void persistStudentSessionTime();
  }, 2 * 60 * 1000);

  const onVisibility = () => {
    if (document.hidden) {
      endSession();
      void persistStudentSessionTime();
    } else {
      startSession();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    clearInterval(saveInterval);
    clearInterval(tickInterval);
    document.removeEventListener('visibilitychange', onVisibility);
    void persistStudentSessionTime();
  };
}
