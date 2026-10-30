/**
 * Who can do what, by account type. The server enforces these; the apps use the same list to show or hide actions,
 * and the help page shows it as a table.
 */
import type { AccountType } from './roles';

export type Capability =
  | 'createClass'
  | 'gradeWork'
  | 'teacherAi'
  | 'createQuizzes'
  | 'publishCatalog'
  | 'hostOpenLive'
  | 'verifiedAnswers'
  | 'libraryWithoutReview'
  | 'joinClasses'
  | 'submitHomework'
  | 'followChildren'
  | 'setParentalControls'
  | 'messageTeachersOfChild'
  | 'postPublic'
  | 'useAi';

/** yes · no · verified (teachers after verification) · parent (if the parent allows, under 18) · child (only the linked child's). */
export type CapabilityValue = 'yes' | 'no' | 'verified' | 'parent' | 'linked';

export const CAPABILITY_TABLE: { key: Capability; student: CapabilityValue; teacher: CapabilityValue; parent: CapabilityValue }[] = [
  { key: 'joinClasses', student: 'yes', teacher: 'yes', parent: 'no' },
  { key: 'submitHomework', student: 'yes', teacher: 'no', parent: 'no' },
  { key: 'createClass', student: 'no', teacher: 'yes', parent: 'no' },
  { key: 'gradeWork', student: 'no', teacher: 'yes', parent: 'no' },
  { key: 'createQuizzes', student: 'no', teacher: 'yes', parent: 'no' },
  { key: 'teacherAi', student: 'no', teacher: 'yes', parent: 'no' },
  { key: 'publishCatalog', student: 'no', teacher: 'verified', parent: 'no' },
  { key: 'hostOpenLive', student: 'no', teacher: 'verified', parent: 'no' },
  { key: 'verifiedAnswers', student: 'no', teacher: 'verified', parent: 'no' },
  { key: 'libraryWithoutReview', student: 'no', teacher: 'verified', parent: 'no' },
  { key: 'postPublic', student: 'parent', teacher: 'yes', parent: 'yes' },
  { key: 'useAi', student: 'parent', teacher: 'yes', parent: 'yes' },
  { key: 'followChildren', student: 'no', teacher: 'no', parent: 'linked' },
  { key: 'setParentalControls', student: 'no', teacher: 'no', parent: 'linked' },
  { key: 'messageTeachersOfChild', student: 'no', teacher: 'no', parent: 'linked' },
];

/** Whether an account can do something. `verifiedTeacher` comes from the admin's verification. */
export function can(user: { accountType: AccountType; verifiedTeacher?: boolean }, cap: Capability): boolean {
  const row = CAPABILITY_TABLE.find((r) => r.key === cap);
  if (!row) return false;
  const v = row[user.accountType];
  if (v === 'yes' || v === 'parent' || v === 'linked') return true;
  if (v === 'verified') return user.accountType === 'teacher' && !!user.verifiedTeacher;
  return false;
}
