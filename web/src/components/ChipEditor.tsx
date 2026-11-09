// Fließtext-Editor mit Platzhalter-Chips: {{Name}} erscheint als Chip und verhält sich wie ein Zeichen.
// Einfügen über den Knopf „Platzhalter“ oder durch Tippen von {{ (Vorschlagsliste).
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { Decoration, drawSelection, EditorView, keymap, MatchDecorator, placeholder as cmPlaceholder, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import type { ChipStatus } from '@novelmaker/shared';
import { t } from '../lib/i18n';

export interface ChipChoice {
  name: string;
  detail: string;
}

export interface ChipEditorHandle {
  insert: (name: string) => void;
}

class ChipWidget extends WidgetType {
  constructor(
    readonly name: string,
    readonly status: ChipStatus,
  ) {
    super();
  }
  eq(o: ChipWidget) {
    return o.name === this.name && o.status === this.status;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = `nm-chip nm-chip-${this.status}`;
    el.textContent = this.name;
    const name = this.name;
    el.title =
      this.status === 'option'
        ? t('Option field “{name}” — chosen when running', { name })
        : this.status === 'builtin'
          ? t('Placeholder “{name}”', { name })
          : t('Unknown placeholder “{name}” — stays as text', { name });
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

function chipPlugin(statusOf: (name: string) => ChipStatus) {
  const matcher = new MatchDecorator({
    regexp: /\{\{\s*([^{}\n]+?)\s*\}\}/g,
    decoration: (m) => Decoration.replace({ widget: new ChipWidget(m[1].trim(), statusOf(m[1])) }),
  });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view);
      }
      update(u: ViewUpdate) {
        this.decorations = matcher.updateDeco(u, this.decorations);
      }
    },
    {
      decorations: (v) => v.decorations,
      provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.decorations ?? Decoration.none),
    },
  );
}

const theme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'inherit', fontSize: '14px' },
  '&.cm-focused': { outline: 'none' },
  // normale Schrift statt Code-Schrift (höhere Spezifität als CodeMirrors Grundthema)
  '&.cm-editor .cm-scroller, &.cm-editor .cm-content': { fontFamily: 'ui-sans-serif, system-ui, sans-serif' },
  '.cm-content': { padding: '8px 0', lineHeight: '1.65', caretColor: 'currentColor' },
  '.cm-line': { padding: '0 10px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'rgb(217 119 6 / 0.25) !important' },
  '.cm-placeholder': { color: 'rgb(168 162 158)' },
  '.cm-tooltip': { borderRadius: '8px', overflow: 'hidden' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'rgb(180 83 9)', color: 'white' },
});

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Platzhalter, die angeboten werden (eingebaute + Auswahlfelder) */
  choices: ChipChoice[];
  statusOf: (name: string) => ChipStatus;
  placeholder?: string;
  minHeight?: number;
  onSave?: () => void;
  /** Sprache des Textes (Rechtschreibprüfung) */
  lang?: string;
}

export const ChipEditor = forwardRef<ChipEditorHandle, Props>(function ChipEditor({ value, onChange, choices, statusOf, placeholder, minHeight = 120, onSave, lang = 'de' }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const chips = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const choicesRef = useRef(choices);
  choicesRef.current = choices;

  useImperativeHandle(ref, () => ({
    insert: (name: string) => {
      const v = view.current;
      if (!v) return;
      v.dispatch(v.state.replaceSelection(`{{${name}}}`));
      v.focus();
    },
  }));

  useEffect(() => {
    const complete = (c: CompletionContext): CompletionResult | null => {
      const m = c.matchBefore(/\{\{[^{}\n]*$/);
      if (!m) return null;
      return {
        from: m.from,
        options: choicesRef.current.map((ch) => ({ label: `{{${ch.name}}}`, displayLabel: ch.name, detail: ch.detail, type: 'variable' })),
        validFor: /^\{\{[^{}\n]*$/,
      };
    };
    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: 'true', lang }),
        chips.current.of(chipPlugin(statusOf)),
        autocompletion({ override: [complete], activateOnTyping: true }),
        theme,
        cmPlaceholder(placeholder ?? ''),
        keymap.of([{ key: 'Mod-s', run: () => (onSaveRef.current?.(), true), preventDefault: true }, ...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    view.current = new EditorView({ state, parent: host.current! });
    return () => view.current?.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Chip-Farben neu berechnen, wenn sich die Auswahlfelder ändern
  const statusKey = choices.map((c) => c.name).join('|');
  useEffect(() => {
    view.current?.dispatch({ effects: chips.current.reconfigure(chipPlugin(statusOf)) });
  }, [statusKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Externe Änderungen (z. B. „Standard“) übernehmen
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  return (
    <div
      ref={host}
      style={{ minHeight }}
      className="cursor-text rounded-md border border-stone-300 bg-white focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-600/20 dark:border-stone-700 dark:bg-stone-900 [&_.cm-editor]:min-h-[inherit]"
      onMouseDown={(e) => {
        if (e.target === host.current) view.current?.focus();
      }}
    />
  );
});
