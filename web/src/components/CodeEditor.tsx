// CodeMirror 6 mit Syntax-Hervorhebung, Autovervollständigung und Prüfung für die Prompt-Syntax.
import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, highlightSpecialChars, keymap, lineNumbers, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, StreamLanguage, syntaxHighlighting, bracketMatching } from '@codemirror/language';
import { autocompletion, closeBrackets, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { FUNCTIONS, lintTemplate } from '@novelmaker/shared';
import { t } from '../lib/i18n';

interface AicState {
  inExpr: boolean;
  inComment: boolean;
}

const aicLanguage = StreamLanguage.define<AicState>({
  name: 'aic2',
  startState: () => ({ inExpr: false, inComment: false }),
  copyState: (s) => ({ ...s }),
  token(stream, state) {
    if (state.inComment) {
      if (stream.skipTo('!}')) {
        stream.match('!}');
        state.inComment = false;
      } else stream.skipToEnd();
      return 'comment';
    }
    if (!state.inExpr) {
      if (stream.match('\\{') || stream.match('\\}')) return null;
      if (stream.match('{!')) {
        state.inComment = true;
        return 'comment';
      }
      if (stream.match(/^\{\s*(#\s*(else\s*if|elseif|elif|if|else|endif)|\/\s*if)\b/i)) {
        state.inExpr = true;
        return 'keyword';
      }
      if (stream.match('{')) {
        state.inExpr = true;
        return 'brace';
      }
      if (stream.match(/^<\/?[A-Za-z][\w-]*(\s[^>]*)?>/)) return 'xml';
      stream.next();
      while (!stream.eol()) {
        const c = stream.peek();
        if (c === '{' || c === '<' || c === '\\') break;
        stream.next();
      }
      return null;
    }
    if (stream.eatSpace()) return null;
    if (stream.match('}')) {
      state.inExpr = false;
      return 'brace';
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/) || stream.match(/^'(?:[^'\\]|\\.)*'?/)) return 'string';
    if (stream.match(/^-?\d+(\.\d+)?/)) return 'number';
    if (stream.match(/^(is|in|not|and|or|true|false|null)\b(?!\s*\()/i)) return 'keyword';
    if (stream.match(/^[\p{L}_$][\p{L}\p{N}_$.]*/u)) return 'fn';
    stream.next();
    return 'operator';
  },
  tokenTable: { brace: tags.brace, fn: tags.function(tags.variableName), xml: tags.tagName },
});

const aicHighlight = HighlightStyle.define([
  { tag: tags.comment, class: 'tok-aic-comment' },
  { tag: tags.keyword, class: 'tok-aic-kw' },
  { tag: tags.brace, class: 'tok-aic-brace' },
  { tag: tags.function(tags.variableName), class: 'tok-aic-fn' },
  { tag: tags.string, class: 'tok-aic-str' },
  { tag: tags.number, class: 'tok-aic-num' },
  { tag: tags.tagName, class: 'tok-aic-xml' },
]);

const theme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'inherit' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'rgb(168 162 158)' },
  '.cm-activeLine': { backgroundColor: 'rgb(120 113 108 / 0.07)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-content': { padding: '10px 0' },
  '.cm-line': { padding: '0 12px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'rgb(217 119 6 / 0.25) !important' },
  '.cm-tooltip': { borderRadius: '8px', overflow: 'hidden' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'rgb(180 83 9)', color: 'white' },
  '.cm-completionInfo': { maxWidth: '320px', padding: '6px 8px' },
});

export interface CodeEditorContext {
  componentNames: string[];
  inputNames: string[];
  promptType: string;
}

export function CodeEditor({ value, onChange, context, placeholder, onSave }: { value: string; onChange: (v: string) => void; context: CodeEditorContext; placeholder?: string; onSave?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const ctx = useRef(context);
  ctx.current = context;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    const completions = (c: CompletionContext): CompletionResult | null => {
      const before = c.state.sliceDoc(Math.max(0, c.pos - 400), c.pos);
      const open = before.lastIndexOf('{');
      if (open < 0 || before.lastIndexOf('}') > open || before[open + 1] === '!') return null;
      const inc = /include\(\s*["']([^"']*)$/i.exec(before);
      if (inc) return { from: c.pos - inc[1].length, options: ctx.current.componentNames.map((n) => ({ label: n, type: 'text', detail: t('Component') })) };
      const inp = /input\(\s*["']([^"']*)$/i.exec(before);
      if (inp) return { from: c.pos - inp[1].length, options: ctx.current.inputNames.map((n) => ({ label: n, type: 'text', detail: t('Input') })) };
      const word = c.matchBefore(/[\p{L}_$][\p{L}\p{N}_$.]*/u);
      if (!word && !c.explicit) return null;
      return {
        from: word ? word.from : c.pos,
        options: FUNCTIONS.map((f) => ({ label: f.name, detail: f.sig !== f.name ? f.sig.slice(f.name.length) : undefined, info: `${t(f.doc)} (${t(f.group)})`, type: 'function' })),
        validFor: /^[\p{L}\p{N}_$.]*$/u,
      };
    };
    const lint = linter((v) => {
      const issues = lintTemplate(v.state.doc.toString(), ctx.current);
      return issues.map((i): Diagnostic => ({ from: i.from, to: Math.max(i.to, i.from + 1), severity: i.severity, message: i.message }));
    });
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightSpecialChars(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        bracketMatching(),
        closeBrackets(),
        EditorView.lineWrapping,
        aicLanguage,
        syntaxHighlighting(aicHighlight),
        autocompletion({ override: [completions], activateOnTyping: true }),
        lint,
        lintGutter(),
        theme,
        cmPlaceholder(placeholder ?? ''),
        keymap.of([
          { key: 'Mod-s', run: () => (onSaveRef.current?.(), true), preventDefault: true },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    view.current = new EditorView({ state, parent: host.current! });
    return () => view.current?.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Externe Änderungen übernehmen
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} className="h-full min-h-48" />;
}
