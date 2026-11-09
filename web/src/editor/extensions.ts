import { Extension, mergeAttributes, Node, type Editor } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { findWrapping } from '@tiptap/pm/transform';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { makeId, type CodexMatcher } from '@novelmaker/shared';
import { BeatView } from './BeatView';
import { FrameView } from './FrameView';
import { locale, N_, t } from '../lib/i18n';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    novelBlocks: {
      insertBeat: (text?: string) => ReturnType;
      insertNote: () => ReturnType;
    };
    frame: {
      /** Markierten Text (genau ab/bis Markierung) in einen Rahmen legen */
      wrapInFrame: (attrs?: Partial<FrameAttrs>) => ReturnType;
      /** Leeren Rahmen hinter dem aktuellen Absatz einfügen */
      insertFrame: (attrs?: Partial<FrameAttrs>) => ReturnType;
    };
  }
}

export interface FrameAttrs {
  title: string;
  /** nicht an die KI, nicht in Wortzahl und Export */
  excluded: boolean;
  collapsed: boolean;
}

/** z. B. „09.11. 14:32“ für Rahmentitel */
export function frameStamp(d = new Date()): string {
  return `${d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`;
}

export const BEAT_GENERATE_EVENT = 'nm-beat-generate';

function inBlock(editor: Editor, name: string) {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === name) return true;
  return false;
}

/** Fügt einen Block hinter dem aktuellen Absatz ein (oder ersetzt einen leeren Absatz). Arbeitet auf der Command-Transaktion. */
function insertBlock(tr: Transaction, type: string, attrs: Record<string, unknown>, text?: string) {
  const schema = tr.doc.type.schema;
  const content = text ? schema.text(text) : undefined;
  return insertBlockNode(tr, schema.nodes[type].create(attrs, content), 1 + (content ? content.nodeSize : 0));
}

/** Wie insertBlock, für einen fertigen Knoten; `cursor` = Abstand der Schreibmarke vom Knotenanfang. */
function insertBlockNode(tr: Transaction, node: PMNode, cursor: number) {
  const { $from } = tr.selection;
  let insertPos: number;
  if ($from.depth >= 1) {
    const top = $from.node(1);
    const start = $from.before(1);
    if (top.type.name === 'paragraph' && top.content.size === 0) {
      tr.replaceWith(start, start + top.nodeSize, node);
      insertPos = start;
    } else {
      insertPos = $from.after(1);
      tr.insert(insertPos, node);
    }
  } else {
    insertPos = $from.pos;
    tr.insert(insertPos, node);
  }
  tr.setSelection(TextSelection.create(tr.doc, insertPos + cursor));
  tr.scrollIntoView();
  return true;
}

export const Beat = Node.create({
  name: 'beat',
  group: 'block',
  content: 'inline*',
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-id'),
        renderHTML: (attrs) => ({ 'data-id': attrs.id }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="beat"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'beat', class: 'beat-node' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(BeatView);
  },
  addCommands() {
    return {
      insertBeat:
        (text?: string) =>
        ({ tr, dispatch }) =>
          dispatch ? insertBlock(tr, 'beat', { id: makeId() }, text) : true,
      insertNote:
        () =>
        ({ tr, dispatch }) =>
          dispatch ? insertBlock(tr, 'hiddenNote', {}) : true,
    };
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-b': () => this.editor.chain().insertBeat().focus().run(),
      'Mod-Alt-b': () => this.editor.chain().insertBeat().focus().run(),
      'Mod-Alt-n': () => this.editor.chain().insertNote().focus().run(),
      Enter: () => {
        if (inBlock(this.editor, 'beat') || inBlock(this.editor, 'hiddenNote')) return this.editor.commands.setHardBreak();
        return false;
      },
      'Mod-Enter': () => {
        const { $from } = this.editor.state.selection;
        for (let d = $from.depth; d > 0; d--) {
          const n = $from.node(d);
          if (n.type.name === 'beat') {
            window.dispatchEvent(new CustomEvent(BEAT_GENERATE_EVENT, { detail: n.attrs.id }));
            return true;
          }
        }
        return false;
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      // Beats brauchen eindeutige IDs; nach einem Beat/einer Notiz am Ende immer ein Absatz
      new Plugin({
        appendTransaction: (_trs, _old, state) => {
          const seen = new Set<string>();
          let tr = state.tr;
          let changed = false;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'beat') return node.isBlock;
            const id = node.attrs.id as string | null;
            if (!id || seen.has(id)) {
              tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: makeId() });
              changed = true;
            } else seen.add(id);
            return false;
          });
          const last = tr.doc.lastChild;
          if (last && (last.type.name === 'beat' || last.type.name === 'hiddenNote' || last.type.name === 'frame')) {
            tr = tr.insert(tr.doc.content.size, state.schema.nodes.paragraph.create());
            changed = true;
          }
          return changed ? tr.setMeta('addToHistory', false) : null;
        },
      }),
    ];
  },
});

