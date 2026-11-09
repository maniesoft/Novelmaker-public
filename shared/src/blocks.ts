// Baustein-Prompts: das eigene, einfache Prompt-Format von Novelmaker.
//
// Ein Prompt besteht aus
//   - Rolle & Stil (freier Text),
//   - Kontext-Bausteinen zum An- und Abhaken (mit wenigen Einstellungen wie Wortzahlen),
//   - der Aufgabe (freier Text),
//   - Auswahlfeldern beim Ausführen (z. B. Wörter 200/400/600).
// Platzhalter im Text stehen als {{Name}} (in der Oberfläche als Chips).
//
// Intern wird daraus eine normale Nachrichtenliste für die Template-Engine erzeugt
// (compileBlockPrompt) – die Engine bleibt damit die einzige Stelle, die Prompts rendert.
import type { PromptInput, PromptMessage, PromptType, RefKind } from './types';
import { getLang, N_, t, type Lang } from './i18n';
import {
  FRAMING,
  LENGTH_OPTION,
  PLACEHOLDER_NAMES,
  ROLE_CHAT,
  ROLE_CONTINUE,
  ROLE_EDITOR,
  ROLE_SUMMARY,
  ROLE_WRITER,
  TASK_BEAT,
  TASK_CHAT,
  TASK_CONTINUE,
  TASK_REWRITE,
  TASK_SUMMARY,
  WORDS_OPTION,
  type PlaceholderKey,
} from './promptlang';

// ---------------------------------------------------------------- Typen

export type BlockKind =
  | 'novelInstructions'
  | 'bannedWords'
  | 'novelInfo'
  | 'codex'
  | 'storySoFar'
  | 'sceneSummary'
  | 'sourceText'
  | 'context'
  | 'previousSceneEnd'
  | 'textBefore'
  | 'textAfter'
  | 'selection';

export interface BlockConfig {
  on: boolean;
  /** Wortzahl (Text davor/danach, Ende der vorigen Szene); 0 = alles */
  words?: number;
  /** Text vor dem Cursor als Stilvorlage: die KI glaubt, ihn selbst geschrieben zu haben */
  asExample?: boolean;
  /** Ende der vorigen Szene nur bei gleicher POV-Figur */
  samePov?: boolean;
  /** Name des Kodex-Eintrags, dessen Aliase verboten sind */
  entry?: string;
}

export interface PromptOption {
  name: string;
  /** leer = freies Textfeld */
  choices: string[];
  default: string;
}

export interface BlockPromptSpec {
  version: 1;
  role: string;
  task: string;
  blocks: Partial<Record<BlockKind, BlockConfig>>;
  options: PromptOption[];
}

export type PromptKindForBlocks = 'scene-beat-completion' | 'continue-writing' | 'text-replacement' | 'summary' | 'workshop-chat';

export const BLOCK_PROMPT_TYPES: PromptKindForBlocks[] = ['scene-beat-completion', 'continue-writing', 'text-replacement', 'summary', 'workshop-chat'];

const BEAT: PromptType = 'scene-beat-completion';
const CONT: PromptType = 'continue-writing';
const EDIT: PromptType = 'text-replacement';
const SUM: PromptType = 'summary';
const CHAT: PromptType = 'workshop-chat';
const ALL: PromptType[] = [BEAT, CONT, EDIT, SUM, CHAT];

export interface BlockDef {
  kind: BlockKind;
  label: string;
  hint: string;
  group: 'instructions' | 'context' | 'text';
  types: PromptType[];
  params?: ('words' | 'asExample' | 'samePov' | 'entry')[];
  /** Standard je Prompt-Typ für neue Prompts */
  defaults: (type: PromptType) => BlockConfig;
}

const on = (v: boolean, extra: Partial<BlockConfig> = {}): BlockConfig => ({ on: v, ...extra });

