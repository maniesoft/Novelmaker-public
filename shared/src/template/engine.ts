// Auswertung von Prompt-Templates.
import { selectCodexEntries, type CodexSelection } from '../codex/context';
import { CodexMatcher } from '../codex/matcher';
// Achtung: RenderEnv hat eine eigene Methode t(de, en) für Prompt-Text in der Romansprache – tr() ist die UI-Übersetzung.
import { t as tr, type Lang } from '../i18n';

/** Wörter, die die Engine selbst in den Prompt schreibt – in der Sprache des Romans. */
const WORDS: Record<'chapter' | 'scene' | 'act' | 'also', Record<Lang, string>> = {
  chapter: { de: 'Kapitel', en: 'Chapter', es: 'Capítulo', uk: 'Розділ', it: 'Capitolo', fr: 'Chapitre' },
  scene: { de: 'Szene', en: 'Scene', es: 'Escena', uk: 'Сцена', it: 'Scena', fr: 'Scène' },
  act: { de: 'Akt', en: 'Act', es: 'Acto', uk: 'Акт', it: 'Atto', fr: 'Acte' },
  also: { de: 'Auch', en: 'Also', es: 'También', uk: 'Також', it: 'Anche', fr: 'Alias' },
};
import { CODEX_TYPES, type CodexEntry, type ContextFormat, type PromptInput, type PromptType, type RefValue, type RenderedMessage, type RenderWarning } from '../types';
import type { PromptActData, PromptChapterData, PromptComponentData, PromptData, PromptSceneData, RenderablePrompt } from './data';
import { includedComponentNames, parseTemplate, type Expr, type TNode } from './parser';
import { FUNCTIONS, type FnDef } from './functions';
import { containsValue, EDITOR_TYPES, isGerman, isObj, isTruthy, novelTextLang, valuesEqual, type Obj, type ObjKind, type Value } from './values';

export { isObj, isTruthy, valuesEqual, containsValue, isGerman, EDITOR_TYPES };
export type { Obj, Value, ObjKind };

/** Standardwert eines Eingabefelds (z. B. Dropdown-Option). */
export function defaultInputValue(def: PromptInput): string | undefined {
  for (const d of def.default ?? []) {
    if (d.type === 'uiDropdown') {
      const options = def.settings?.dropdown?.options ?? [];
      const idx = Number(d.id);
      if (Number.isInteger(idx) && options[idx] != null) return options[idx];
      const byValue = options.find((o) => o === d.id || o === d.value);
      if (byValue) return byValue;
    }
    if (typeof d.value === 'string') return d.value;
  }
  const t = def.settings?.text?.default;
  if (typeof t === 'string') return t;
  return undefined;
}

function findComponent(components: PromptComponentData[], name: string): PromptComponentData | undefined {
  const key = name.trim().toLowerCase();
  return components.find((c) => c.name.trim().toLowerCase() === key);
}

/** Eingabefelder eines Prompts inkl. aller (rekursiv) eingebundenen Komponenten. Gleiche Namen werden zusammengeführt. */
export function collectPromptInputs(
  prompt: Pick<RenderablePrompt, 'messages' | 'inputs'>,
  components: PromptComponentData[],
): (PromptInput & { source: string })[] {
  const out: (PromptInput & { source: string })[] = [];
  const seenNames = new Set<string>();
  const seenComponents = new Set<string>();
  const addInputs = (inputs: PromptInput[], source: string) => {
    for (const inp of inputs ?? []) {
      const k = inp.name.trim().toLowerCase();
      if (seenNames.has(k)) continue;
      seenNames.add(k);
      out.push({ ...inp, source });
    }
  };
  const visit = (msgs: { text: string }[]) => {
    for (const m of msgs) {
      for (const name of includedComponentNames(m.text)) {
        const k = name.trim().toLowerCase();
        if (seenComponents.has(k)) continue;
        seenComponents.add(k);
        const c = findComponent(components, name);
        if (!c) continue;
        addInputs(c.inputs, c.name);
        visit(c.messages);
      }
    }
  };
  addInputs(prompt.inputs, '');
  visit(prompt.messages);
  return out;
}

function attr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