export const HiddenNote = Node.create({
  name: 'hiddenNote',
  group: 'block',
  content: 'inline*',
  defining: true,
  isolating: true,
  parseHTML() {
    return [{ tag: 'div[data-type="note"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'note', class: 'note-node' }), 0];
  },
});

// ---------------------------------------------------------------- Rahmen (Varianten, Zwischenstände)

/** Was in einem Rahmen stehen darf – alles außer weiteren Rahmen */
const FRAME_CONTENT = '(paragraph | heading | blockquote | bulletList | orderedList | horizontalRule | beat | hiddenNote)+';

const frameAttrs = (attrs: Partial<FrameAttrs> = {}): FrameAttrs => ({ title: '', excluded: true, collapsed: false, ...attrs });

export const Frame = Node.create({
  name: 'frame',
  group: 'block',
  content: FRAME_CONTENT,
  defining: true,
  addAttributes() {
    return {
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-title') ?? '',
        renderHTML: (attrs) => ({ 'data-title': attrs.title }),
      },
      excluded: {
        default: true,
        parseHTML: (el) => el.getAttribute('data-excluded') !== 'false',
        renderHTML: (attrs) => ({ 'data-excluded': String(attrs.excluded) }),
      },
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-collapsed') === 'true',
        renderHTML: (attrs) => ({ 'data-collapsed': String(attrs.collapsed) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="frame"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'frame', class: 'frame-node' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FrameView);
  },
  addCommands() {
    return {
      wrapInFrame:
        (attrs) =>
        ({ tr, dispatch }) => {
          const type = tr.doc.type.schema.nodes.frame;
          let { from, to } = tr.selection;
          // endet die Markierung ganz vorne im nächsten Absatz, gehört dieser nicht dazu
          const $end = tr.doc.resolve(to);
          if (to > from && $end.depth === 1 && $end.parentOffset === 0) to = Math.max(from, $end.before(1) - 1);
          const wrappable = (a: number, b: number) => {
            const range = tr.doc.resolve(a).blockRange(tr.doc.resolve(b), (n) => n.type.name === 'doc');
            const wrapping = range && findWrapping(range, type, frameAttrs(attrs));
            return range && wrapping ? { range, wrapping } : null;
          };
          if (!wrappable(from, to)) return false;
          if (!dispatch) return true;
          // Absätze an den Rändern teilen, damit genau der markierte Text in den Rahmen kommt
          const inMiddle = (pos: number) => {
            const $p = tr.doc.resolve(pos);
            return $p.depth === 1 && $p.parent.isTextblock && $p.parentOffset > 0 && $p.parentOffset < $p.parent.content.size;
          };
          if (inMiddle(to)) tr.split(to);
          if (inMiddle(from)) {
            tr.split(from);
            from += 2;
            to += 2;
          }
          const w = wrappable(from, to);
          if (!w) return false;
          tr.wrap(w.range, w.wrapping);
          tr.setSelection(TextSelection.near(tr.doc.resolve(tr.selection.to)));
          return true;
        },
      insertFrame:
        (attrs) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true;
          const schema = tr.doc.type.schema;
          return insertBlockNode(tr, schema.nodes.frame.create(frameAttrs(attrs), schema.nodes.paragraph.create()), 2);
        },
    };
  },
});

// ---------------------------------------------------------------- Kodex-Hervorhebung

export const codexKey = new PluginKey<DecorationSet>('codexHighlight');

function buildDecorations(doc: PMNode, matcher: CodexMatcher | null): DecorationSet {
  if (!matcher || !matcher.entryCount) return DecorationSet.empty;
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, undefined, '￼');
    for (const m of matcher.findMentions(text)) {
      decos.push(Decoration.inline(pos + 1 + m.start, pos + 1 + m.end, { class: 'codex-mention', 'data-codex-id': m.entryId }));
    }
    return false;
  });
  return DecorationSet.create(doc, decos);
}

