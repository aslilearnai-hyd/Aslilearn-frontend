/**
 * Shared school role access catalogs — Admin / Teacher / Student dashboard modules
 * + helpers for Limited/Unlimited and nav filtering.
 */

export type AccessMode = 'unlimited' | 'limited';

export type VidyaUsageFields = {
  vidyaUsageMode: AccessMode;
  vidyaLimitChatbot: boolean;
  vidyaLimitTools: boolean;
  vidyaChatPerDay: number;
  vidyaGenerationsPerDay: number;
};

export const DEFAULT_VIDYA_USAGE: VidyaUsageFields = {
  vidyaUsageMode: 'unlimited',
  vidyaLimitChatbot: false,
  vidyaLimitTools: false,
  vidyaChatPerDay: 10,
  vidyaGenerationsPerDay: 10,
};

export const SCHOOL_PORTAL_MODULE_GROUPS: {
  category: string;
  modules: { id: string; title: string; description: string }[];
}[] = [
  {
    category: 'Core',
    modules: [
      {
        id: 'User Management',
        title: 'User management',
        description: 'Students, teachers, classes, and class dashboards.',
      },
      {
        id: 'Content Management',
        title: 'Content management',
        description: 'Subjects, curriculum content, uploads, and learning materials.',
      },
      {
        id: 'Analytics',
        title: 'Analytics',
        description: 'Overview stats, performance metrics, and reports.',
      },
    ],
  },
  {
    category: 'Teaching & learning',
    modules: [
      {
        id: 'Exam Management',
        title: 'Exam management',
        description: 'Exam visibility, scheduling, and exam-related tools.',
      },
      {
        id: 'Learning Paths',
        title: 'Learning paths',
        description: 'Structured learning paths and progression.',
      },
      {
        id: 'School Calendar',
        title: 'School calendar',
        description: 'Calendar events and school schedule.',
      },
      {
        id: 'Vidya AI',
        title: 'Vidya AI',
        description: 'AI tutor / assistant for the school portal.',
      },
      {
        id: 'Edu OTT',
        title: 'Edu OTT & video',
        description: 'Video library and Edu OTT content.',
      },
    ],
  },
  {
    category: 'Account & billing',
    modules: [
      {
        id: 'Subscriptions',
        title: 'Subscriptions',
        description: 'Plans, billing, and subscription management.',
      },
      {
        id: 'Settings',
        title: 'Settings',
        description: 'School profile and portal configuration.',
      },
    ],
  },
];

export const TEACHER_PORTAL_MODULE_GROUPS: {
  category: string;
  modules: { id: string; title: string; description: string }[];
}[] = [
  {
    category: 'Teaching',
    modules: [
      { id: 'Dashboard', title: 'Dashboard', description: 'Overview and today\'s schedule.' },
      { id: 'My Classes', title: 'My classes', description: 'Classes you teach.' },
      { id: 'My Students', title: 'My students', description: 'Student roster and progress.' },
      { id: 'Learning Paths', title: 'Learning paths', description: 'Assign and track paths.' },
      { id: 'Edu OTT', title: 'Edu OTT & video', description: 'Video library for teaching.' },
      { id: 'Vidya AI', title: 'Vidya AI', description: 'Teacher AI tools and chatbot.' },
      { id: 'Calendar', title: 'Calendar', description: 'School calendar and events.' },
      { id: 'Offline Results', title: 'Offline results', description: 'OMR / offline exam results.' },
      { id: 'Settings', title: 'Settings', description: 'Teacher profile and preferences.' },
      { id: 'Reports', title: 'Reports', description: 'Class and student analysis reports.' },
    ],
  },
];

export const STUDENT_PORTAL_MODULE_GROUPS: {
  category: string;
  modules: { id: string; title: string; description: string }[];
}[] = [
  {
    category: 'Learning',
    modules: [
      { id: 'Dashboard', title: 'Dashboard', description: 'Home overview and study picks.' },
      { id: 'Learning Paths', title: 'Learning paths', description: 'Your learning paths.' },
      { id: 'Edu OTT', title: 'Edu OTT', description: 'Video lessons and Edu OTT.' },
      { id: 'Exams', title: 'Exams', description: 'School and practice exams.' },
      { id: 'Quiz', title: 'Quiz', description: 'IQ Rank Boost and quizzes.' },
      { id: 'Offline Results', title: 'Offline results', description: 'OMR / offline results.' },
      { id: 'Timetable', title: 'Timetable', description: 'Class timetable.' },
      { id: 'Vidya AI', title: 'Vidya AI', description: 'AI tutor and study tools.' },
      { id: 'Profile', title: 'Profile', description: 'Student profile and settings.' },
    ],
  },
];

