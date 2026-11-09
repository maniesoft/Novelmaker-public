import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BubbleMenu, EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Minimize2, Maximize2, Pencil, PenLine, Pin, PinOff, Sparkles, SquareDashed, StickyNote, Wand2, Zap } from 'lucide-react';
import { CodexMatcher, codexTypeLabel, effectiveCodex, countWords, docToPlainText, novelLangCode, type CodexEntry, type PMDoc } from '@novelmaker/shared';
import { useCodex, useNovel } from '../lib/queries';
import { toast, useUi } from '../lib/store';
import { Badge, cn, IconButton } from '../components/ui';
import { Beat, CodexHighlight, FocusBlock, Frame, frameStamp, HiddenNote, runSlashCommand, setCodexMatcher, setSlashIndex, SlashCommands, slashKey, type SlashCommandId } from './extensions';
import { registerSaver, SceneSaver, SceneScopeContext, useActiveEditor } from './scope';
import { useContinue, useRewrite } from './RewritePanel';
import { openCodexModal } from '../components/CodexModal';
import { isPinned, togglePin, usePins } from '../lib/pins';
import { t } from '../lib/i18n';

export function useCodexMatcher(novelId: string) {
  const { data } = useCodex(novelId);
  // Band-Fassungen ersetzen gleichnamige Serien-Einträge (wie im Prompt)
  return useMemo(() => (data ? new CodexMatcher(effectiveCodex(data.entries).entries) : null), [data]);
}

/** Attribute des Editor-Elements; `lang` = Sprache des Romans (für die Rechtschreibprüfung) */
const editorAttributes = (lang: string) => ({ role: 'textbox', class: 'prose-doc min-h-[50vh]', spellcheck: 'true', lang });

interface Props {
  novelId: string;
  sceneId: string;
  content: PMDoc;
  autoFocus?: boolean;
  onWords?: (n: number) => void;
  placeholder?: string;
  className?: string;
}

export function SceneEditor({ novelId, sceneId, content, autoFocus, onWords, placeholder, className }: Props) {
  const saver = useMemo(() => new SceneSaver(sceneId, novelId, content), [sceneId]); // eslint-disable-line react-hooks/exhaustive-deps
  const matcher = useCodexMatcher(novelId);
  const { data: novel } = useNovel(novelId);
  const lang = novelLangCode(novel?.language);
  const setActive = useActiveEditor((s) => s.set);
  const wordsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWordsRef = useRef(onWords);
  onWordsRef.current = onWords;

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, code: false }),
        Placeholder.configure({ placeholder: placeholder ?? t('Start writing… (“/” at the start of a line or Ctrl+Shift+B inserts a beat)') }),
        Beat,
        HiddenNote,
        Frame,
        CodexHighlight,
        FocusBlock,
        SlashCommands.configure({
          onContinue: (ed) => useContinue.getState().open({ editor: ed, sceneId, novelId, pos: ed.state.selection.to }),
        }),
      ],
      content,
      autofocus: autoFocus ? 'end' : false,
      editorProps: { attributes: editorAttributes(lang) },
      onUpdate: ({ editor }) => {
        saver.schedule(editor);
        if (wordsTimer.current) clearTimeout(wordsTimer.current);
        wordsTimer.current = setTimeout(() => onWordsRef.current?.(countWords(docToPlainText(editor.getJSON() as PMDoc))), 300);
      },
      onFocus: ({ editor }) => setActive(editor, sceneId, novelId),
      onCreate: ({ editor }) => {
        if (autoFocus) setActive(editor, sceneId, novelId);
      },
    },
    [sceneId],
  );

  useEffect(() => {
    if (editor && !editor.isDestroyed) setCodexMatcher(editor, matcher);
  }, [editor, matcher]);

  // Sprache des Romans kann nach dem Anlegen des Editors geladen werden oder sich ändern
  useEffect(() => {
    if (!editor || editor.isDestroyed || editor.view.dom.getAttribute('lang') === lang) return;
    editor.setOptions({ editorProps: { attributes: editorAttributes(lang) } });
  }, [editor, lang]);

  useEffect(() => {
    const onUnload = () => saver.flushOnUnload();
    window.addEventListener('beforeunload', onUnload);
    const unregister = registerSaver(saver);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', onUnload);
      void saver.flush();
      const st = useActiveEditor.getState();
      if (st.sceneId === sceneId) st.set(null, null, null);
    };
  }, [saver, sceneId]);

  return (
    <SceneScopeContext.Provider value={{ novelId, sceneId }}>
      <div className={cn('relative', className)}>
        <EditorContent editor={editor} />
        {editor && <SelectionMenu editor={editor} sceneId={sceneId} novelId={novelId} />}
        {editor && <CodexHover editor={editor} novelId={novelId} />}
        {editor && <SlashMenu editor={editor} />}
      </div>
    </SceneScopeContext.Provider>
  );
}