export const BLOCK_DEFS: BlockDef[] = [
  {
    kind: 'novelInstructions',
    label: N_('Novel’s additional instructions'),
    hint: N_('Whatever is under “Novel → Additional instructions for the AI”.'),
    group: 'instructions',
    types: ALL,
    defaults: (t) => on(t !== SUM),
  },
  {
    kind: 'bannedWords',
    label: N_('Banned words from the Codex'),
    hint: N_('This codex entry’s aliases are treated as a list of words and phrases the AI should avoid (e.g. an “AI-isms” entry with inclusion “never”).'),
    group: 'instructions',
    types: [BEAT, CONT, EDIT, CHAT],
    params: ['entry'],
    defaults: () => on(false, { entry: 'AI-isms' }),
  },
  {
    kind: 'novelInfo',
    label: N_('Novel info'),
    hint: N_('Title, author, language, tense, series and volume, blurb.'),
    group: 'context',
    types: ALL,
    defaults: (t) => on(t === CHAT),
  },
  {
    kind: 'codex',
    label: N_('Codex'),
    hint: N_('Entries that are mentioned in the text, pinned, or set to “always” (token budget: novel settings).'),
    group: 'context',
    types: ALL,
    defaults: () => on(true),
  },
  {
    kind: 'storySoFar',
    label: N_('Story so far'),
    hint: N_('The summaries of all scenes before this scene.'),
    group: 'context',
    types: ALL,
    defaults: (t) => on(t === BEAT || t === CONT),
  },
  {
    kind: 'sceneSummary',
    label: N_('Summary of this scene'),
    hint: N_('Plan or summary of the current scene (scene panel).'),
    group: 'context',
    types: [BEAT, CONT, EDIT],
    defaults: () => on(false),
  },
  {
    kind: 'sourceText',
    label: N_('Text to summarize'),
    hint: N_('Scene: full scene text · Chapter: the scene summaries · Novel: the chapter summaries.'),
    group: 'context',
    types: [SUM],
    defaults: () => on(true),
  },
  {
    kind: 'context',
    label: N_('Choose context when running'),
    hint: N_('Freely add acts, chapters, scenes, codex entries, snippets, or the whole novel each time (in chat: the context picker).'),
    group: 'context',
    types: [BEAT, CONT, EDIT, CHAT],
    defaults: (t) => on(t !== EDIT),
  },
  {
    kind: 'previousSceneEnd',
    label: N_('End of the previous scene'),
    hint: N_('Only at the start of a scene: the last words of the previous scene.'),
    group: 'text',
    types: [BEAT, CONT],
    params: ['words', 'samePov'],
    defaults: () => on(true, { words: 650, samePov: true }),
  },
  {
    kind: 'textBefore',
    label: N_('Text before the cursor'),
    hint: N_('“As style reference”: the AI receives the text as if it had written it itself, and so adopts its style.'),
    group: 'text',
    types: [BEAT, CONT, EDIT],
    params: ['words', 'asExample'],
    defaults: (t) => (t === EDIT ? on(true, { words: 300, asExample: false }) : on(true, { words: 2500, asExample: true })),
  },
  {
    kind: 'textAfter',
    label: N_('Text after the cursor'),
    hint: N_('What already comes after it in the scene — the AI steers toward it.'),
    group: 'text',
    types: [BEAT, CONT, EDIT],
    params: ['words'],
    defaults: (t) => on(t !== CONT, { words: t === EDIT ? 150 : 250 }),
  },
  {
    kind: 'selection',
    label: N_('Selected text'),
    hint: N_('The passage to be edited.'),
    group: 'text',
    types: [EDIT],
    defaults: () => on(true),
  },
];

export const BLOCK_GROUPS: { group: BlockDef['group']; label: string }[] = [
  { group: 'instructions', label: N_('Instructions') },
  { group: 'context', label: N_('Context') },
  { group: 'text', label: N_('Text around the cursor') },
];

export const blockDef = (kind: BlockKind) => BLOCK_DEFS.find((d) => d.kind === kind)!;
export const blockApplies = (kind: BlockKind, type: PromptType) => blockDef(kind).types.includes(type);

// ---------------------------------------------------------------- Platzhalter

export interface PlaceholderDef {
  key: PlaceholderKey;
  expr: string;
  /** Name des Chips je Prompt-Sprache ({{Name}}); erkannt werden die Namen aller Sprachen */
  names: Record<Lang, string>;
  /** Erklärung (Oberfläche, deutsch als Schlüssel für t()) */
  doc: string;
  /** im Einfügen-Menü nur bei diesen Typen anbieten */
  types?: PromptType[];
}

