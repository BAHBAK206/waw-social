import { Bell, BellRing } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toastError } from '@/lib/ui';
import { useAuthGate } from '@/lib/useAuthGate';

/** Subscribing is following the channel owner; new public videos notify subscribers. */
export function SubscribeButton({ userId, subscribed, onChange }: { userId: string; subscribed: boolean; onChange: (subscribed: boolean) => void }) {
  const tr = useT();
  const gate = useAuthGate();
  const myId = useSession((s) => s.me?.id);
  const [busy, setBusy] = useState(false);
  if (myId === userId) return null;
  return (
    <Button
      variant={subscribed ? 'soft' : 'primary'}
      loading={busy}
      icon={subscribed ? <BellRing className="size-4" /> : <Bell className="size-4" />}
      aria-pressed={subscribed}
      onClick={gate(async () => {
        setBusy(true);
        try {
          if (subscribed) await api.users.unfollow(userId);
          else await api.users.follow(userId);
          onChange(!subscribed);
        } catch (e) {
          toastError(e);
        } finally {
          setBusy(false);
        }
      })}
    >
      {subscribed ? tr.t('watch.subscribed') : tr.t('watch.subscribe')}
    </Button>
  );
}
