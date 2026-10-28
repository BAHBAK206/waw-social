import { featureMode, hasPermission, type FeatureId, type FeatureMode } from '@qubedu/shared';
import { useSession } from './session';

/** The admin-controlled mode of a feature; admins who manage features always get "enabled". */
export function useFeatureMode(id: FeatureId): { mode: FeatureMode; message: string } {
  const mode = useSession((s) => {
    const m = featureMode(s.config?.features ?? {}, id);
    if (m !== 'enabled' && s.me && hasPermission(s.me.role, s.me.permissions, 'features.manage')) return 'enabled';
    return m;
  });
  const message = useSession((s) => s.config?.features?.[id]?.message ?? '');
  return { mode, message };
}

export function useFeatureOn(id: FeatureId): boolean {
  return useFeatureMode(id).mode === 'enabled';
}
