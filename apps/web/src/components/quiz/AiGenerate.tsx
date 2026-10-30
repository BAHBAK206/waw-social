import type { QuizEditorDto } from '@qubedu/shared';
import type { Locale } from '@qubedu/i18n';
import { useQuery } from '@tanstack/react-query';
import { FileText, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { pickFile } from '@/components/ui/Upload';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toastError } from '@/lib/ui';

type Source = 'text' | 'lesson' | 'file';

/** Teacher tool: drafts questions from pasted text, one of the teacher's lessons or a document. */
export function AiGenerateDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (q: QuizEditorDto['questions']) => void }) {
  const tr = useT();
  const me = useSession((s) => s.me);
  const [source, setSource] = useState<Source>('text');
  const [text, setText] = useState('');
  const [videoId, setVideoId] = useState('');
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const lessons = useQuery({
    queryKey: ['my-lessons', me?.id],
    queryFn: () => api.videos.list({ ownerId: me!.id, limit: 50 }),
    enabled: open && source === 'lesson' && !!me,
  });
  const ready = source === 'text' ? text.trim().length >= 80 : source === 'lesson' ? !!videoId : !!file;
  const generate = async () => {
    setBusy(true);
    try {
      const res = await api.teacher.ai({
        task: 'quiz',
        count,
        language: tr.locale as Locale,
        ...(source === 'text' ? { text } : source === 'lesson' ? { videoId } : { fileUrl: file!.url }),
      });
      onAdd(res.questions ?? []);
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr.t('quiz.editor.generate')}
      footer={
        <Button icon={<Sparkles className="size-4" />} loading={busy} disabled={!ready} onClick={() => void generate()}>
          {tr.t('quiz.editor.generate')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {(['text', 'lesson', 'file'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={source === s}
              className={`chip ${source === s ? 'is-active' : ''}`}
              onClick={() => setSource(s)}
            >
              {tr.t(s === 'text' ? 'quiz.editor.sourceText' : s === 'lesson' ? 'quiz.editor.sourceLesson' : 'quiz.editor.sourceFile')}
            </button>
          ))}
        </div>
        {source === 'text' && (
          <Textarea
            label={tr.t('quiz.editor.sourceText')}
            placeholder={tr.t('quiz.editor.pasteLesson')}
            rows={8}
            value={text}
            maxLength={60000}
            onChange={(e) => setText(e.target.value)}
            dir="auto"
          />
        )}
        {source === 'lesson' && (
          <Select
            label={tr.t('quiz.editor.sourceLesson')}
            value={videoId}
            placeholder="—"
            onChange={(e) => setVideoId(e.target.value)}
            options={(lessons.data?.items ?? []).map((v) => ({ value: v.id, label: v.title }))}
          />
        )}
        {source === 'file' && (
          <Button
            variant="outline"
            icon={<FileText className="size-4" />}
            onClick={async () => {
              const f = await pickFile('.pdf,.docx,.pptx,.txt');
              if (!f) return;
              try {
                const up = await api.upload(f, f.name, 'assignment');
                setFile({ url: up.url, name: f.name });
              } catch (e) {
                toastError(e);
              }
            }}
          >
            {file ? file.name : tr.t('quiz.editor.sourceFile')}
          </Button>
        )}
        <Input
          type="number"
          min={1}
          max={20}
          label={tr.t('quiz.editor.questionCount')}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
        />
      </div>
    </Modal>
  );
}