export interface CodexHighlightStorage {
  matcher: CodexMatcher | null;
}

export const CodexHighlight = Extension.create<object, CodexHighlightStorage>({
  name: 'codexHighlight',
  addStorage() {
    return { matcher: null };
  },
  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin<DecorationSet>({
        key: codexKey,
        state: {
          init: (_cfg, state) => buildDecorations(state.doc, storage.matcher),
          apply: (tr, old, _oldState, newState) => {
            if (tr.docChanged || tr.getMeta(codexKey)) return buildDecorations(newState.doc, storage.matcher);
            return old;
          },
        },
        props: {
          decorations: (state) => codexKey.getState(state),
        },
      }),
    ];
  },
});

export function setCodexMatcher(editor: Editor, matcher: CodexMatcher | null) {
  const storage = editor.storage.codexHighlight as CodexHighlightStorage | undefined;
  if (!storage || editor.isDestroyed) return;
  storage.matcher = matcher;
  editor.view.dispatch(editor.state.tr.setMeta(codexKey, true).setMeta('addToHistory', false));
}

// ---------------------------------------------------------------- Befehle mit „/“ am Zeilenanfang

export type SlashCommandId = 'beat' | 'note' | 'frame' | 'continue';

export interface SlashCommand {
  id: SlashCommandId;
  /** deutscher Text, angezeigt wird t(label) */
  label: string;
  /** deutscher Text, angezeigt wird t(hint) */
  hint: string;
  keywords: string[];
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'beat', label: N_('Beat'), hint: N_('Instruction for the AI · Ctrl+Shift+B'), keywords: ['beat', 'anweisung', 'ki', 'instruction', 'ai'] },
  { id: 'note', label: N_('Note'), hint: N_('Hidden, not sent to the AI · Ctrl+Alt+N'), keywords: ['notiz', 'note', 'kommentar', 'comment', 'hidden'] },
  {
    id: 'frame',
    label: N_('Frame'),
    hint: N_('For a variant — collapsible, hidden from the AI'),
    keywords: ['rahmen', 'variante', 'frame', 'ablage', 'variant', 'stash'],
  },
  { id: 'continue', label: N_('Continue writing'), hint: N_('The AI continues writing from here'), keywords: ['weiterschreiben', 'continue', 'fortsetzen', 'write'] },
];

export interface SlashMenuState {
  /** Position des „/“ */
  from: number;
  /** Cursor (Ende der Eingabe) */
  to: number;
  query: string;
  items: SlashCommand[];
  index: number;
}

interface SlashPluginState {
  active: SlashMenuState | null;
  /** mit Esc geschlossen: an dieser Position nicht wieder öffnen, bis das „/“ weg ist */
  dismissed: number | null;
}

type SlashMeta = { type: 'close' } | { type: 'move'; delta: number } | { type: 'select'; index: number };

export const slashKey = new PluginKey<SlashPluginState>('slashMenu');

export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase();
  // übersetzter Name, deutscher Name oder Stichwort
  return SLASH_COMMANDS.filter(
    (c) => !q || t(c.label).toLowerCase().startsWith(q) || c.label.toLowerCase().startsWith(q) || c.keywords.some((k) => k.startsWith(q)),
  );
}