// ---------------------------------------------------------------- Auswahlmenü

function SelectionMenu({ editor, sceneId, novelId }: { editor: Editor; sceneId: string; novelId: string }) {
  const open = useRewrite((s) => s.open);
  const dialogOpen = useRewrite((s) => s.target !== null);
  const tippyRef = useRef<{ hide: () => void } | null>(null);
  // Die Menü-Knöpfe lassen den Fokus im Editor, deshalb blendet TipTap das Menü beim Öffnen des
  // Umschreiben-Dialogs nicht von selbst aus – es läge sonst über dem Dialog.
  useEffect(() => {
    if (dialogOpen) tippyRef.current?.hide();
  }, [dialogOpen]);
  const run = (key: string) => {
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, '\n\n');
    if (!text.trim()) return;
    open({ editor, sceneId, novelId, from, to, original: text, builtinKey: key });
  };
  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        duration: 120,
        maxWidth: 'none',
        onCreate: (instance) => {
          tippyRef.current = instance;
        },
      }}
      shouldShow={({ editor, from, to }) => {
        if (from === to || !editor.isEditable || useRewrite.getState().target) return false;
        const { $from } = editor.state.selection;
        for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'beat') return false;
        return editor.state.doc.textBetween(from, to).trim().length > 0;
      }}
    >
      <div className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white p-1 font-sans shadow-lg dark:border-stone-700 dark:bg-stone-900">
        <IconButton title={t('Bold')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="size-3.5" />
        </IconButton>
        <IconButton title={t('Italic')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="size-3.5" />
        </IconButton>
        <div className="mx-1 h-4 w-px bg-stone-200 dark:bg-stone-700" />
        <MenuBtn icon={<Wand2 className="size-3.5" />} onClick={() => run('rewrite')}>
          {t('Rewrite')}
        </MenuBtn>
        <MenuBtn icon={<Minimize2 className="size-3.5" />} onClick={() => run('shorten')}>
          {t('Shorten')}
        </MenuBtn>
        <MenuBtn icon={<Maximize2 className="size-3.5" />} onClick={() => run('expand')}>
          {t('Expand')}
        </MenuBtn>
        <MenuBtn icon={<PenLine className="size-3.5" />} onClick={() => run('custom-edit')}>
          {t('Instruction…')}
        </MenuBtn>
        {!editor.isActive('frame') && (
          <>
            <div className="mx-1 h-4 w-px bg-stone-200 dark:bg-stone-700" />
            <MenuBtn
              icon={<SquareDashed className="size-3.5" />}
              title={t('Put the selected text in a frame — collapsible, hidden from the AI, can be dissolved later')}
              onClick={() => {
                if (!editor.chain().focus().wrapInFrame({ title: t('Stashed · {date}', { date: frameStamp() }) }).run()) toast.error(t('A frame can’t be created here.'));
              }}
            >
              {t('Frame')}
            </MenuBtn>
          </>
        )}
      </div>
    </BubbleMenu>
  );
}