const P = (key: PlaceholderKey, expr: string, doc: string, types?: PromptType[]): PlaceholderDef => ({ key, expr, names: PLACEHOLDER_NAMES[key], doc, types });

export const PLACEHOLDERS: PlaceholderDef[] = [
  P('beat', 'message', N_('The text of the beat'), [BEAT]),
  P('instruction', 'message', N_('The instruction typed in when running'), [CONT, EDIT]),
  P('pov', 'pov', N_('Point-of-view sentence, e.g. “Write in first person from Carla’s point of view.”'), [BEAT, CONT, EDIT]),
  P('povName', 'pov.name', N_('Name of the POV character')),
  P('language', 'novel.language', N_('Language of the novel (e.g. English)')),
  P('tense', 'novel.tense', N_('Tense of the novel (e.g. past tense)')),
  P('title', 'novel.title', N_('Novel title')),
  P('author', 'novel.author', N_('Author of the novel')),
  P('series', 'series.title', N_('Series title')),
  P('volume', 'novel.volume', N_('Volume number in the series')),
  P('chapter', 'chapter.title', N_('Title of the current chapter')),
  P('scene', 'scene.title', N_('Title of the current scene')),
];

/** Name eines Platzhalters in der Prompt-Sprache. */
export const placeholderName = (p: PlaceholderDef, lang: Lang = getLang()) => p.names[lang] ?? p.names.de;

/** Platzhalter zu einem Chip-Namen – in jeder Sprache. */
export function findPlaceholder(name: string): PlaceholderDef | undefined {
  const n = name.trim().toLowerCase();
  return PLACEHOLDERS.find((p) => Object.values(p.names).some((x) => x.toLowerCase() === n));
}

/** Chips mit Platzhalter-Namen einer anderen Sprache in die Ziel-Sprache umbenennen (Auswahlfelder bleiben). */
export function renameChips(text: string, lang: Lang, options: PromptOption[] = []): string {
  return text.replace(CHIP_RE, (all, name: string) => {
    if (options.some((o) => o.name.trim().toLowerCase() === name.trim().toLowerCase())) return all;
    const p = findPlaceholder(name);
    return p ? `{{${placeholderName(p, lang)}}}` : all;
  });
}

export const CHIP_RE = /\{\{\s*([^{}\n]+?)\s*\}\}/g;

export type ChipStatus = 'option' | 'builtin' | 'unknown';

export function chipStatus(name: string, options: PromptOption[]): ChipStatus {
  const n = name.trim().toLowerCase();
  if (options.some((o) => o.name.trim().toLowerCase() === n)) return 'option';
  if (findPlaceholder(n)) return 'builtin';
  return 'unknown';
}

// ---------------------------------------------------------------- Standard-Prompts

const words = (choices: string[], def: string, name: string): PromptOption => ({ name, choices, default: def });

/** Rolle, Aufgabe und Auswahlfelder für einen neuen Prompt dieses Typs (in der Prompt-Sprache). */
export function defaultTexts(type: PromptType, lang: Lang = getLang()): Pick<BlockPromptSpec, 'role' | 'task' | 'options'> {
  switch (type) {
    case BEAT:
      return { role: ROLE_WRITER[lang], task: TASK_BEAT[lang], options: [words(['200', '400', '600'], '400', WORDS_OPTION[lang])] };
    case CONT:
      return { role: ROLE_CONTINUE[lang], task: TASK_CONTINUE[lang], options: [words(['100', '200', '400'], '200', WORDS_OPTION[lang])] };
    case EDIT:
      return { role: ROLE_EDITOR[lang], task: TASK_REWRITE[lang], options: [] };
    case SUM:
      return { role: ROLE_SUMMARY[lang], task: TASK_SUMMARY[lang], options: [words(['100', '150', '250'], '150', LENGTH_OPTION[lang])] };
    case CHAT:
      return { role: ROLE_CHAT[lang], task: TASK_CHAT[lang], options: [] };
    default:
      return { role: '', task: '', options: [] };
  }
}