interface SceneLoc {
  scene: PromptSceneData;
  chapter: PromptChapterData;
  act: PromptActData;
  index: number;
  sceneNo: number;
  chapterNo: number;
  actNo: number;
}
interface ChapterLoc {
  chapter: PromptChapterData;
  act: PromptActData;
  index: number;
  chapterNo: number;
  actNo: number;
}

export class RenderEnv {
  readonly warnings: RenderWarning[] = [];
  private warned = new Set<string>();
  readonly scenes: SceneLoc[] = [];
  readonly chapters: ChapterLoc[] = [];
  private sceneById = new Map<string, SceneLoc>();
  private chapterById = new Map<string, ChapterLoc>();
  private actById = new Map<string, { act: PromptActData; actNo: number }>();
  readonly codex: CodexEntry[];
  private codexById = new Map<string, CodexEntry>();
  private codexByName = new Map<string, CodexEntry>();
  private codexByAlias = new Map<string, CodexEntry>();
  private selection: CodexSelection | null = null;
  private matcher: CodexMatcher | null = null;
  private inputDefs = new Map<string, PromptInput>();
  private localStack: Map<string, Value>[] = [new Map()];
  private includeStack: string[] = [];
  readonly de: boolean;
  /** Sprache des Romans (für Texte, die die Engine selbst einfügt) */
  readonly lang: Lang;
  readonly style: ContextFormat;

  constructor(
    readonly data: PromptData,
    readonly promptType: PromptType,
    prompt: Pick<RenderablePrompt, 'messages' | 'inputs'>,
    private fns: Map<string, FnDef> = getFunctionMap(),
  ) {
    this.de = isGerman(data.novel.language);
    this.lang = novelTextLang(data.novel.language);
    this.style = data.novel.settings?.contextFormat ?? 'xml';
    let idx = 0;
    let chapterNo = 0;
    data.acts.forEach((act, ai) => {
      this.actById.set(act.id, { act, actNo: ai + 1 });
      for (const chapter of act.chapters) {
        chapterNo++;
        const cl: ChapterLoc = { chapter, act, index: this.chapters.length, chapterNo, actNo: ai + 1 };
        this.chapters.push(cl);
        this.chapterById.set(chapter.id, cl);
        chapter.scenes.forEach((scene, si) => {
          const loc: SceneLoc = { scene, chapter, act, index: idx++, sceneNo: si + 1, chapterNo, actNo: ai + 1 };
          this.scenes.push(loc);
          this.sceneById.set(scene.id, loc);
        });
      }
    });
    this.codex = data.codex.filter((e) => !(e.type === 'volume' && e.linkedNovelId === data.novel.id));
    for (const e of this.codex) {
      this.codexById.set(e.id, e);
      const n = e.name.trim().toLowerCase();
      if (!this.codexByName.has(n)) this.codexByName.set(n, e);
      for (const a of e.aliases) {
        const k = a.trim().toLowerCase();
        if (k && !this.codexByAlias.has(k)) this.codexByAlias.set(k, e);
      }
    }
    for (const inp of collectPromptInputs(prompt, data.components)) this.inputDefs.set(inp.name.trim().toLowerCase(), inp);
  }

  t(de: string, en: string) {
    return this.de ? de : en;
  }

  /** Wort in der Sprache des Romans. */
  w(words: Record<Lang, string>): string {
    return words[this.lang] ?? words.en;
  }

  warn(level: RenderWarning['level'], message: string) {
    const key = level + message;
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warnings.push({ level, message });
  }

  // ------------------------------------------------------------ Lookups

  sceneLoc(id: string | null | undefined): SceneLoc | null {
    return id ? (this.sceneById.get(id) ?? null) : null;
  }
  chapterLoc(id: string | null | undefined): ChapterLoc | null {
    return id ? (this.chapterById.get(id) ?? null) : null;
  }
  actInfo(id: string | null | undefined) {
    return id ? (this.actById.get(id) ?? null) : null;
  }
  currentLoc(): SceneLoc | null {
    return this.sceneLoc(this.data.currentSceneId);
  }
  currentChapterLoc(): ChapterLoc | null {
    const cur = this.currentLoc();
    if (cur) return this.chapterLoc(cur.chapter.id);
    return this.chapterLoc(this.data.currentChapterId ?? null);
  }
  codexEntry(id: string): CodexEntry | null {
    return this.codexById.get(id) ?? null;
  }

