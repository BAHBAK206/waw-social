import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { celebrate, toastError } from '@/lib/ui';
import { useAuthGate } from '@/lib/useAuthGate';

export function FollowButton({
  userId,
  following,
  onChange,
  size = 'sm',
}: {
  userId: string;
  following: boolean;
  onChange?: (following: boolean) => void;
  size?: 'sm' | 'md';
}) {
  const tr = useT();
  const gate = useAuthGate();
  const [busy, setBusy] = useState(false);
  const toggle = gate(async () => {
    setBusy(true);
    try {
      if (following) {
        await api.users.unfollow(userId);
        onChange?.(false);
      } else {
        const r = await api.users.follow(userId);
        onChange?.(true);
        if (r.newAchievements.length) celebrate({ newAchievements: r.newAchievements });
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  });
  return (
    <Button size={size} variant={following ? 'outline' : 'primary'} loading={busy} aria-pressed={following} onClick={() => void toggle()}>
      {following ? tr.t('common.following') : tr.t('common.follow')}
    </Button>
  );
}
