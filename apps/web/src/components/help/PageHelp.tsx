import { featureIdsForLocation, guideForFeature, type GuideId } from '@qubedu/shared';
import { CircleHelp } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useT } from '@/lib/i18n';
import { GuideBody, useGuide } from './Guide';

/** The guide that explains the current page, if any. */
export function usePageGuide(): GuideId | null {
  const loc = useLocation();
  if (loc.pathname.startsWith('/help')) return null;
  for (const f of featureIdsForLocation(loc.pathname, loc.search)) {
    const g = guideForFeature(f);
    if (g) return g;
  }
  return null;
}

/** Top-bar "?" button: explains the current page in a dialog, or opens the help center. */
export function PageHelpButton({ className }: { className: string }) {
  const tr = useT();
  const navigate = useNavigate();
  const id = usePageGuide();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={tr.t('helpCenter.helpForPage')}
        title={tr.t('helpCenter.helpForPage')}
        onClick={() => (id ? setOpen(true) : navigate('/help'))}
      >
        <CircleHelp className="size-5" />
      </button>
      {id && open && <PageHelpDialog id={id} onClose={() => setOpen(false)} />}
    </>
  );
}

function PageHelpDialog({ id, onClose }: { id: GuideId; onClose: () => void }) {
  const tr = useT();
  const g = useGuide(id);
  return (
    <Modal
      open
      onClose={onClose}
      title={g.title}
      size="lg"
      footer={
        <ButtonLink to={`/help/${id}`} variant="ghost" size="sm" onClick={onClose}>
          {tr.t('helpCenter.fullGuide')}
        </ButtonLink>
      }
    >
      <GuideBody id={id} compact onNavigate={onClose} />
    </Modal>
  );
}