  /** Kodex-Eintrag aus Name, Alias oder Objekt. */
  findCodex(v: Value | undefined, warnIfMissing = true): CodexEntry | null {
    if (v == null) return null;
    if (isObj(v)) return v.$kind === 'codex' ? this.codexEntry(v.id) : null;
    if (Array.isArray(v)) return this.findCodex(v[0], warnIfMissing);
    const key = String(v).trim().toLowerCase();
    const e = this.codexByName.get(key) ?? this.codexByAlias.get(key) ?? null;
    if (!e && warnIfMissing) this.warn('warning', tr('Codex entry “{name}” not found', { name: String(v) }));
    return e;
  }

  /** Szene aus Argument (Objekt oder ID), sonst aktuelle Szene. */
  resolveScene(v: Value | undefined, useCurrent = true): SceneLoc | null {
    if (v === undefined) return useCurrent ? this.currentLoc() : null;
    if (v == null) return null;
    if (isObj(v)) {
      if (v.$kind === 'scene') return this.sceneLoc(v.id);
      return null;
    }
    if (Array.isArray(v)) return this.resolveScene(v[0], false);
    return this.sceneLoc(String(v));
  }

  resolveChapter(v: Value | undefined): ChapterLoc | null {
    if (v === undefined) return this.currentChapterLoc();
    if (v == null) return null;
    if (isObj(v)) {
      if (v.$kind === 'chapter') return this.chapterLoc(v.id);
      if (v.$kind === 'scene') {
        const s = this.sceneLoc(v.id);
        return s ? this.chapterLoc(s.chapter.id) : null;
      }
      return null;
    }
    if (Array.isArray(v)) return this.resolveChapter(v[0]);
    return this.chapterLoc(String(v));
  }

  resolveAct(v: Value | undefined): { act: PromptActData; actNo: number } | null {
    if (v === undefined) {
      const c = this.currentChapterLoc();
      return c ? this.actInfo(c.act.id) : null;
    }
    if (v == null) return null;
    if (isObj(v)) {
      if (v.$kind === 'act') return this.actInfo(v.id);
      const c = this.resolveChapter(v);
      return c ? this.actInfo(c.act.id) : null;
    }
    if (Array.isArray(v)) return this.resolveAct(v[0]);
    return this.actInfo(String(v));
  }

  sceneObj(loc: SceneLoc | null, mode?: 'full' | 'summary'): Obj | null {
    return loc ? { $kind: 'scene', id: loc.scene.id, ...(mode ? { mode } : {}) } : null;
  }
  chapterObj(loc: ChapterLoc | null): Obj | null {
    return loc ? { $kind: 'chapter', id: loc.chapter.id } : null;
  }
  codexObj(e: CodexEntry | null): Obj | null {
    return e ? { $kind: 'codex', id: e.id } : null;
  }

  /** Vorherige/nächste Szene, die nicht vor der KI verborgen ist. */
  neighborScene(loc: SceneLoc | null, dir: -1 | 1): SceneLoc | null {
    if (!loc) return null;
    for (let i = loc.index + dir; i >= 0 && i < this.scenes.length; i += dir) {
      if (!this.scenes[i].scene.hideFromAI) return this.scenes[i];
    }
    return null;
  }

  povOf(loc: SceneLoc | null): { characterId: string | null; type: string } {
    const novel = this.data.novel;
    return {
      characterId: loc ? (loc.scene.povCharacterId ?? novel.povCharacterId) : novel.povCharacterId,
      type: (loc ? loc.scene.povType : null) ?? novel.povType ?? 'third-limited',
    };
  }

  // ------------------------------------------------------------ Labels