function MenuBtn({ icon, children, onClick, title }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[13px] text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
    >
      {icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- „/“-Menü

const SLASH_ICON: Record<SlashCommandId, React.ReactNode> = {
  beat: <Zap className="size-4 text-amber-600" />,
  note: <StickyNote className="size-4 text-sky-600" />,
  frame: <SquareDashed className="size-4 text-violet-600" />,
  continue: <Sparkles className="size-4 text-stone-500" />,
};

function SlashMenu({ editor }: { editor: Editor }) {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    editor.on('transaction', rerender);
    editor.on('focus', rerender);
    editor.on('blur', rerender);
    window.addEventListener('scroll', rerender, true);
    window.addEventListener('resize', rerender);
    return () => {
      editor.off('transaction', rerender);
      editor.off('focus', rerender);
      editor.off('blur', rerender);
      window.removeEventListener('scroll', rerender, true);
      window.removeEventListener('resize', rerender);
    };
  }, [editor]);
  if (editor.isDestroyed || !editor.isFocused) return null;
  const st = slashKey.getState(editor.state)?.active;
  if (!st) return null;
  const c = editor.view.coordsAtPos(st.from);
  const height = 40 + st.items.length * 44;
  const top = c.bottom + 6 + height > window.innerHeight ? c.top - 6 - height : c.bottom + 6;
  return createPortal(
    <div
      className="fixed z-40 w-72 rounded-lg border border-stone-200 bg-white p-1 font-sans shadow-xl dark:border-stone-700 dark:bg-stone-900"
      style={{ top: Math.max(8, top), left: Math.min(c.left, window.innerWidth - 296) }}
      role="listbox"
      aria-label={t('Commands')}
    >
      {st.items.map((cmd, i) => (
        <button
          key={cmd.id}
          type="button"
          role="option"
          aria-selected={i === st.index}
          onMouseDown={(e) => {
            e.preventDefault();
            runSlashCommand(editor, cmd.id);
          }}
          onMouseEnter={() => i !== st.index && setSlashIndex(editor, i)}
          className={cn('flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left', i === st.index && 'bg-amber-50 dark:bg-amber-950/40')}
        >
          {SLASH_ICON[cmd.id]}
          <span className="min-w-0">
            <span className="block text-sm font-medium text-stone-800 dark:text-stone-100">{t(cmd.label)}</span>
            <span className="block truncate text-[11px] text-stone-500">{t(cmd.hint)}</span>
          </span>
        </button>
      ))}
      <div className="border-t border-stone-100 px-2 pt-1 pb-0.5 text-[10.5px] text-stone-400 dark:border-stone-800">{t('↑↓ select · Enter run · Esc close')}</div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Kodex-Karte beim Drüberfahren

function CodexHover({ editor, novelId }: { editor: Editor; novelId: string }) {
  const { data } = useCodex(novelId);
  const showMentions = useUi((s) => s.showMentions);
  const pins = usePins(novelId);
  const [hover, setHover] = useState<{ entry: CodexEntry; rect: DOMRect } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const byId = useMemo(() => new Map((data?.entries ?? []).map((e) => [e.id, e])), [data]);

  useEffect(() => {
    const dom = editor.view.dom;
    const over = (e: MouseEvent) => {
      if (!showMentions) return;
      const el = (e.target as HTMLElement).closest?.('.codex-mention') as HTMLElement | null;
      if (!el) return;
      const entry = byId.get(el.dataset.codexId ?? '');
      if (!entry) return;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setHover({ entry, rect: el.getBoundingClientRect() });
    };
    const out = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest?.('.codex-mention')) {
        hideTimer.current = setTimeout(() => setHover(null), 250);
      }
    };
    // Strg+Klick auf eine Erwähnung: Eintrag direkt über dem Text bearbeiten
    const click = (e: MouseEvent) => {
      if (!showMentions || !(e.ctrlKey || e.metaKey)) return;
      const el = (e.target as HTMLElement).closest?.('.codex-mention') as HTMLElement | null;
      const id = el?.dataset.codexId;
      if (!id || !byId.has(id)) return;
      e.preventDefault();
      setHover(null);
      openCodexModal(novelId, id);
    };
    dom.addEventListener('mouseover', over);
    dom.addEventListener('mouseout', out);
    dom.addEventListener('click', click);
    return () => {
      dom.removeEventListener('mouseover', over);
      dom.removeEventListener('mouseout', out);
      dom.removeEventListener('click', click);
    };
  }, [editor, byId, showMentions, novelId]);

  if (!hover) return null;
  const { entry, rect } = hover;
  const type = codexTypeLabel(entry.type);
  const top = rect.bottom + 6 + 260 > window.innerHeight ? rect.top - 6 - 260 : rect.bottom + 6;
  return createPortal(
    <div
      className="fixed z-40 w-80 rounded-lg border border-stone-200 bg-white p-3 font-sans shadow-xl dark:border-stone-700 dark:bg-stone-900"
      style={{ top: Math.max(8, top), left: Math.min(rect.left, window.innerWidth - 336) }}
      onMouseEnter={() => hideTimer.current && clearTimeout(hideTimer.current)}
      onMouseLeave={() => setHover(null)}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{entry.name}</div>
          {entry.aliases.length > 0 && <div className="text-xs text-stone-500">{entry.aliases.join(', ')}</div>}
        </div>
        <Badge tone="amber">{type}</Badge>
      </div>
      <p className="mt-2 line-clamp-6 text-sm whitespace-pre-wrap text-stone-600 dark:text-stone-300">{entry.description || <i>{t('No description.')}</i>}</p>
      <div className="mt-2 flex items-center gap-3 text-xs font-medium">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-amber-700 hover:underline dark:text-amber-400"
          title={t('Edit over the text — afterwards you’re back in the same spot (also: Ctrl+click the name)')}
          onClick={() => {
            setHover(null);
            openCodexModal(novelId, entry.id);
          }}
        >
          <Pencil className="size-3" /> {t('Edit')}
        </button>
        <button type="button" className="inline-flex items-center gap-1 text-stone-600 hover:underline dark:text-stone-300" onClick={() => void togglePin(novelId, 'codex', entry.id)}>
          {isPinned(pins, 'codex', entry.id) ? (
            <>
              <PinOff className="size-3" /> {t('Unpin')}
            </>
          ) : (
            <>
              <Pin className="size-3" /> {t('Pin next to the text')}
            </>
          )}
        </button>
      </div>
    </div>,
    document.body,
  );
}