/** Alle Bausteine mit den Standardwerten des Typs (nicht passende sind enthalten, aber aus). */
export function defaultBlocks(type: PromptType): Partial<Record<BlockKind, BlockConfig>> {
  const out: Partial<Record<BlockKind, BlockConfig>> = {};
  for (const d of BLOCK_DEFS) {
    const def = d.defaults(type);
    out[d.kind] = d.types.includes(type) ? def : { ...def, on: false };
  }
  return out;
}

export function newBlockSpec(type: PromptType, lang: Lang = getLang()): BlockPromptSpec {
  return { version: 1, ...defaultTexts(type, lang), blocks: defaultBlocks(type) };
}

/** Prompt-Typ wechseln: Bausteine, die erst jetzt passen, bekommen die Standardwerte des neuen Typs. */
export function retypeSpec(spec: BlockPromptSpec, from: PromptType, to: PromptType): BlockPromptSpec {
  const blocks = { ...spec.blocks };
  for (const d of BLOCK_DEFS) if (d.types.includes(to) && !d.types.includes(from)) blocks[d.kind] = d.defaults(to);
  return { ...spec, blocks };
}

export function blockConfig(spec: BlockPromptSpec, kind: BlockKind): BlockConfig {
  return spec.blocks[kind] ?? { ...blockDef(kind).defaults('scene-beat-completion'), on: false };
}

// ---------------------------------------------------------------- Übersetzen in Nachrichten

/** Freien Text für die Engine schützen: geschweifte Klammern sind dort Ausdrücke. */
function escapeText(s: string): string {
  return s.replace(/[{}]/g, (c) => '\\' + c);
}

const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function compileText(text: string, options: PromptOption[], warnings: string[]): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(CHIP_RE)) {
    out += escapeText(text.slice(last, m.index));
    last = m.index! + m[0].length;
    const name = m[1].trim();
    const opt = options.find((o) => o.name.trim().toLowerCase() === name.toLowerCase());
    if (opt) {
      out += `{input(${quote(opt.name.trim())})}`;
      continue;
    }
    const ph = findPlaceholder(name);
    if (ph) {
      out += `{${ph.expr}}`;
      continue;
    }
    warnings.push(t('Unknown placeholder {chip} — stays as text. Create an option field “{name}” or choose a placeholder from the list.', { chip: `{{${name}}}`, name }));
    out += escapeText(m[0]);
  }
  return out + escapeText(text.slice(last));
}

/** Interner Name der Kontextauswahl (in allen Sprachen gleich; angezeigt wird FRAMING.contextLabel). */
export const CONTEXT_INPUT_NAME = 'Kontext';
const CONTEXT_KINDS: RefKind[] = ['act', 'chapter', 'scene', 'snippet', 'codex', 'fullNovel'];

function optionToInput(o: PromptOption, lang: Lang): PromptInput {
  const name = o.name.trim();
  if (!o.choices.length) return { name, description: '', mode: 'single', types: ['text'], settings: { text: { placeholder: o.default, default: o.default } }, default: o.default ? [{ type: 'text', value: o.default }] : undefined };
  const idx = Math.max(0, o.choices.indexOf(o.default));
  return {
    name,
    description: '',
    required: true,
    mode: 'single',
    types: ['dropdown', 'text'],
    default: [{ type: 'uiDropdown', id: String(idx) }],
    settings: { dropdown: { options: o.choices }, text: { placeholder: `${FRAMING[lang].eg} ${o.choices[idx] ?? ''}` } },
  };
}

export interface CompiledBlockPrompt {
  messages: PromptMessage[];
  inputs: PromptInput[];
  warnings: string[];
}

const join = (parts: string[]) => parts.filter((p) => p.trim()).join('\n\n');
const msg = (type: PromptMessage['type'], text: string): PromptMessage => ({ type, text, format: 'aic2' });

