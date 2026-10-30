import { featureMode, hasPermission, type FeatureId } from '@qubedu/shared';
import { useSession } from './session';

/** True when the root admin has not turned this action/feature off (admins with feature control always see it). */
export function useFeatureOn(id: FeatureId): boolean {
  return useSession((s) => {
    const mode = featureMode(s.config?.features ?? {}, id);
    if (mode === 'enabled') return true;
    return !!s.me && hasPermission(s.me.role, s.me.permissions, 'features.manage');
  });
}
