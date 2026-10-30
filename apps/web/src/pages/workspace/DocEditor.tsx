import { Placeholder } from '@tiptap/extensions';
import TextAlign from '@tiptap/extension-text-align';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import { useEffect } from 'react';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { promptDialog } from '@/lib/ui';

function Tool({
  label,
  active,
  onClick,
  disabled,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cx('grid size-9 place-items-center rounded-lg disabled:opacity-40', active ? 'bg-soft text-ink' : 'hover:bg-bg-3')}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const tr = useT();
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      left: e.isActive({ textAlign: 'left' }),
      center: e.isActive({ textAlign: 'center' }),
      right: e.isActive({ textAlign: 'right' }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const t = (k: Parameters<typeof tr.t>[0]) => tr.t(k);
  const c = () => editor.chain().focus();
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line p-1.5" role="toolbar" aria-label={tr.t('workspace.title')}>
      <Tool label={t('workspace.toolbar.undo')} disabled={!s.canUndo} onClick={() => c().undo().run()}>
        <Undo2 className="size-4 flip-rtl" />
      </Tool>
      <Tool label={t('workspace.toolbar.redo')} disabled={!s.canRedo} onClick={() => c().redo().run()}>
        <Redo2 className="size-4 flip-rtl" />
      </Tool>
      <span className="mx-1 h-5 w-px bg-line" />
      <Tool label={t('workspace.toolbar.h1')} active={s.h1} onClick={() => c().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="size-4" />
      </Tool>
      <Tool label={t('workspace.toolbar.h2')} active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="size-4" />
      </Tool>
      <span className="mx-1 h-5 w-px bg-line" />
      <Tool label={t('workspace.toolbar.bold')} active={s.bold} onClick={() => c().toggleBold().run()}>
        <Bold className="size-4" />
      </Tool>
      <Tool label={t('workspace.toolbar.italic')} active={s.italic} onClick={() => c().toggleItalic().run()}>
        <Italic className="size-4" />
      </Tool>
      <Tool label={t('workspace.toolbar.underline')} active={s.underline} onClick={() => c().toggleUnderline().run()}>
        <Underline className="size-4" />
      </Tool>
      <Tool label={t('workspace.toolbar.strike')} active={s.strike} onClick={() => c().toggleStrike().run()}>
        <Strikethrough className="size-4" />
      </Tool>
      <Tool label={t('workspace.toolbar.code')} active={s.code} onClick={() => c().toggleCode().run()}>
        <Code className="size-4" />
      </Tool>
      <span className="mx-1 h-5 w-px bg-line" />
      <Tool label={t('workspace.toolbar.bullet')} active={s.bullet} onClick={() => c().toggleBulletList().run()}>
        <List className="size-4" />
      </Tool>
      <Tool label={t('workspace.toolbar.ordered')} active={s.ordered} onClick={() => c().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </Tool>
      <Tool label={t('workspace.toolbar.quote')} active={s.quote} onClick={() => c().toggleBlockquote().run()}>
        <Quote className="size-4" />
      </Tool>
      <Tool
        label={t('workspace.toolbar.link')}
        active={s.link}
        onClick={async () => {
          if (s.link) return void c().unsetLink().run();
          const url = await promptDialog({ title: t('workspace.toolbar.link'), input: { label: 'URL', placeholder: 'https://', type: 'url' } });
          if (url && /^https?:\/\//i.test(url)) c().setLink({ href: url }).run();
        }}
      >
        <Link2 className="size-4" />
      </Tool>
      <span className="mx-1 h-5 w-px bg-line" />
      <Tool label={`${t('workspace.toolbar.align')} 1`} active={s.left} onClick={() => c().setTextAlign('left').run()}>
        <AlignLeft className="size-4" />
      </Tool>
      <Tool label={`${t('workspace.toolbar.align')} 2`} active={s.center} onClick={() => c().setTextAlign('center').run()}>
        <AlignCenter className="size-4" />
      </Tool>
      <Tool label={`${t('workspace.toolbar.align')} 3`} active={s.right} onClick={() => c().setTextAlign('right').run()}>
        <AlignRight className="size-4" />
      </Tool>
    </div>
  );
}

export function DocEditor({ html, onChange, onReady }: { html: string; onChange: (html: string) => void; onReady?: (editor: Editor) => void }) {
  const tr = useT();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: tr.t('workspace.subtitle') }),
    ],
    content: html,
    editorProps: {
      attributes: {
        class: 'doc-content min-h-[60vh] px-6 py-6 outline-none',
        dir: 'auto',
        'aria-label': tr.t('workspace.kinds.doc'),
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });
  useEffect(() => {
    if (editor) onReady?.(editor);
  }, [editor, onReady]);
  if (!editor) return null;
  return (
    <div className="card overflow-hidden">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
