import { useMemo } from 'react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Trash2, Ungroup } from 'lucide-react';
import { countWords } from '@novelmaker/shared';
import { cn } from '../components/ui';
import { toast } from '../lib/store';
import { t, tn } from '../lib/i18n';

/** Rahmen um Absätze: einklappbar, für die KI ausblendbar, auflösbar. */
export function FrameView({ node, updateAttributes, getPos, editor }: NodeViewProps) {
  const title = String(node.attrs.title ?? '');
  const excluded = node.attrs.excluded !== false;
  const collapsed = !!node.attrs.collapsed;
  const text = useMemo(() => node.textBetween(0, node.content.size, ' ', ' '), [node]);
  const words = useMemo(() => countWords(text), [text]);

  /** Rahmen entfernen, Inhalt bleibt als normaler Text stehen */
  const unwrap = () => {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos == null) return;
    editor
      .chain()
      .command(({ tr }) => {
        const n = tr.doc.nodeAt(pos);
        if (n?.type.name !== 'frame') return false;
        tr.replaceWith(pos, pos + n.nodeSize, n.content);
        return true;
      })
      .run();
  };
  const remove = () => {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos == null) return;
    editor
      .chain()
      .command(({ tr }) => {
        const n = tr.doc.nodeAt(pos);
        if (n?.type.name !== 'frame') return false;
        tr.delete(pos, pos + n.nodeSize);
        return true;
      })
      .run();
    toast.info(t('Frame deleted — Ctrl+Z brings it back.'));
  };

  return (
    <NodeViewWrapper className={cn('frame-node', excluded && 'frame-excluded', collapsed && 'frame-collapsed')}>
      <div contentEditable={false} className="frame-head flex items-center gap-1.5 px-1.5 py-1 font-sans select-none">
        <button
          type="button"
          className="rounded p-0.5 text-violet-600 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-900/50"
          title={collapsed ? t('Unfold') : t('Collapse')}
          aria-label={collapsed ? t('Unfold') : t('Collapse')}
          onClick={() => updateAttributes({ collapsed: !collapsed })}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        <input
          value={title}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          placeholder={t('Frame')}
          aria-label={t('Frame title')}
          className="min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-medium text-violet-900 outline-none hover:border-violet-200 focus:border-violet-300 focus:bg-white dark:text-violet-100 dark:hover:border-violet-800 dark:focus:bg-stone-900"
        />
        <span className="shrink-0 text-[11px] text-stone-500 tabular-nums">
          {tn(words, '{n} word', '{n} words')}
        </span>
        <button
          type="button"
          onClick={() => updateAttributes({ excluded: !excluded })}
          title={
            excluded
              ? t('Hidden: not sent to the AI, not included in the word count, and not exported. Click to show.')
              : t('Shown: counts like normal text (AI, word count, export). Click to hide.')
          }
          className={cn(
            'inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium',
            excluded
              ? 'bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-900/60 dark:text-violet-200'
              : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-200',
          )}
        >
          {excluded ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {excluded ? t('hidden from the AI') : t('sent to the AI')}
        </button>
        <button
          type="button"
          onClick={unwrap}
          title={t('Dissolve frame — the text stays as normal text')}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-stone-600 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <Ungroup className="size-3.5" /> {t('Dissolve')}
        </button>
        <button
          type="button"
          onClick={remove}
          title={t('Delete frame including text')}
          aria-label={t('Delete frame including text')}
          className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {collapsed && (
        <button
          type="button"
          contentEditable={false}
          onClick={() => updateAttributes({ collapsed: false })}
          className="block w-full truncate px-3 pb-2 text-left font-serif text-[15px] text-stone-500 italic select-none hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
          title={t('Unfold')}
        >
          {text.trim() ? text.slice(0, 200) : t('empty')}
        </button>
      )}
      <NodeViewContent className={cn('frame-content', collapsed && 'hidden')} />
    </NodeViewWrapper>
  );
}