  chapterLabel(cl: ChapterLoc): string {
    const base = `${this.w(WORDS.chapter)} ${cl.chapterNo}`;
    const title = cl.chapter.title.trim();
    return title && title.toLowerCase() !== base.toLowerCase() ? `${base}: ${title}` : base;
  }
  sceneLabel(sl: SceneLoc): string {
    const cl = this.chapterById.get(sl.chapter.id)!;
    let s = this.chapterLabel(cl);
    if (sl.chapter.scenes.length > 1 || sl.scene.title) s += `, ${this.w(WORDS.scene)} ${sl.sceneNo}`;
    if (sl.scene.title.trim()) s += `: ${sl.scene.title.trim()}`;
    return s;
  }
  actLabel(a: { act: PromptActData; actNo: number }): string {
    const base = `${this.w(WORDS.act)} ${a.actNo}`;
    return a.act.title.trim() ? `${base}: ${a.act.title.trim()}` : base;
  }

  // ------------------------------------------------------------ Kodex-Kontext

  getMatcher(): CodexMatcher {
    if (!this.matcher) this.matcher = new CodexMatcher(this.codex);
    return this.matcher;
  }

  codexSelection(): CodexSelection {
    if (this.selection) return this.selection;
    const d = this.data;
    const cur = this.currentLoc();
    const currentTexts: string[] = [];
    const push = (s: string | null | undefined) => {
      if (s && s.trim()) currentTexts.push(s);
    };
    push(d.message);
    push(d.selection);
    if (cur && !cur.scene.hideFromAI) push(cur.scene.text);
    else if (cur) push(cur.scene.text);
    if (d.chat) {
      push(d.chat.message);
      for (const m of d.chat.history.slice(-6)) push(m.content);
    }
    // Texte aus Verweis-Eingaben (Kontextauswahl)
    for (const v of Object.values(d.inputs ?? {})) {
      if (!Array.isArray(v)) continue;
      for (const r of v as RefValue[]) push(this.refScanText(r));
    }
    const previousTexts: string[] = [];
    if (d.novel.settings?.codexScanPreviousScene && cur) {
      const prev = this.neighborScene(cur, -1);
      if (prev) previousTexts.push(prev.scene.text);
    }
    const pov = this.povOf(cur);
    this.selection = selectCodexEntries({
      entries: this.codex,
      currentTexts,
      previousTexts,
      pinnedIds: d.pinnedCodexIds,
      povCharacterId: cur ? pov.characterId : null,
      recursive: !!d.novel.settings?.codexRecursive,
      budget: d.novel.settings?.codexTokenBudget ?? 0,
      formatEntry: (e) => this.formatCodex(e, this.style),
      matcher: this.getMatcher(),
    });
    return this.selection;
  }

  private refScanText(r: RefValue): string {
    switch (r.type) {
      case 'scene':
        return this.sceneLoc(r.id)?.scene.text ?? '';
      case 'chapter': {
        const c = this.chapterLoc(r.id);
        return c ? c.chapter.summary + '\n' + c.chapter.scenes.map((s) => (r.mode === 'summary' ? s.summary : s.text)).join('\n') : '';
      }
      case 'act': {
        const a = this.actInfo(r.id);
        return a ? a.act.summary + '\n' + a.act.chapters.map((c) => c.summary).join('\n') : '';
      }
      case 'snippet':
        return this.data.snippets.find((s) => s.id === r.id)?.text ?? '';
      case 'text':
        return r.text ?? '';
      default:
        return '';
    }
  }

  // ------------------------------------------------------------ Eingaben

