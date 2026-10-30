export type AccountType = 'student' | 'teacher' | 'parent';
export const ACCOUNT_TYPES: readonly AccountType[] = ['student', 'teacher', 'parent'];

export type Role = 'user' | 'moderator' | 'admin' | 'root';
export const ROLES: readonly Role[] = ['user', 'moderator', 'admin', 'root'];

export const ADMIN_PERMISSIONS = [
  'users.view',
  'users.manage',
  'reports.manage',
  'content.manage',
  'quizzes.manage',
  'library.manage',
  'classes.manage',
  'education.manage',
  'challenge.manage',
  'communities.manage',
  'assistant.manage',
  'errors.view',
  'audit.view',
  'features.manage',
  'site.manage',
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/** Root-only permissions: global settings cannot be delegated. */
export const ROOT_ONLY: readonly AdminPermission[] = ['features.manage', 'site.manage'];

const MODERATOR_DEFAULT: readonly AdminPermission[] = ['users.view', 'reports.manage', 'errors.view'];

export function hasPermission(role: Role, granted: readonly string[] | null | undefined, perm: AdminPermission): boolean {
  if (role === 'root') return true;
  if (ROOT_ONLY.includes(perm)) return false;
  if (role === 'admin') return true;
  if (role === 'moderator') return MODERATOR_DEFAULT.includes(perm) || (granted ?? []).includes(perm);
  return false;
}

export function isStaff(role: Role): boolean {
  return role === 'moderator' || role === 'admin' || role === 'root';
}

export function permissionsFor(role: Role, granted: readonly string[] | null | undefined): AdminPermission[] {
  return ADMIN_PERMISSIONS.filter((p) => hasPermission(role, granted, p));
}

export type GroupRole = 'owner' | 'admin' | 'teacher' | 'member';
export type CourseRole = 'teacher' | 'assistant' | 'student';

export function canModerateGroup(role: GroupRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'teacher';
}
