/** Super admin dashboard section ids (sidebar + main content switch). */
export type SuperAdminView =
  | 'dashboard'
  | 'admins'
  | 'analytics'
  | 'ai-analytics'
  | 'subscriptions'
  | 'settings'
  | 'board-comparison'
  | 'content'
  | 'board'
  | 'subjects'
  | 'subjects-and-content'
  | 'exams'
  | 'iq-rank-boost'
  | 'vidya-ai'
  | 'ai-tool-generations'
  | 'ai-tool-duplicates'
  | 'ai-tool-topics'
  | 'courses'
  | 'add-admin'
  | 'calendar'
  | 'ai-generator'
  | 'book-knowledge-base'
  | 'book-based-generator'
  | 'edu-ott-live'
  | 'products'
  | 'trial-members'
  | 'offline-results'
  | 'audit-logs'
  | 'impact-reports'
  | 'student-details';

export const SUPER_ADMIN_VIEWS: SuperAdminView[] = [
  'dashboard',
  'admins',
  'analytics',
  'ai-analytics',
  'subscriptions',
  'settings',
  'board-comparison',
  'content',
  'board',
  'subjects',
  'subjects-and-content',
  'exams',
  'iq-rank-boost',
  'vidya-ai',
  'ai-tool-generations',
  'ai-tool-duplicates',
  'ai-tool-topics',
  'courses',
  'add-admin',
  'calendar',
  'ai-generator',
  'book-knowledge-base',
  'book-based-generator',
  'edu-ott-live',
  'products',
  'trial-members',
  'offline-results',
  'audit-logs',
  'impact-reports',
  'student-details',
];

export function isSuperAdminView(value: string): value is SuperAdminView {
  return SUPER_ADMIN_VIEWS.includes(value as SuperAdminView);
}