  inputValue(name: string): Value {
    const key = name.trim().toLowerCase();
    const def = this.inputDefs.get(key);
    let raw: unknown = undefined;
    for (const [k, v] of Object.entries(this.data.inputs ?? {})) {
      if (k.trim().toLowerCase() === key) {
        raw = v;
        break;
      }
    }
    if (!def && raw === undefined) {
      this.warn('warning', tr('Input “{name}” is not defined', { name }));
      return null;
    }
    const isEmpty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);
    if (isEmpty && def) {
      const d = defaultInputValue(def);
      if (d !== undefined) raw = d;
    }
    const multiple = def?.mode === 'multiple';
    if (raw === undefined || raw === null) return multiple ? [] : def && def.types.some((t) => t === 'text' || t === 'dropdown') ? '' : null;
    if (typeof raw === 'string' || typeof raw === 'number') return String(raw);
    if (!Array.isArray(raw)) return null;
    const objs = (raw as RefValue[]).map((r) => this.refToObj(r, def)).filter((o): o is Obj => !!o);
    if (!multiple) return objs[0] ?? null;
    return objs;
  }

  refToObj(r: RefValue, def?: PromptInput): Obj | null {
    const settingMode = (def?.settings?.[r.type] as { mode?: 'full' | 'summary' } | undefined)?.mode;
    const mode = r.mode ?? settingMode;
    switch (r.type) {
      case 'scene':
        if (!this.sceneLoc(r.id)) return this.missingRef(r);
        return { $kind: 'scene', id: r.id!, mode: mode ?? 'full' };
      case 'chapter':
        if (!this.chapterLoc(r.id)) return this.missingRef(r);
        return { $kind: 'chapter', id: r.id!, mode: mode ?? 'full' };
      case 'act':
        if (!this.actInfo(r.id)) return this.missingRef(r);
        return { $kind: 'act', id: r.id!, mode: mode ?? 'full' };
      case 'codex':
        if (!r.id || !this.codexById.has(r.id)) return this.missingRef(r);
        return { $kind: 'codex', id: r.id };
      case 'snippet':
        if (!this.data.snippets.some((s) => s.id === r.id)) return this.missingRef(r);
        return { $kind: 'snippet', id: r.id! };
      case 'fullNovel':
        return { $kind: 'novel', id: this.data.novel.id, mode: mode ?? 'full' };
      case 'text':
        return r.text?.trim() ? { $kind: 'text', id: 'text', text: r.text } : null;
      default:
        return null;
    }
  }

  private missingRef(r: RefValue): null {
    this.warn('info', tr('Reference to {type} “{name}” no longer exists', { type: r.type, name: String(r.label ?? r.id) }));
    return null;
  }

  // ------------------------------------------------------------ Lokale Werte & include

  getLocal(name: string): Value {
    const k = name.toLowerCase();
    for (let i = this.localStack.length - 1; i >= 0; i--) {
      if (this.localStack[i].has(k)) return this.localStack[i].get(k)!;
    }
    return null;
  }
  setLocal(name: string, v: Value) {
    this.localStack[this.localStack.length - 1].set(name.toLowerCase(), v);
  }

  include(name: string): string {
    const comp = findComponent(this.data.components, name);
    if (!comp) {
      this.warn('warning', tr('Component “{name}” not found', { name }));
      return '';
    }
    const key = comp.name.toLowerCase();
    if (this.includeStack.includes(key) || this.includeStack.length > 12) {
      this.warn('error', tr('Infinite inclusion loop at “{name}”', { name: comp.name }));
      return '';
    }
    this.includeStack.push(key);
    this.localStack.push(new Map());
    try {
      return comp.messages
        .map((m, i) => this.renderTemplate(m.text, comp.messages.length > 1 ? tr('{name} (message {n})', { name: comp.name, n: i + 1 }) : comp.name))
        .map((s) => cleanupText(s))
        .filter(Boolean)
        .join('\n\n');
    } finally {
      this.localStack.pop();
      this.includeStack.pop();
    }
  }

  // ------------------------------------------------------------ Auswertung

  call(name: string, args: Value[], hasParens: boolean): Value {
    const key = name.toLowerCase();
    const def = this.fns.get(key);
    if (def) return this.invoke(def, args);
    // Eigenschaftszugriff: scene.previous.title → scene.title(scene.previous)
    const parts = key.split('.');
    for (let k = parts.length - 1; k >= 1; k--) {
      const base = this.fns.get(parts.slice(0, k).join('.'));
      if (!base) continue;
      let v = this.invoke(base, []);
      const rest = parts.slice(k);
      for (let r = 0; r < rest.length; r++) {
        const last = r === rest.length - 1;
        v = this.property(v, rest[r], last && hasParens ? args : [], name);
      }
      return v;
    }
    this.warn('warning', tr('Unknown function “{name}”', { name }));
    return null;
  }

  private invoke(def: FnDef, args: Value[]): Value {
    if (def.types && !def.types.includes(this.promptType) && this.promptType !== 'component') {
      this.warn('warning', tr('“{name}” isn’t available in the “{type}” prompt type', { name: def.name, type: this.promptType }));
      return def.fallback ?? null;
    }
    return def.impl(this, args);
  }

  private property(v: Value, prop: string, extraArgs: Value[], full: string): Value {
    if (Array.isArray(v)) return v.map((x) => this.property(x, prop, extraArgs, full));
    if (!isObj(v)) {
      if (v == null) return null;
      this.warn('warning', tr('“{expr}”: not an object, can’t read “.{prop}”', { expr: full, prop }));
      return null;
    }
    const fn = this.fns.get(`${v.$kind === 'novel' ? 'novel' : v.$kind}.${prop}`);
    if (!fn) {
      this.warn('warning', tr('Unknown property “{prop}” ({expr})', { prop, expr: full }));
      return null;
    }
    return this.invoke(fn, [v, ...extraArgs]);
  }

  evalExpr(e: Expr): Value {
    switch (e.kind) {
      case 'str':
      case 'num':
      case 'lit':
        return e.value;
      case 'not':
        return !isTruthy(this.evalExpr(e.expr));
      case 'bin': {
        if (e.op === 'and') return isTruthy(this.evalExpr(e.left)) && isTruthy(this.evalExpr(e.right));
        if (e.op === 'or') return isTruthy(this.evalExpr(e.left)) || isTruthy(this.evalExpr(e.right));
        const l = this.evalExpr(e.left);
        const r = this.evalExpr(e.right);
        switch (e.op) {
          case '+':
            if (typeof l === 'number' && typeof r === 'number') return l + r;
            return this.toText(l) + this.toText(r);
          case 'is':
            return valuesEqual(l, r);
          case 'isnot':
            return !valuesEqual(l, r);
          case 'in':
            return containsValue(r, l);
          case 'notin':
            return !containsValue(r, l);
          case '<':
            return Number(l) < Number(r);
          case '>':
            return Number(l) > Number(r);
          case '<=':
            return Number(l) <= Number(r);
          case '>=':
            return Number(l) >= Number(r);
        }
        return null;
      }
      case 'call':
        return this.call(
          e.name,
          (e.args ?? []).map((a) => this.evalExpr(a)),
          e.args !== null,
        );
    }
  }

  renderNodes(nodes: TNode[]): string {
    let out = '';
    for (const n of nodes) {
      if (n.kind === 'text') out += n.value;
      else if (n.kind === 'expr') {
        try {
          out += this.toText(this.evalExpr(n.expr));
        } catch (err) {
          this.warn('error', tr('Error in {expr}: {message}', { expr: n.src, message: String((err as Error).message) }));
        }
      } else {
        for (const b of n.branches) {
          let ok = b.cond === null;
          if (!ok) {
            try {
              ok = isTruthy(this.evalExpr(b.cond!));
            } catch (err) {
              this.warn('error', tr('Error in condition: {message}', { message: String((err as Error).message) }));
            }
          }
          if (ok) {
            out += this.renderNodes(b.body);
            break;
          }
        }
      }
    }
    return out;
  }

  renderTemplate(src: string, where: string): string {
    const parsed = parseTemplate(src);
    for (const iss of parsed.issues) this.warn('error', tr('{where}, line {line}: {message}', { where, line: iss.line, message: iss.message }));
    return this.renderNodes(parsed.nodes);
  }

  // ------------------------------------------------------------ Formatierung

  toText(v: Value | undefined, style: ContextFormat = this.style): string {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (Array.isArray(v)) {
      if (v.every((x) => !isObj(x) && !Array.isArray(x)))
        return v
          .map((x) => this.toText(x))
          .filter((s) => s !== '')
          .join(', ');
      return v
        .map((x) => this.toText(x, style))
        .filter((s) => s.trim() !== '')
        .join('\n\n');
    }
    return this.formatObj(v, style);
  }

  private wrap(style: ContextFormat, tag: string, attrs: Record<string, string>, label: string, body: string): string {
    body = body.trim();
    if (style === 'xml') {
      const a = Object.entries(attrs)
        .filter(([, v]) => v)
        .map(([k, v]) => ` ${k}="${attr(v)}"`)
        .join('');
      return `<${tag}${a}>\n${body}\n</${tag}>`;
    }
    if (style === 'markdown') return `## ${label}\n\n${body}`;
    return `${label}\n${body}`;
  }

  sceneContent(loc: SceneLoc, mode: 'full' | 'summary'): string {
    if (mode === 'summary') {
      if (loc.scene.summary.trim()) return loc.scene.summary;
      if (loc.scene.text.trim()) this.warn('info', tr('{scene} has no summary — using full text', { scene: this.sceneLabel(loc) }));
      return loc.scene.text;
    }
    return loc.scene.text;
  }

  chapterContent(cl: ChapterLoc, mode: 'full' | 'summary'): string {
    const scenes = cl.chapter.scenes.filter((s) => !s.hideFromAI).map((s) => this.sceneById.get(s.id)!);
    if (mode === 'summary') {
      if (cl.chapter.summary.trim()) return cl.chapter.summary;
      return scenes
        .map((s) => s.scene.summary.trim())
        .filter(Boolean)
        .join('\n\n');
    }
    return scenes
      .map((s) => s.scene.text.trim())
      .filter(Boolean)
      .join('\n\n* * *\n\n');
  }

  formatCodex(e: CodexEntry, style: ContextFormat): string {
    const tag = CODEX_TYPES.find((t) => t.value === e.type)?.xmlTag ?? 'entry';
    // Typ in der Sprache des Romans (Wörterbuch der Oberfläche)
    const typeLabel = tr(CODEX_TYPES.find((ct) => ct.value === e.type)?.label ?? '', undefined, this.lang);
    const lines = [e.description.trim()];
    for (const f of e.fields ?? []) if (f.key.trim() && f.value.trim()) lines.push(`${f.key.trim()}: ${f.value.trim()}`);
    const body = lines.filter(Boolean).join('\n');
    const aliases = e.aliases.filter(Boolean).join(', ');
    if (style === 'xml') return this.wrap('xml', tag, { name: e.name, aliases }, '', body);
    if (style === 'markdown') return `### ${e.name} (${typeLabel})${aliases ? `\n${this.w(WORDS.also)}: ${aliases}` : ''}\n\n${body}`.trim();
    return `${e.name}${aliases ? ` (${aliases})` : ''}: ${body}`.trim();
  }

  outlineText(scenes: SceneLoc[], useChapterSummaryIfEmpty = true): string {
    // Gruppiert nach Kapitel: Szenen-Zusammenfassungen (oder Kapitel-Zusammenfassung)
    const parts: string[] = [];
    let currentChapter: string | null = null;
    let buf: string[] = [];
    let chapterLoc: ChapterLoc | null = null;
    const multiAct = this.data.acts.length > 1;
    let lastAct: string | null = null;
    const flush = () => {
      if (!chapterLoc) return;
      let body = buf.join('\n\n');
      if (!body && useChapterSummaryIfEmpty) body = chapterLoc.chapter.summary.trim();
      if (body) {
        if (multiAct && chapterLoc.act.id !== lastAct) {
          lastAct = chapterLoc.act.id;
          parts.push(`# ${this.actLabel(this.actById.get(chapterLoc.act.id)!)}`);
        }
        parts.push(`## ${this.chapterLabel(chapterLoc)}\n${body}`);
      }
      buf = [];
    };
    for (const s of scenes) {
      if (s.chapter.id !== currentChapter) {
        flush();
        currentChapter = s.chapter.id;
        chapterLoc = this.chapterById.get(s.chapter.id)!;
      }
      if (!s.scene.hideFromAI && s.scene.summary.trim()) buf.push(s.scene.summary.trim());
    }
    flush();
    return parts.join('\n\n');
  }

  fullText(scenes: SceneLoc[]): string {
    const parts: string[] = [];
    let currentChapter: string | null = null;
    for (const s of scenes) {
      if (s.scene.hideFromAI) continue;
      if (s.chapter.id !== currentChapter) {
        currentChapter = s.chapter.id;
        parts.push(`## ${this.chapterLabel(this.chapterById.get(s.chapter.id)!)}`);
      }
      if (s.scene.text.trim()) parts.push(s.scene.text.trim());
    }
    return parts.join('\n\n');
  }

  formatObj(o: Obj, style: ContextFormat): string {
    switch (o.$kind) {
      case 'codex': {
        const e = this.codexEntry(o.id);
        return e ? this.formatCodex(e, style) : '';
      }
      case 'scene': {
        const loc = this.sceneLoc(o.id);
        if (!loc) return '';
        const label = this.sceneLabel(loc);
        const mode = o.mode ?? 'full';
        return this.wrap(style, 'scene', { title: label, type: mode === 'summary' ? 'summary' : '' }, label, this.sceneContent(loc, mode));
      }
      case 'chapter': {
        const cl = this.chapterLoc(o.id);
        if (!cl) return '';
        const label = this.chapterLabel(cl);
        const mode = o.mode ?? 'full';
        return this.wrap(style, 'chapter', { title: label, type: mode === 'summary' ? 'summary' : '' }, label, this.chapterContent(cl, mode));
      }
      case 'act': {
        const a = this.actInfo(o.id);
        if (!a) return '';
        const label = this.actLabel(a);
        const scenes = this.scenes.filter((s) => s.act.id === a.act.id);
        const mode = o.mode ?? 'full';
        const body = mode === 'summary' ? a.act.summary.trim() || this.outlineText(scenes) : this.fullText(scenes);
        return this.wrap(style, 'act', { title: label, type: mode === 'summary' ? 'summary' : '' }, label, body);
      }
      case 'novel': {
        const mode = o.mode ?? 'full';
        const body = mode === 'summary' ? this.outlineText(this.scenes) : this.fullText(this.scenes);
        return this.wrap(style, 'novel', { title: this.data.novel.title, type: mode === 'summary' ? 'outline' : '' }, this.data.novel.title, body);
      }
      case 'snippet': {
        const s = this.data.snippets.find((x) => x.id === o.id);
        return s ? this.wrap(style, 'snippet', { title: s.title }, s.title, s.text) : '';
      }
      case 'series': {
        const s = this.data.series;
        return s ? this.wrap(style, 'series', { title: s.title }, s.title, s.description) : '';
      }
      case 'text':
        return style === 'xml' ? `<note>\n${(o.text ?? '').trim()}\n</note>` : (o.text ?? '').trim();
    }
  }
}

