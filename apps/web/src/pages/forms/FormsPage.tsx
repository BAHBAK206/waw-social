import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, ClipboardList, Copy, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/Button';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { useSession } from '@/lib/session';
import { confirmDialog, toast, toastError } from '@/lib/ui';

export default function FormsPage() {
  const tr = useT();
  const qc = useQueryClient();
  const authed = useSession((s) => s.status === 'authed');
  const q = useQuery({ queryKey: qk.forms, queryFn: () => api.forms.mine(), enabled: authed });
  return (
    <div className="page">
      <PageHeader
        title={tr.t('forms.title')}
        subtitle={tr.t('forms.subtitle')}
        icon={<ClipboardList className="size-6" />}
        actions={
          <ButtonLink to={authed ? '/forms/new' : '/login?next=/forms/new'} icon={<Plus className="size-4" />}>
            {tr.t('forms.newForm')}
          </ButtonLink>
        }
      />
      {!authed ? (
        <EmptyState
          icon={<ClipboardList className="size-7" />}
          title={tr.t('common.signInToContinue')}
          action={<ButtonLink to="/login?next=/forms">{tr.t('nav.signIn')}</ButtonLink>}
        />
      ) : (
        <QueryState query={q} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<ClipboardList className="size-7" />} title={tr.t('forms.empty')} />}>
          {(d) => (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {d.items.map((f) => (
                <article key={f.id} className="card flex flex-col overflow-hidden">
                  <div className="h-2" style={{ background: f.settings.color }} />
                  <div className="flex-1 p-4">
                    <div className="mb-1 flex items-center gap-2">
                      <span className={f.published ? 'badge badge-ok' : 'badge badge-warn'}>
                        {f.published ? tr.t('common.published') : tr.t('common.draft')}
                      </span>
                      {f.settings.quizMode && <span className="badge badge-primary">{tr.t('forms.quizMode')}</span>}
                    </div>
                    <h2 className="line-clamp-2 text-lg font-black" dir="auto">
                      {f.title || tr.t('forms.untitled')}
                    </h2>
                    <p className="muted mt-1 text-sm">
                      {tr.t('forms.responses', { count: f.responseCount })} · {formatDate(f.updatedAt, tr)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 border-t border-line p-2">
                    <ButtonLink to={`/forms/${f.id}/edit`} size="sm" variant="ghost" icon={<Pencil className="size-4" />}>
                      {tr.t('common.edit')}
                    </ButtonLink>
                    <ButtonLink to={`/forms/${f.id}/responses`} size="sm" variant="ghost" icon={<BarChart3 className="size-4" />}>
                      {tr.t('forms.analytics')}
                    </ButtonLink>
                    <span className="flex-1" />
                    <IconButton
                      label={tr.t('forms.copyLink')}
                      size="sm"
                      onClick={() => void navigator.clipboard.writeText(`${location.origin}/f/${f.slug}`).then(() => toast(tr.t('common.copied')))}
                    >
                      <Link2 className="size-4" />
                    </IconButton>
                    <IconButton
                      label={tr.t('common.duplicate')}
                      size="sm"
                      onClick={async () => {
                        try {
                          await api.forms.duplicate(f.id);
                          await qc.invalidateQueries({ queryKey: qk.forms });
                        } catch (e) {
                          toastError(e);
                        }
                      }}
                    >
                      <Copy className="size-4" />
                    </IconButton>
                    <IconButton
                      label={tr.t('common.delete')}
                      size="sm"
                      onClick={async () => {
                        if (!(await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
                        try {
                          await api.forms.remove(f.id);
                          await qc.invalidateQueries({ queryKey: qk.forms });
                        } catch (e) {
                          toastError(e);
                        }
                      }}
                    >
                      <Trash2 className="size-4 text-err" />
                    </IconButton>
                  </div>
                </article>
              ))}
            </div>
          )}
        </QueryState>
      )}
    </div>
  );
}