/** Baustein-Prompt → Nachrichten + Eingabefelder für die Template-Engine. Rahmentexte in der Prompt-Sprache. */
export function compileBlockPrompt(spec: BlockPromptSpec, type: PromptType, lang: Lang = getLang()): CompiledBlockPrompt {
  const warnings: string[] = [];
  const F = FRAMING[lang];
  const tag = (name: string, body: string) => `<${name}>\n${body}\n</${name}>`;
  const options = spec.options.filter((o) => o.name.trim());
  const seen = new Set<string>();
  for (const o of options) {
    const k = o.name.trim().toLowerCase();
    if (seen.has(k)) warnings.push(t('The option field “{name}” exists twice.', { name: o.name }));
    seen.add(k);
    if (k === CONTEXT_INPUT_NAME.toLowerCase()) warnings.push(t('“{name}” is reserved for the context picker — please choose a different name.', { name: CONTEXT_INPUT_NAME }));
  }
  const b = (kind: BlockKind): BlockConfig | null => {
    const c = spec.blocks[kind];
    return c?.on && blockApplies(kind, type) ? c : null;
  };
  const isEdit = type === EDIT;

  // --- Anweisungen (Systemnachricht)
  const instructions: string[] = [];
  if (b('novelInstructions'))
    instructions.push(`{#if novel.instructions}\n${F.instructions}\n${tag(F.tagInstructions, '{novel.instructions}')}\n{#endif}`);
  const banned = b('bannedWords');
  if (banned) {
    const entry = banned.entry?.trim();
    if (!entry) warnings.push(t('“Banned words”: no codex entry specified.'));
    else instructions.push(`{#if codex.aliases(${quote(entry)})}\n${F.avoid} {codex.aliases(${quote(entry)})}\n{#endif}`);
  }

  // --- Kontext
  const context: string[] = [];
  if (b('novelInfo')) {
    const N = F.novel;
    context.push(
      `<${N.tag}>\n${N.title}: {novel.title}\n{#if novel.author}\n${N.author}: {novel.author}\n{#endif}\n${N.language}: {novel.language}\n${N.tense}: {novel.tense}\n{#if novel.hasSeries}\n${N.series}: {series.title}{#if novel.volume}, ${N.volume} {novel.volume}{#endif}\n{#endif}\n{#if novel.description}\n${N.blurb}: {novel.description}\n{#endif}\n</${N.tag}>`,
    );
  }
  if (b('codex')) context.push(`{#if codex.context}\n${F.codex}\n${tag(F.tagCodex, '{codex.context}')}\n{#endif}`);
  if (b('storySoFar')) context.push(`{#if storySoFar}\n${F.storySoFar}\n${tag(F.tagStory, '{storySoFar}')}\n{#endif}`);
  if (b('sceneSummary')) context.push(`{#if scene.summary}\n${F.scenePlan}\n${tag(F.tagPlan, '{scene.summary}')}\n{#endif}`);
  if (b('sourceText'))
    context.push(
      `{#if scene}\n${F.scene}{#if scene.title} ${F.q[0]}{scene.title}${F.q[1]}{#endif}:\n${tag(F.tagScene, '{scene.fullText}')}\n{#elseif chapter}\n${F.sceneSummaries}\n${tag(F.tagScenes, '{chapter.sceneSummaries}')}\n{#else}\n${F.chapterSummaries}\n${tag(F.tagChapters, '{novel.chapterSummaries}')}\n{#endif}`,
    );
  const inputs: PromptInput[] = [];
  if (b('context')) {
    // Was schon über den Kodex-Baustein kommt, nicht doppelt schicken
    const value = b('codex') ? `without(input(${quote(CONTEXT_INPUT_NAME)}), codex.context)` : `input(${quote(CONTEXT_INPUT_NAME)})`;
    context.push(`{local('nmKontext', ${value})}\n{#if local('nmKontext')}\n${F.extra}\n${tag(F.tagExtra, "{asXml(local('nmKontext'))}")}\n{#endif}`);
    inputs.push({
      name: CONTEXT_INPUT_NAME,
      description: F.contextDesc,
      mode: 'multiple',
      addToContext: true,
      displayName: F.contextLabel,
      types: CONTEXT_KINDS as PromptInput['types'],
    });
  }

  // --- Text rund um den Cursor
  const before = b('textBefore');
  const prev = b('previousSceneEnd');
  const beforeExpr = (w: number | undefined) => (w && w > 0 ? `wordsBefore(${Math.round(w)})` : 'textBefore');
  const prevCond = (c: BlockConfig) => (c.samePov !== false ? 'and(isStartOfText, pov.character is pov.character(scene.previous))' : 'isStartOfText');
  const prevExpr = (c: BlockConfig) => `lastWords(scene.fullText(scene.previous), ${Math.max(1, Math.round(c.words ?? 650))})`;
  const example: string[] = [];
  if (before?.asExample) {
    if (prev) example.push(`{#if ${prevCond(prev)}}\n{${prevExpr(prev)}}\n{#endif}`);
    example.push(`{${beforeExpr(before.words)}}`);
  } else {
    if (prev) context.push(`{#if ${prevCond(prev)}}\n${F.prevScene}\n${tag(F.tagPrev, `{${prevExpr(prev)}}`)}\n{#endif}`);
    if (before) {
      const e = beforeExpr(before.words);
      context.push(`{#if ${e}}\n${isEdit ? F.beforeEdit : F.beforeWrite}:\n${tag(F.tagBefore, `{${e}}`)}\n{#endif}`);
    }
  }

  // --- Aufgabe
  const task: string[] = [compileText(spec.task, options, warnings)];
  if (b('selection')) task.push(tag(F.tagSelection, '{selection}'));
  const after = b('textAfter');
  if (after) {
    const e = after.words && after.words > 0 ? `wordsAfter(${Math.round(after.words)})` : 'textAfter';
    task.push(`{#if ${e}}\n${isEdit ? F.afterEdit : F.afterWrite}:\n${tag(F.tagAfter, `{${e}}`)}\n{#endif}`);
  }
  if (type === EDIT && !b('selection')) warnings.push(t('“Selected text” is off — the AI won’t receive the passage to edit.'));

  const role = compileText(spec.role, options, warnings);
  inputs.unshift(...options.map((o) => optionToInput(o, lang)));

  // Chat: alles in die Systemnachricht, der Verlauf hängt hinten an
  if (type === CHAT) return { messages: [msg('system', join([role, ...context, join(task), ...instructions]))], inputs, warnings };
  const messages = [msg('system', join([role, ...instructions])), msg('user', join(context)), msg('assistant', join(example)), msg('user', join(task))].filter((m) => m.text.trim());
  return { messages, inputs, warnings };
}