/** Absatz auf oberster Ebene, der nur aus „/…“ besteht, Cursor am Ende */
function matchSlash(state: EditorState): { from: number; to: number; query: string } | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if ($from.depth !== 1 || $from.parent.type.name !== 'paragraph') return null;
  if ($from.parentOffset !== $from.parent.content.size) return null;
  const m = /^\/([\p{L}\p{N}-]{0,24})$/u.exec($from.parent.textBetween(0, $from.parentOffset, undefined, '￼'));
  return m ? { from: $from.start(), to: $from.pos, query: m[1] } : null;
}

export interface SlashOptions {
  /** „Weiterschreiben“ öffnen (braucht Szene/Roman, kommt vom SceneEditor) */
  onContinue?: (editor: Editor) => void;
}

/** Führt einen Befehl aus dem „/“-Menü aus und entfernt dabei das eingetippte „/…“. */
export function runSlashCommand(editor: Editor, id: SlashCommandId) {
  const st = slashKey.getState(editor.state)?.active;
  if (!st) return false;
  const range = { from: st.from, to: st.to };
  if (id === 'beat') return editor.chain().focus().deleteRange(range).insertBeat().run();
  if (id === 'note') return editor.chain().focus().deleteRange(range).insertNote().run();
  if (id === 'frame') return editor.chain().focus().deleteRange(range).insertFrame({ title: t('Variant · {date}', { date: frameStamp() }) }).run();
  editor.chain().focus().deleteRange(range).run();
  const opts = editor.extensionManager.extensions.find((e) => e.name === 'slashCommands')?.options as SlashOptions | undefined;
  opts?.onContinue?.(editor);
  return true;
}

export function setSlashIndex(editor: Editor, index: number) {
  editor.view.dispatch(editor.state.tr.setMeta(slashKey, { type: 'select', index } satisfies SlashMeta));
}

export const SlashCommands = Extension.create<SlashOptions>({
  name: 'slashCommands',
  // vor den Tasten der anderen Erweiterungen (Enter im Beat usw.)
  priority: 1000,
  addOptions() {
    return { onContinue: undefined };
  },
  addKeyboardShortcuts() {
    const active = () => slashKey.getState(this.editor.state)?.active ?? null;
    const meta = (m: SlashMeta) => {
      if (!active()) return false;
      this.editor.view.dispatch(this.editor.state.tr.setMeta(slashKey, m));
      return true;
    };
    const run = () => {
      const st = active();
      return st ? runSlashCommand(this.editor, st.items[st.index].id) : false;
    };
    return {
      ArrowDown: () => meta({ type: 'move', delta: 1 }),
      ArrowUp: () => meta({ type: 'move', delta: -1 }),
      Enter: run,
      Tab: run,
      Escape: () => meta({ type: 'close' }),
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin<SlashPluginState>({
        key: slashKey,
        state: {
          init: () => ({ active: null, dismissed: null }),
          apply: (tr, prev, _old, state) => {
            const m = tr.getMeta(slashKey) as SlashMeta | undefined;
            const match = matchSlash(state);
            if (!match) return { active: null, dismissed: null };
            const dismissed = prev.dismissed != null ? tr.mapping.map(prev.dismissed) : null;
            if (m?.type === 'close') return { active: null, dismissed: match.from };
            if (dismissed === match.from) return { active: null, dismissed };
            const items = filterSlashCommands(match.query);
            if (!items.length) return { active: null, dismissed: null };
            let index = prev.active && prev.active.query === match.query ? prev.active.index : 0;
            if (m?.type === 'move') index = (index + m.delta + items.length) % items.length;
            if (m?.type === 'select') index = m.index;
            return { active: { ...match, items, index: Math.max(0, Math.min(index, items.length - 1)) }, dismissed: null };
          },
        },
      }),
    ];
  },
});

// ---------------------------------------------------------------- Fokus: aktueller Absatz

export const FocusBlock = Extension.create({
  name: 'focusBlock',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const { $from } = state.selection;
            if ($from.depth < 1) return null;
            const start = $from.before(1);
            const node = state.doc.nodeAt(start);
            if (!node) return null;
            return DecorationSet.create(state.doc, [Decoration.node(start, start + node.nodeSize, { class: 'has-focus' })]);
          },
        },
      }),
    ];
  },
});
