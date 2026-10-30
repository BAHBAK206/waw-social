import { emailsIn } from '@qubedu/shared';
import { useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { pickDocument, Sheet } from './kit';
import { Button, Input, Text } from './ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

const MAX = 500;

/** Teachers add a whole class at once: a CSV (Google Classroom / school export) or pasted emails. */
export function RosterImport({ courseId }: { courseId: string }) {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const emails = emailsIn(text);
  return (
    <>
      <Button small variant="soft" icon="person-add-outline" title={tr.t('school.roster.open')} onPress={() => setOpen(true)} />
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={tr.t('school.roster.title')}
        footer={
          <Button
            title={tr.t('school.roster.submit', { count: emails.length })}
            loading={busy}
            disabled={!emails.length || emails.length > MAX}
            onPress={async () => {
              setBusy(true);
              try {
                const r = await api.school.roster(courseId, emails);
                toast(tr.t('school.roster.done', r));
                await qc.invalidateQueries({ queryKey: ['course', courseId, 'members'] });
                setText('');
                setOpen(false);
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          />
        }
      >
        <Text muted size={13}>
          {tr.t('school.roster.hint')}
        </Text>
        <Button
          variant="outline"
          icon="document-attach-outline"
          title={tr.t('school.roster.file')}
          onPress={async () => {
            try {
              const f = await pickDocument(['text/csv', 'text/comma-separated-values', 'text/plain', 'text/tab-separated-values', 'application/vnd.ms-excel']);
              if (!f) return;
              if (f.size > 2_000_000) return toast(tr.t('errors.file_too_large'), 'err');
              const found = emailsIn(await new File(f.uri).text());
              if (!found.length) return toast(tr.t('school.roster.none'), 'err');
              setText((prev) => [...new Set([...emailsIn(prev), ...found])].join('\n'));
            } catch (e) {
              toastError(e);
            }
          }}
        />
        <Input
          label={tr.t('school.roster.emails')}
          value={text}
          onChangeText={setText}
          multiline
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="name@school.edu"
          style={{ minHeight: 120, textAlign: 'left', writingDirection: 'ltr' }}
        />
        <Text muted size={12} style={emails.length > MAX ? { color: t.err } : undefined}>
          {tr.t('school.roster.found', { count: emails.length, max: MAX })}
        </Text>
      </Sheet>
    </>
  );
}