// ---------------------------------------------------------------- Importierte Prompts umwandeln

export type ConvertResult = { ok: true; spec: BlockPromptSpec; notes: string[] } | { ok: false; errors: string[] };

const ws = String.raw`\s*`;
const inc = (name: string) => new RegExp(String.raw`\{${ws}include\(${ws}["']Novelmaker/${name.replace('/', '\\/')}["']${ws}\)${ws}\}`, 'gi');

const CHIP_FROM_EXPR: [RegExp, PlaceholderKey][] = [
  [/\{\s*novel\.tense\s*\}/gi, 'tense'],
  [/\{\s*novel\.language\s*\}/gi, 'language'],
  [/\{\s*pov\.name\s*\}/gi, 'povName'],
  [/\{\s*pov\s*\}/gi, 'pov'],
  [/\{\s*novel\.title\s*\}/gi, 'title'],
  [/\{\s*novel\.author\s*\}/gi, 'author'],
  [/\{\s*series\.title\s*\}/gi, 'series'],
  [/\{\s*novel\.volume\s*\}/gi, 'volume'],
  [/\{\s*chapter\.title\s*\}/gi, 'chapter'],
  [/\{\s*scene\.title\s*\}/gi, 'scene'],
];

/**
 * Versucht, einen (z. B. aus Novelcrafter importierten) Skript-Prompt in Bausteine zu übersetzen.
 * Klappt, wenn er nur die üblichen Muster nutzt; sonst kommt eine Liste der Hindernisse zurück.
 */
/** i18n-t unter anderem Namen: in convertToBlocks heißt der Nachrichtentext „t“. */
const tr = t;