export const SCHOOL_PORTAL_FEATURE_IDS = SCHOOL_PORTAL_MODULE_GROUPS.flatMap((g) =>
  g.modules.map((m) => m.id)
);
export const TEACHER_PORTAL_FEATURE_IDS = TEACHER_PORTAL_MODULE_GROUPS.flatMap((g) =>
  g.modules.map((m) => m.id)
);
export const STUDENT_PORTAL_FEATURE_IDS = STUDENT_PORTAL_MODULE_GROUPS.flatMap((g) =>
  g.modules.map((m) => m.id)
);

/** Feature id → AppShell nav item id(s) */
export const ADMIN_FEATURE_TO_NAV: Record<string, string[]> = {
  'User Management': ['students', 'classes', 'teachers'],
  'Content Management': ['subjects'],
  Analytics: ['overview'],
  'Exam Management': ['exams', 'results'],
  'Learning Paths': ['learning-paths'],
  'School Calendar': ['calendar', 'timetable'],
  'Vidya AI': ['vidya-ai'],
  'Edu OTT': ['eduott'],
  Subscriptions: [],
  Settings: [],
};

export const TEACHER_FEATURE_TO_NAV: Record<string, string[]> = {
  Dashboard: ['overview'],
  'My Classes': ['classes'],
  'My Students': ['students'],
  'Learning Paths': ['learning-paths'],
  'Edu OTT': ['edu-ott'],
  'Vidya AI': ['vidya-ai'],
  Calendar: ['calendar'],
  'Offline Results': ['results'],
  Settings: ['settings'],
  Reports: ['reports'],
};

export const STUDENT_FEATURE_TO_NAV: Record<string, string[]> = {
  Dashboard: ['dashboard'],
  'Learning Paths': ['learning-paths'],
  'Edu OTT': ['edu-ott'],
  Exams: ['exams'],
  Quiz: ['quiz'],
  'Offline Results': ['results'],
  Timetable: ['timetable'],
  'Vidya AI': ['ai-tutor'],
  Profile: ['profile'],
};

export function isUnlimitedPortalAccess(
  perms: string[] | undefined,
  allowedIds: string[]
): boolean {
  if (!perms || perms.length === 0) return true;
  const set = new Set(perms);
  return allowedIds.every((f) => set.has(f));
}

export function resolvePortalPermissions(
  mode: AccessMode,
  selected: string[],
  allowedIds: string[]
): string[] {
  if (mode === 'unlimited') return [...allowedIds];
  const set = new Set(selected);
  return allowedIds.filter((f) => set.has(f));
}

export function modeFromPermissions(
  perms: string[] | undefined,
  allowedIds: string[]
): AccessMode {
  return isUnlimitedPortalAccess(perms, allowedIds) ? 'unlimited' : 'limited';
}

export function filterNavByFeatures<T extends { id: string }>(
  nav: T[],
  features: string[] | undefined,
  allowedIds: string[],
  featureToNav: Record<string, string[]>
): T[] {
  if (isUnlimitedPortalAccess(features, allowedIds)) return nav;
  const allowedNav = new Set<string>();
  for (const f of features || []) {
    for (const id of featureToNav[f] || []) allowedNav.add(id);
  }
  // Always keep subscription (B2C) and settings (own profile / password).
  return nav.filter((item) => item.id === 'subscription' || item.id === 'settings' || allowedNav.has(item.id));
}

export type RoleVidyaState = VidyaUsageFields & { enabled: boolean };

export type SchoolRoleAccessState = {
  admin: { accessMode: AccessMode; features: string[]; vidya: RoleVidyaState };
  teacher: { accessMode: AccessMode; features: string[]; vidya: RoleVidyaState };
  student: { accessMode: AccessMode; features: string[]; vidya: RoleVidyaState };
};

export function defaultSchoolRoleAccess(): SchoolRoleAccessState {
  return {
    admin: {
      accessMode: 'unlimited',
      features: [...SCHOOL_PORTAL_FEATURE_IDS],
      vidya: { enabled: true, ...DEFAULT_VIDYA_USAGE },
    },
    teacher: {
      accessMode: 'unlimited',
      features: [...TEACHER_PORTAL_FEATURE_IDS],
      vidya: { enabled: true, ...DEFAULT_VIDYA_USAGE },
    },
    student: {
      accessMode: 'unlimited',
      features: [...STUDENT_PORTAL_FEATURE_IDS],
      vidya: { enabled: true, ...DEFAULT_VIDYA_USAGE },
    },
  };
}

function usageFromPolicy(raw: any): VidyaUsageFields {
  const mode =
    String(raw?.vidyaUsageMode || 'unlimited').toLowerCase() === 'limited'
      ? 'limited'
      : 'unlimited';
  return {
    vidyaUsageMode: mode,
    vidyaLimitChatbot: Boolean(raw?.vidyaLimitChatbot),
    vidyaLimitTools: Boolean(raw?.vidyaLimitTools),
    vidyaChatPerDay: Math.max(1, Math.floor(Number(raw?.vidyaChatPerDay) || 10)),
    vidyaGenerationsPerDay: Math.max(
      1,
      Math.floor(Number(raw?.vidyaGenerationsPerDay) || 10)
    ),
  };
}