export function cleanupText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Leere Nachrichten weglassen, gleiche Rollen hintereinander zusammenführen. */
export function normalizeMessages(msgs: RenderedMessage[]): RenderedMessage[] {
  const out: RenderedMessage[] = [];
  for (const m of msgs) {
    const content = m.content.trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + content;
    else out.push({ role: m.role, content });
  }
  return out;
}

let functionMap: Map<string, FnDef> | null = null;
export function getFunctionMap(): Map<string, FnDef> {
  if (!functionMap) functionMap = new Map(FUNCTIONS.map((f) => [f.name.toLowerCase(), f]));
  return functionMap;
}

export interface RenderResult {
  messages: RenderedMessage[];
  warnings: RenderWarning[];
  codex: ReturnType<RenderEnv['codexSelection']>['items'];
}

export function renderPrompt(prompt: RenderablePrompt, data: PromptData): RenderResult {
  const env = new RenderEnv(data, prompt.type, prompt);
  const rendered: RenderedMessage[] = prompt.messages.map((m, i) => ({
    role: m.type,
    content: cleanupText(env.renderTemplate(m.text, tr('Message {n} ({role})', { n: i + 1, role: m.type }))),
  }));
  if (data.chat) {
    for (const h of data.chat.history) rendered.push({ role: h.role, content: h.content });
    if (data.chat.message.trim()) rendered.push({ role: 'user', content: data.chat.message });
  }
  // Pflichtfelder prüfen
  for (const def of collectPromptInputs(prompt, data.components)) {
    if (!def.required) continue;
    const v = env.inputValue(def.name);
    if (!isTruthy(v)) env.warn('warning', tr('Required field “{name}” is empty', { name: def.displayName ?? def.name }));
  }
  return { messages: normalizeMessages(rendered), warnings: env.warnings, codex: env.codexSelection().items };
}