export function convertToBlocks(prompt: { type: PromptType; messages: PromptMessage[]; inputs: PromptInput[] }, lang: Lang = getLang()): ConvertResult {
  const type = prompt.type;
  if (!BLOCK_PROMPT_TYPES.includes(type as PromptKindForBlocks)) return { ok: false, errors: [tr('Prompts of type “{type}” can’t be converted to blocks.', { type })] };
  const errors: string[] = [];
  const notes: string[] = [];
  const blocks: Partial<Record<BlockKind, BlockConfig>> = {};
  for (const d of BLOCK_DEFS) blocks[d.kind] = { ...d.defaults(type), on: false };
  const set = (kind: BlockKind, c: Partial<BlockConfig>) => (blocks[kind] = { ...blocks[kind]!, ...c, on: true });
  const messageChip = PLACEHOLDER_NAMES[type === BEAT ? 'beat' : 'instruction'][lang];

  const roleParts: string[] = [];
  const taskParts: string[] = [];
  const lastUser = prompt.messages.map((m) => m.type).lastIndexOf('user');

  prompt.messages.forEach((m, i) => {
    let t = m.text.replace(/\{![\s\S]*?!\}/g, '');
    const take = (re: RegExp, fn: (...g: string[]) => void) => {
      t = t.replace(re, (...a: string[]) => {
        fn(...a.slice(1));
        return '';
      });
    };
    take(inc('AdditionalInstructions'), () => set('novelInstructions', {}));
    take(inc('Codex'), () => set('codex', {}));
    take(inc('AdditionalContext'), () => set('context', {}));
    take(inc('Chat/DefaultContext'), () => (set('novelInfo', {}), set('codex', {}), set('context', {})));
    take(inc('Chat/DefaultInstructions'), () => {
      set('novelInstructions', {});
      taskParts.push(TASK_CHAT[lang]);
    });
    take(/\{#if\s+storySoFar\s*\}[\s\S]*?\{\s*storySoFar\s*\}[\s\S]*?\{#endif\s*\}/gi, () => set('storySoFar', {}));
    take(
      /\{#if\s+and\(\s*isStartOfText\s*,\s*pov\.character\s+is\s+pov\.character\(\s*scene\.previous\s*\)\s*\)\s*\}\s*\{\s*lastWords\(\s*scene\.fullText\(\s*scene\.previous\s*\)\s*,\s*(\d+)\s*\)\s*\}\s*\{#endif\s*\}/gi,
      (n) => set('previousSceneEnd', { words: Number(n), samePov: true }),
    );
    take(/\{#if\s+isStartOfText\s*\}\s*\{\s*lastWords\(\s*scene\.fullText\(\s*scene\.previous\s*\)\s*,\s*(\d+)\s*\)\s*\}\s*\{#endif\s*\}/gi, (n) =>
      set('previousSceneEnd', { words: Number(n), samePov: false }),
    );
    take(/\{#if\s+(?:textAfter|wordsAfter\(\s*\d+\s*\))\s*\}[\s\S]*?\{\s*(?:wordsAfter\(\s*(\d+)\s*\)|textAfter)\s*\}[\s\S]*?\{#endif\s*\}/gi, (n) =>
      set('textAfter', { words: n ? Number(n) : 0 }),
    );
    take(/\{\s*wordsAfter\(\s*(\d+)\s*\)\s*\}/gi, (n) => set('textAfter', { words: Number(n) }));
    take(/\{\s*textAfter\s*\}/gi, () => set('textAfter', { words: 0 }));
    take(/\{#if\s+(?:textBefore|wordsBefore\(\s*\d+\s*\))\s*\}[\s\S]*?\{\s*(?:wordsBefore\(\s*(\d+)\s*\)|textBefore)\s*\}[\s\S]*?\{#endif\s*\}/gi, (n) =>
      set('textBefore', { words: n ? Number(n) : 0, asExample: m.type === 'assistant' }),
    );
    take(/\{\s*wordsBefore\(\s*(\d+)\s*\)\s*\}/gi, (n) => set('textBefore', { words: Number(n), asExample: m.type === 'assistant' }));
    take(/\{\s*textBefore\s*\}/gi, () => set('textBefore', { words: 0, asExample: m.type === 'assistant' }));
    // Zeile mit verbotenen Wörtern: „… {codex.aliases("AI-isms")} …“
    take(/^[^\n]*\{\s*codex\.aliases\(\s*["']([^"']+)["']\s*\)\s*\}[^\n]*\n?/gim, (entry) => set('bannedWords', { entry }));
    take(/(?:<(\w+)>\s*)?\{\s*selection\s*\}(?:\s*<\/\1>)?/gi, () => set('selection', {}));
    // {#if message} … {#endif} → Inhalt behalten (ein leerer Platzhalter stört nicht)
    t = t.replace(/\{#if\s+message\s*\}([\s\S]*?)\{#endif\s*\}/gi, '$1');
    t = t.replace(/\{\s*message\s*\}/gi, `{{${messageChip}}}`);
    t = t.replace(/\{\s*input\(\s*["']([^"']+)["']\s*\)\s*\}/gi, (_a, n: string) => `{{${n}}}`);
    for (const [re, key] of CHIP_FROM_EXPR) t = t.replace(re, `{{${PLACEHOLDER_NAMES[key][lang]}}}`);

    // Übrig gebliebene Ausdrücke (ohne die neuen {{Chips}}) verhindern die Umwandlung
    const rest = t.replace(CHIP_RE, '').match(/\{[^}]*\}?/g);
    if (rest)
      errors.push(
        tr('Message {n} ({role}): {parts} has no block.', {
          n: i + 1,
          role: m.type,
          parts: [...new Set(rest)].slice(0, 3).map((r) => (r.length > 60 ? r.slice(0, 57) + '…' : r)).join(', '),
        }),
      );
    const text = t
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    // Einrückungen aus Skript-Blöcken entfernen
    const clean = text.replace(/^[ \t]+(?=\S)/gm, (s) => (s.length <= 4 ? '' : s));
    if (!clean) return;
    if (m.type === 'system') roleParts.push(clean);
    else if (m.type === 'user' && (i === lastUser || type === CHAT)) taskParts.unshift(clean);
    else if (m.type === 'user') errors.push(tr('Message {n} (user) contains custom text outside the task: “{text}”', { n: i + 1, text: clean.slice(0, 60) + (clean.length > 60 ? '…' : '') }));
    else errors.push(tr('Message {n} (assistant) contains custom text: “{text}”', { n: i + 1, text: clean.slice(0, 60) + (clean.length > 60 ? '…' : '') }));
  });

  // Eingabefelder → Auswahlfelder bzw. Kontextauswahl
  const options: PromptOption[] = [];
  for (const inp of prompt.inputs) {
    const refs = inp.types.filter((x) => (CONTEXT_KINDS as string[]).includes(x));
    if (refs.length) {
      if (inp.mode === 'multiple') set('context', {});
      else errors.push(tr('Input field “{name}” (selection of a single {kind}) has no block — use “Choose context when running” instead.', { name: inp.displayName ?? inp.name, kind: refs[0] }));
      continue;
    }
    const choices = inp.settings?.dropdown?.options ?? [];
    const d = inp.default?.[0];
    const def = d?.type === 'uiDropdown' ? (choices[Number(d.id)] ?? choices[0] ?? '') : (d?.value ?? inp.settings?.text?.default ?? choices[0] ?? '');
    options.push({ name: inp.name, choices: inp.types.includes('dropdown') ? choices : [], default: def });
  }
  if (type === EDIT && !blocks.selection?.on) set('selection', {});
  if (errors.length) return { ok: false, errors };
  if (blocks.context?.on && !prompt.inputs.some((x) => x.mode === 'multiple')) notes.push(tr('Context picker carried over.'));
  return { ok: true, spec: { version: 1, role: roleParts.join('\n\n'), task: taskParts.join('\n\n'), blocks, options }, notes };
}

// ---------------------------------------------------------------- Fingerabdruck (mitgelieferte Prompts erkennen)

/** Kurzer Hash über Rollen und Texte – um unveränderte mitgelieferte Prompts zu erkennen. */
export function messagesFingerprint(messages: Pick<PromptMessage, 'type' | 'text'>[]): string {
  let h = 0x811c9dc5;
  const s = JSON.stringify(messages.map((m) => [m.type, m.text]));
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