/** Hydrate form state from API admin/school payload. */
export function schoolRoleAccessFromAdmin(admin: any): SchoolRoleAccessState {
  const defaults = defaultSchoolRoleAccess();
  const policies = admin?.vidyaRolePolicies || {};
  const legacy = usageFromPolicy(admin);

  const adminPerms = Array.isArray(admin?.permissions) ? admin.permissions : [];
  const teacherPerms = Array.isArray(admin?.teacherPermissions)
    ? admin.teacherPermissions
    : [];
  const studentPerms = Array.isArray(admin?.studentPermissions)
    ? admin.studentPermissions
    : [];

  return {
    admin: {
      accessMode: modeFromPermissions(adminPerms, SCHOOL_PORTAL_FEATURE_IDS),
      features: isUnlimitedPortalAccess(adminPerms, SCHOOL_PORTAL_FEATURE_IDS)
        ? [...SCHOOL_PORTAL_FEATURE_IDS]
        : SCHOOL_PORTAL_FEATURE_IDS.filter((f) => adminPerms.includes(f)),
      vidya: {
        enabled: admin?.vidyaEnabledForAdmins !== false,
        ...usageFromPolicy(policies.admin || { vidyaUsageMode: 'unlimited' }),
      },
    },
    teacher: {
      accessMode: modeFromPermissions(teacherPerms, TEACHER_PORTAL_FEATURE_IDS),
      features: isUnlimitedPortalAccess(teacherPerms, TEACHER_PORTAL_FEATURE_IDS)
        ? [...TEACHER_PORTAL_FEATURE_IDS]
        : TEACHER_PORTAL_FEATURE_IDS.filter((f) => teacherPerms.includes(f)),
      vidya: {
        enabled: admin?.vidyaEnabledForTeachers !== false,
        ...usageFromPolicy(policies.teacher || legacy),
      },
    },
    student: {
      accessMode: modeFromPermissions(studentPerms, STUDENT_PORTAL_FEATURE_IDS),
      features: isUnlimitedPortalAccess(studentPerms, STUDENT_PORTAL_FEATURE_IDS)
        ? [...STUDENT_PORTAL_FEATURE_IDS]
        : STUDENT_PORTAL_FEATURE_IDS.filter((f) => studentPerms.includes(f)),
      vidya: {
        enabled: admin?.vidyaEnabledForStudents !== false,
        ...usageFromPolicy(policies.student || legacy),
      },
    },
  };
}

/** Payload fields for create/update school admin APIs. */
export function buildRoleAccessPayload(state: SchoolRoleAccessState) {
  const strip = (v: RoleVidyaState) => ({
    vidyaUsageMode: v.vidyaUsageMode,
    vidyaLimitChatbot: v.vidyaLimitChatbot,
    vidyaLimitTools: v.vidyaLimitTools,
    vidyaChatPerDay: v.vidyaChatPerDay,
    vidyaGenerationsPerDay: v.vidyaGenerationsPerDay,
  });

  return {
    permissions: resolvePortalPermissions(
      state.admin.accessMode,
      state.admin.features,
      SCHOOL_PORTAL_FEATURE_IDS
    ),
    teacherPermissions: resolvePortalPermissions(
      state.teacher.accessMode,
      state.teacher.features,
      TEACHER_PORTAL_FEATURE_IDS
    ),
    studentPermissions: resolvePortalPermissions(
      state.student.accessMode,
      state.student.features,
      STUDENT_PORTAL_FEATURE_IDS
    ),
    vidyaEnabledForAdmins: state.admin.vidya.enabled,
    vidyaEnabledForTeachers: state.teacher.vidya.enabled,
    vidyaEnabledForStudents: state.student.vidya.enabled,
    vidyaRolePolicies: {
      admin: strip(state.admin.vidya),
      teacher: strip(state.teacher.vidya),
      student: strip(state.student.vidya),
    },
    // Legacy flat mirror (student policy preferred for older cards)
    ...strip(state.student.vidya),
  };
}

export function validateRoleAccessState(state: SchoolRoleAccessState): string | null {
  for (const role of ['admin', 'teacher', 'student'] as const) {
    const block = state[role];
    if (block.accessMode === 'limited' && block.features.length === 0) {
      return `Select at least one ${role} dashboard module, or switch to Unlimited.`;
    }
    if (block.vidya.vidyaUsageMode === 'limited') {
      if (!block.vidya.vidyaLimitChatbot && !block.vidya.vidyaLimitTools) {
        return `When Vidya is Limited for ${role}, select chatbot and/or AI tools.`;
      }
    }
  }
  return null;
}
