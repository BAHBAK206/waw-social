import { emailsIn, type CourseDto } from '@qubedu/shared';
import { useQueryClient } from '@tanstack/react-query';
import { FileUp, UserPlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

const MAX = 500;

/** Teachers add a whole class at once: paste emails or pick a CSV (a Google Classroom / school export). */
export function RosterImport({ course }: { course: CourseDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const emails = emailsIn(text);
  return (
    <>
      <Button size="sm" variant="soft" icon={<UserPlus className="size-4" />} onClick={() => setOpen(true)}>
        {tr.t('school.roster.open')}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={tr.t('school.roster.title')}
        footer={
          <Button
            loading={busy}
            disabled={!emails.length || emails.length > MAX}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api.school.roster(course.id, emails);
                toast(tr.t('school.roster.done', r));
                await qc.invalidateQueries({ queryKey: ['course', course.id, 'members'] });
                setText('');
                setOpen(false);
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr.t('school.roster.submit', { count: emails.length })}
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="muted text-sm">{tr.t('school.roster.hint')}</p>
          <input
            ref={file}
            type="file"
            accept=".csv,.txt,.tsv,text/csv,text/plain"
            className="sr-only"
            aria-label={tr.t('school.roster.file')}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.size > 2_000_000) return toast(tr.t('errors.file_too_large'), 'err');
              const found = emailsIn(await f.text());
              if (!found.length) return toast(tr.t('school.roster.none'), 'err');
              setText((prev) => [...new Set([...emailsIn(prev), ...found])].join('\n'));
            }}
          />
          <Button variant="outline" icon={<FileUp className="size-4" />} onClick={() => file.current?.click()}>
            {tr.t('school.roster.file')}
          </Button>
          <Textarea
            label={tr.t('school.roster.emails')}
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            dir="ltr"
            placeholder="name@school.edu"
          />
          <p className={emails.length > MAX ? 'text-sm text-err' : 'muted text-sm'}>{tr.t('school.roster.found', { count: emails.length, max: MAX })}</p>
        </div>
      </Modal>
    </>
  );
}
