// Funktionsregister der Template-Engine.
// Namen ignorieren Groß-/Kleinschreibung. "types" legt fest, in welchen Prompt-Typen eine Funktion verfügbar ist.
import { firstWords, lastWords, countWords } from '../doc';
import { N_, t, type Lang } from '../i18n';
import { CODEX_TYPES, type CodexType } from '../types';
import type { RenderEnv } from './engine';
import { EDITOR_TYPES, isObj, isTruthy, valuesEqual, containsValue, type Obj, type Value } from './values';

export interface FnDef {
  name: string;
  sig: string;
  doc: string;
  group: string;
  types?: string[];
  fallback?: Value;
  impl: (env: RenderEnv, args: Value[]) => Value;
}

const num = (v: Value | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const str = (env: RenderEnv, v: Value | undefined) => env.toText(v ?? null);
const list = (v: Value | undefined): Value[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

function codexOfType(env: RenderEnv, type: CodexType): Value {
  return env.codex.filter((e) => e.type === type && e.inclusion !== 'never').map((e) => env.codexObj(e)!);
}

type PovType = 'first' | 'second' | 'third-limited' | 'third-omniscient';

/** Art der Perspektive in der Sprache des Romans. */
const POV_LABELS: Record<Lang, Record<PovType, string>> = {
  en: { first: 'first person', second: 'second person', 'third-limited': 'third person limited', 'third-omniscient': 'third person omniscient' },
  de: { first: 'Ich-Perspektive', second: 'Du-Perspektive', 'third-limited': 'dritte Person (personaler Erzähler)', 'third-omniscient': 'dritte Person (auktorialer Erzähler)' },
  es: { first: 'primera persona', second: 'segunda persona', 'third-limited': 'tercera persona limitada', 'third-omniscient': 'tercera persona omnisciente' },
  uk: { first: 'перша особа', second: 'друга особа', 'third-limited': 'третя особа (обмежена перспектива)', 'third-omniscient': 'третя особа (всезнаючий оповідач)' },
  it: { first: 'prima persona', second: 'seconda persona', 'third-limited': 'terza persona limitata', 'third-omniscient': 'terza persona onnisciente' },
  fr: { first: 'première personne', second: 'deuxième personne', 'third-limited': 'troisième personne (focalisation interne)', 'third-omniscient': 'troisième personne (narrateur omniscient)' },
};

/** Satz zur Perspektive je Romansprache: [mit Namen, ohne Namen]. */
const POV_SENTENCES: Record<Lang, Record<PovType, [(name: string) => string, string]>> = {
  en: {
    first: [(n) => `Write in first person from the perspective of ${n}.`, 'Write in first person.'],
    second: [(n) => `Write in second person; "you" is ${n}.`, 'Write in second person.'],
    'third-omniscient': [() => 'Write in third person omniscient.', 'Write in third person omniscient.'],
    'third-limited': [(n) => `Write in third person limited from the perspective of ${n}.`, 'Write in third person limited.'],
  },
  de: {
    first: [(n) => `Schreibe in der Ich-Perspektive aus Sicht von ${n}.`, 'Schreibe in der Ich-Perspektive.'],
    second: [(n) => `Schreibe in der Du-Perspektive; „du“ ist ${n}.`, 'Schreibe in der Du-Perspektive.'],
    'third-omniscient': [() => 'Schreibe in der dritten Person mit auktorialem (allwissendem) Erzähler.', 'Schreibe in der dritten Person mit auktorialem (allwissendem) Erzähler.'],
    'third-limited': [(n) => `Schreibe in der dritten Person als personaler Erzähler aus Sicht von ${n}.`, 'Schreibe in der dritten Person als personaler Erzähler.'],
  },
  es: {
    first: [(n) => `Escribe en primera persona desde la perspectiva de ${n}.`, 'Escribe en primera persona.'],
    second: [(n) => `Escribe en segunda persona; «tú» es ${n}.`, 'Escribe en segunda persona.'],
    'third-omniscient': [() => 'Escribe en tercera persona con un narrador omnisciente.', 'Escribe en tercera persona con un narrador omnisciente.'],
    'third-limited': [(n) => `Escribe en tercera persona limitada desde la perspectiva de ${n}.`, 'Escribe en tercera persona limitada.'],
  },
  uk: {
    first: [(n) => `Пиши від першої особи; оповідач – ${n}.`, 'Пиши від першої особи.'],
    second: [(n) => `Пиши від другої особи; «ти» – це ${n}.`, 'Пиши від другої особи.'],
    'third-omniscient': [() => 'Пиши від третьої особи з всезнаючим оповідачем.', 'Пиши від третьої особи з всезнаючим оповідачем.'],
    'third-limited': [(n) => `Пиши від третьої особи з обмеженою перспективою; фокальний персонаж – ${n}.`, 'Пиши від третьої особи з обмеженою перспективою.'],
  },
  it: {
    first: [(n) => `Scrivi in prima persona dal punto di vista di ${n}.`, 'Scrivi in prima persona.'],
    second: [(n) => `Scrivi in seconda persona; «tu» è ${n}.`, 'Scrivi in seconda persona.'],
    'third-omniscient': [() => 'Scrivi in terza persona con un narratore onnisciente.', 'Scrivi in terza persona con un narratore onnisciente.'],
    'third-limited': [(n) => `Scrivi in terza persona limitata dal punto di vista di ${n}.`, 'Scrivi in terza persona limitata.'],
  },
  fr: {
    first: [(n) => `Écris à la première personne, du point de vue de ${n}.`, 'Écris à la première personne.'],
    second: [(n) => `Écris à la deuxième personne ; « tu » désigne ${n}.`, 'Écris à la deuxième personne.'],
    'third-omniscient': [() => 'Écris à la troisième personne, avec un narrateur omniscient.', 'Écris à la troisième personne, avec un narrateur omniscient.'],
    'third-limited': [(n) => `Écris à la troisième personne, en focalisation interne sur ${n}.`, 'Écris à la troisième personne, en focalisation interne.'],
  },
};

function povSentence(env: RenderEnv, sceneArg?: Value): string {
  const loc = env.resolveScene(sceneArg);
  const pov = env.povOf(loc);
  const name = pov.characterId ? (env.codexEntry(pov.characterId)?.name ?? '') : '';
  const table = POV_SENTENCES[env.lang] ?? POV_SENTENCES.en;
  const [withName, plain] = table[pov.type as PovType] ?? table['third-limited'];
  return name ? withName(name) : plain;
}

function sceneArg(env: RenderEnv, args: Value[]) {
  return env.resolveScene(args.length ? args[0] : undefined);
}

export const FUNCTIONS: FnDef[] = [
  // ---------------------------------------------------------- Roman & Serie
  { group: N_('Novel'), name: 'novel.title', sig: 'novel.title', doc: N_('Novel title'), impl: (env) => env.data.novel.title },
  { group: N_('Novel'), name: 'novel.author', sig: 'novel.author', doc: N_('Author'), impl: (env) => env.data.novel.author },
  { group: N_('Novel'), name: 'novel.description', sig: 'novel.description', doc: N_('Description/blurb of the novel'), impl: (env) => env.data.novel.description },
  { group: N_('Novel'), name: 'novel.summary', sig: 'novel.summary', doc: N_('Summary of the novel'), impl: (env) => env.data.novel.summary },
  { group: N_('Novel'), name: 'novel.language', sig: 'novel.language', doc: N_('Language of the novel (e.g. “English”)'), impl: (env) => env.data.novel.language },
  {
    group: N_('Novel'),
    name: 'novel.tense',
    sig: 'novel.tense',
    doc: N_('Tense: “past tense” or “present tense”'),
    impl: (env) => (env.data.novel.tense === 'present' ? 'present tense' : 'past tense'),
  },
  {
    group: N_('Novel'),
    name: 'novel.instructions',
    sig: 'novel.instructions',
    doc: N_('Additional instructions from the novel settings'),
    impl: (env) => env.data.novel.additionalInstructions,
  },
  { group: N_('Novel'), name: 'novel.hasSeries', sig: 'novel.hasSeries', doc: N_('True if the novel belongs to a series'), impl: (env) => !!env.data.series },
  { group: N_('Novel'), name: 'novel.volume', sig: 'novel.volume', doc: N_('Volume number in the series'), impl: (env) => env.data.novel.volumeNumber ?? null },
  {
    group: N_('Novel'),
    name: 'novel.outline',
    sig: 'novel.outline',
    doc: N_('All scene summaries of the novel, grouped by chapter'),
    impl: (env) => env.outlineText(env.scenes),
  },
  {
    group: N_('Novel'),
    name: 'novel.chapterSummaries',
    sig: 'novel.chapterSummaries',
    doc: N_('Chapter summaries of all chapters (otherwise their scene summaries)'),
    impl: (env) =>
      env.chapters
        .map((c) => {
          const body = env.chapterContent(c, 'summary').trim();
          return body ? `## ${env.chapterLabel(c)}\n${body}` : '';
        })
        .filter(Boolean)
        .join('\n\n'),
  },
  { group: N_('Novel'), name: 'novel.fullText', sig: 'novel.fullText', doc: N_('Full text of the novel (careful: large!)'), impl: (env) => env.fullText(env.scenes) },
  {
    group: N_('Novel'),
    name: 'novel.wordCount',
    sig: 'novel.wordCount',
    doc: N_('Word count of the novel'),
    impl: (env) => env.scenes.reduce((n, s) => n + countWords(s.scene.text), 0),
  },
  { group: N_('Series'), name: 'series.title', sig: 'series.title', doc: N_('Series title'), impl: (env) => env.data.series?.title ?? '' },
  { group: N_('Series'), name: 'series.description', sig: 'series.description', doc: N_('Series description'), impl: (env) => env.data.series?.description ?? '' },
  {
    group: N_('Series'),
    name: 'series.volumes',
    sig: 'series.volumes',
    doc: N_('Volume entries (summaries of other volumes) from the Codex'),
    impl: (env) => codexOfType(env, 'volume'),
  },

  // ---------------------------------------------------------- Perspektive
  { group: N_('Point of view'), name: 'pov', sig: 'pov', doc: N_('Point-of-view sentence in the novel’s language'), impl: (env, a) => povSentence(env, a[0]) },
  {
    group: N_('Point of view'),
    name: 'pov.character',
    sig: 'pov.character(scene?)',
    doc: N_('POV character (codex entry) of the current or given scene'),
    impl: (env, a) => {
      const loc = a.length ? env.resolveScene(a[0], false) : env.currentLoc();
      if (a.length && !loc) return null;
      const id = env.povOf(loc).characterId;
      return id ? env.codexObj(env.codexEntry(id)) : null;
    },
  },
  {
    group: N_('Point of view'),
    name: 'pov.name',
    sig: 'pov.name(scene?)',
    doc: N_('Name of the POV character'),
    impl: (env, a) => {
      const loc = a.length ? env.resolveScene(a[0], false) : env.currentLoc();
      const id = env.povOf(loc).characterId;
      return id ? (env.codexEntry(id)?.name ?? '') : '';
    },
  },
  {
    group: N_('Point of view'),
    name: 'pov.type',
    sig: 'pov.type(scene?)',
    doc: N_('Point of view type, e.g. “first person”'),
    impl: (env, a) => {
      const t = env.povOf(a.length ? env.resolveScene(a[0], false) : env.currentLoc()).type;
      return (POV_LABELS[env.lang] ?? POV_LABELS.en)[t as PovType] ?? t;
    },
  },

  // ---------------------------------------------------------- Szene
  { group: N_('Scene'), name: 'scene', sig: 'scene', doc: N_('Current scene (object)'), impl: (env) => env.sceneObj(env.currentLoc()) },
  {
    group: N_('Scene'),
    name: 'scene.title',
    sig: 'scene.title(scene?)',
    doc: N_('Scene title'),
    impl: (env, a) => {
      const l = sceneArg(env, a);
      return l ? env.sceneLabel(l) : '';
    },
  },
  {
    group: N_('Scene'),
    name: 'scene.summary',
    sig: 'scene.summary(scene?)',
    doc: N_('Summary of the scene'),
    impl: (env, a) => sceneArg(env, a)?.scene.summary ?? '',
  },
  {
    group: N_('Scene'),
    name: 'scene.fullText',
    sig: 'scene.fullText(scene?)',
    doc: N_('Full text of the scene (without beats and notes)'),
    impl: (env, a) => sceneArg(env, a)?.scene.text ?? '',
  },
  {
    group: N_('Scene'),
    name: 'scene.previous',
    sig: 'scene.previous(scene?)',
    doc: N_('Previous scene (not hidden from the AI)'),
    impl: (env, a) => env.sceneObj(env.neighborScene(sceneArg(env, a), -1)),
  },
  {
    group: N_('Scene'),
    name: 'scene.next',
    sig: 'scene.next(scene?)',
    doc: N_('Next scene'),
    impl: (env, a) => env.sceneObj(env.neighborScene(sceneArg(env, a), 1)),
  },
  { group: N_('Scene'), name: 'scene.number', sig: 'scene.number(scene?)', doc: N_('Number of the scene in the chapter'), impl: (env, a) => sceneArg(env, a)?.sceneNo ?? null },
  { group: N_('Scene'), name: 'scene.labels', sig: 'scene.labels(scene?)', doc: N_('Labels of the scene (list)'), impl: (env, a) => sceneArg(env, a)?.scene.labels ?? [] },
  {
    group: N_('Scene'),
    name: 'scene.wordCount',
    sig: 'scene.wordCount(scene?)',
    doc: N_('Word count of the scene'),
    impl: (env, a) => countWords(sceneArg(env, a)?.scene.text ?? ''),
  },
  {
    group: N_('Scene'),
    name: 'scene.chapter',
    sig: 'scene.chapter(scene?)',
    doc: N_('Chapter of the scene'),
    impl: (env, a) => {
      const l = sceneArg(env, a);
      return l ? env.chapterObj(env.chapterLoc(l.chapter.id)) : null;
    },
  },
  {
    group: N_('Scene'),
    name: 'storySoFar',
    sig: 'storySoFar',
    doc: N_('All scene summaries up to (not including) the current scene'),
    impl: (env) => {
      const cur = env.currentLoc();
      if (cur) return env.outlineText(env.scenes.slice(0, cur.index));
      const ch = env.currentChapterLoc();
      if (ch) {
        const first = env.scenes.findIndex((s) => s.chapter.id === ch.chapter.id);
        return env.outlineText(first >= 0 ? env.scenes.slice(0, first) : []);
      }
      return env.outlineText(env.scenes);
    },
  },
  {
    group: N_('Scene'),
    name: 'previousScenes',
    sig: 'previousScenes(n)',
    doc: N_('The last n scenes before the current one (objects)'),
    impl: (env, a) => {
      const cur = env.currentLoc();
      if (!cur) return [];
      const n = num(a[0], 1);
      return env.scenes
        .slice(0, cur.index)
        .filter((s) => !s.scene.hideFromAI)
        .slice(-n)
        .map((s) => env.sceneObj(s)!);
    },
  },

  // ---------------------------------------------------------- Kapitel & Akt
  { group: N_('Chapter'), name: 'chapter', sig: 'chapter', doc: N_('Current chapter (object)'), impl: (env) => env.chapterObj(env.currentChapterLoc()) },
  {
    group: N_('Chapter'),
    name: 'chapter.title',
    sig: 'chapter.title(chapter?)',
    doc: N_('Chapter title (e.g. “Chapter 3: Arrival”)'),
    impl: (env, a) => {
      const c = env.resolveChapter(a[0]);
      return c ? env.chapterLabel(c) : '';
    },
  },
  {
    group: N_('Chapter'),
    name: 'chapter.summary',
    sig: 'chapter.summary(chapter?)',
    doc: N_('Summary of the chapter (otherwise the scene summaries)'),
    impl: (env, a) => {
      const c = env.resolveChapter(a[0]);
      return c ? env.chapterContent(c, 'summary') : '';
    },
  },
  {
    group: N_('Chapter'),
    name: 'chapter.fullText',
    sig: 'chapter.fullText(chapter?)',
    doc: N_('Full text of the chapter'),
    impl: (env, a) => {
      const c = env.resolveChapter(a[0]);
      return c ? env.chapterContent(c, 'full') : '';
    },
  },
  { group: N_('Chapter'), name: 'chapter.number', sig: 'chapter.number(chapter?)', doc: N_('Chapter number'), impl: (env, a) => env.resolveChapter(a[0])?.chapterNo ?? null },
  {
    group: N_('Chapter'),
    name: 'chapter.scenes',
    sig: 'chapter.scenes(chapter?)',
    doc: N_('Scenes of the chapter (list)'),
    impl: (env, a) => {
      const c = env.resolveChapter(a[0]);
      return c ? c.chapter.scenes.filter((s) => !s.hideFromAI).map((s) => env.sceneObj(env.sceneLoc(s.id))!) : [];
    },
  },
  {
    group: N_('Chapter'),
    name: 'chapter.sceneSummaries',
    sig: 'chapter.sceneSummaries(chapter?)',
    doc: N_('The chapter’s scene summaries, numbered'),
    impl: (env, a) => {
      const c = env.resolveChapter(a[0]);
      if (!c) return '';
      return c.chapter.scenes
        .filter((s) => !s.hideFromAI && s.summary.trim())
        .map((s, i) => `${i + 1}. ${s.summary.trim()}`)
        .join('\n');
    },
  },
  {
    group: N_('Chapter'),
    name: 'chapter.previous',
    sig: 'chapter.previous(chapter?)',
    doc: N_('Previous chapter'),
    impl: (env, a) => {
      const c = env.resolveChapter(a[0]);
      return c && c.index > 0 ? env.chapterObj(env.chapters[c.index - 1]) : null;
    },
  },
  {
    group: N_('Chapter'),
    name: 'chapter.next',
    sig: 'chapter.next(chapter?)',
    doc: N_('Next chapter'),
    impl: (env, a) => {
      const c = env.resolveChapter(a[0]);
      return c && c.index < env.chapters.length - 1 ? env.chapterObj(env.chapters[c.index + 1]) : null;
    },
  },
  {
    group: N_('Act'),
    name: 'act',
    sig: 'act',
    doc: N_('Current act (object)'),
    impl: (env) => {
      const a = env.resolveAct(undefined);
      return a ? { $kind: 'act', id: a.act.id } : null;
    },
  },
  {
    group: N_('Act'),
    name: 'act.title',
    sig: 'act.title(act?)',
    doc: N_('Act title'),
    impl: (env, a) => {
      const x = env.resolveAct(a[0]);
      return x ? env.actLabel(x) : '';
    },
  },
  {
    group: N_('Act'),
    name: 'act.summary',
    sig: 'act.summary(act?)',
    doc: N_('Summary of the act (otherwise chapter overview)'),
    impl: (env, a) => {
      const x = env.resolveAct(a[0]);
      if (!x) return '';
      return x.act.summary.trim() || env.outlineText(env.scenes.filter((s) => s.act.id === x.act.id));
    },
  },
  {
    group: N_('Act'),
    name: 'act.fullText',
    sig: 'act.fullText(act?)',
    doc: N_('Full text of the act'),
    impl: (env, a) => {
      const x = env.resolveAct(a[0]);
      return x ? env.fullText(env.scenes.filter((s) => s.act.id === x.act.id)) : '';
    },
  },
  { group: N_('Act'), name: 'act.number', sig: 'act.number(act?)', doc: N_('Act number'), impl: (env, a) => env.resolveAct(a[0])?.actNo ?? null },
  {
    group: N_('Act'),
    name: 'act.chapters',
    sig: 'act.chapters(act?)',
    doc: N_('Chapters of the act'),
    impl: (env, a) => {
      const x = env.resolveAct(a[0]);
      return x ? x.act.chapters.map((c) => env.chapterObj(env.chapterLoc(c.id))!) : [];
    },
  },

  // ---------------------------------------------------------- Text an der Cursorposition
  { group: N_('Text'), name: 'message', sig: 'message', doc: N_('Beat text, instruction, or chat message'), impl: (env) => env.data.message ?? '' },
  {
    group: N_('Text'),
    name: 'textBefore',
    sig: 'textBefore',
    doc: N_('Scene text before the beat or cursor'),
    types: EDITOR_TYPES,
    fallback: '',
    impl: (env) => env.data.textBefore ?? '',
  },
  {
    group: N_('Text'),
    name: 'textAfter',
    sig: 'textAfter',
    doc: N_('Scene text after the beat or cursor'),
    types: EDITOR_TYPES,
    fallback: '',
    impl: (env) => env.data.textAfter ?? '',
  },
  {
    group: N_('Text'),
    name: 'wordsBefore',
    sig: 'wordsBefore(n)',
    doc: N_('The last n words before the cursor'),
    types: EDITOR_TYPES,
    fallback: '',
    impl: (env, a) => lastWords(env.data.textBefore ?? '', num(a[0], 1000)),
  },
  {
    group: N_('Text'),
    name: 'wordsAfter',
    sig: 'wordsAfter(n)',
    doc: N_('The first n words after the cursor'),
    types: EDITOR_TYPES,
    fallback: '',
    impl: (env, a) => firstWords(env.data.textAfter ?? '', num(a[0], 1000)),
  },
  {
    group: N_('Text'),
    name: 'isStartOfText',
    sig: 'isStartOfText',
    doc: N_('True if there’s no text in the scene before the beat/cursor yet'),
    types: EDITOR_TYPES,
    fallback: false,
    impl: (env) => !(env.data.textBefore ?? '').trim(),
  },
  {
    group: N_('Text'),
    name: 'selection',
    sig: 'selection',
    doc: N_('Selected text (for replacing text)'),
    impl: (env) => env.data.selection ?? '',
  },
  { group: N_('Text'), name: 'selectedText', sig: 'selectedText', doc: N_('Alias for selection'), impl: (env) => env.data.selection ?? '' },
  {
    group: N_('Text'),
    name: 'lastWords',
    sig: 'lastWords(text, n)',
    doc: N_('The last n words of a text'),
    impl: (env, a) => lastWords(str(env, a[0]), num(a[1], 100)),
  },
  {
    group: N_('Text'),
    name: 'firstWords',
    sig: 'firstWords(text, n)',
    doc: N_('The first n words of a text'),
    impl: (env, a) => firstWords(str(env, a[0]), num(a[1], 100)),
  },
  { group: N_('Text'), name: 'wordCount', sig: 'wordCount(text)', doc: N_('Word count of a text'), impl: (env, a) => countWords(str(env, a[0])) },
  { group: N_('Text'), name: 'upper', sig: 'upper(text)', doc: N_('To uppercase'), impl: (env, a) => str(env, a[0]).toLocaleUpperCase() },
  { group: N_('Text'), name: 'lower', sig: 'lower(text)', doc: N_('To lowercase'), impl: (env, a) => str(env, a[0]).toLocaleLowerCase() },
  { group: N_('Text'), name: 'trim', sig: 'trim(text)', doc: N_('Remove leading and trailing whitespace'), impl: (env, a) => str(env, a[0]).trim() },

  // ---------------------------------------------------------- Kodex
  {
    group: N_('Codex'),
    name: 'codex.context',
    sig: 'codex.context',
    doc: N_('Relevant codex entries: always included, POV, pinned, mentioned (with token budget)'),
    impl: (env) => env.codexSelection().included.map((e) => env.codexObj(e)!),
  },
  {
    group: N_('Codex'),
    name: 'codex.global',
    sig: 'codex.global',
    doc: N_('Entries with inclusion “always” (style, language, genre…)'),
    impl: (env) => env.codex.filter((e) => e.inclusion === 'always').map((e) => env.codexObj(e)!),
  },
  {
    group: N_('Codex'),
    name: 'codex.mentioned',
    sig: 'codex.mentioned',
    doc: N_('Only the entries mentioned in the current text'),
    impl: (env) => {
      const sel = env.codexSelection();
      return [...sel.mentionedIds].map((id) => env.codexObj(env.codexEntry(id))).filter((x): x is Obj => !!x);
    },
  },
  {
    group: N_('Codex'),
    name: 'codex.get',
    sig: 'codex.get(name, …)',
    doc: N_('Codex entry by name or alias (including entries with inclusion “never”)'),
    impl: (env, a) => {
      const found = a.map((x) => env.codexObj(env.findCodex(x))).filter((x): x is Obj => !!x);
      return a.length <= 1 ? (found[0] ?? null) : found;
    },
  },
  {
    group: N_('Codex'),
    name: 'codex.aliases',
    sig: 'codex.aliases(name)',
    doc: N_('An entry’s aliases as a list (e.g. banned words)'),
    impl: (env, a) => env.findCodex(a[0])?.aliases.filter(Boolean) ?? [],
  },
  { group: N_('Codex'), name: 'codex.name', sig: 'codex.name(entry)', doc: N_('Name of an entry'), impl: (env, a) => env.findCodex(a[0])?.name ?? '' },
  {
    group: N_('Codex'),
    name: 'codex.description',
    sig: 'codex.description(entry)',
    doc: N_('Description of an entry'),
    impl: (env, a) => env.findCodex(a[0])?.description ?? '',
  },
  {
    group: N_('Codex'),
    name: 'codex.type',
    sig: 'codex.type(entry)',
    doc: N_('Type of an entry'),
    impl: (env, a) => {
      const e = env.findCodex(a[0]);
      return e ? (CODEX_TYPES.find((t) => t.value === e.type)?.xmlTag ?? e.type) : '';
    },
  },
  {
    group: N_('Codex'),
    name: 'codex.field',
    sig: 'codex.field(entry, key)',
    doc: N_('Value of a custom field'),
    impl: (env, a) => {
      const e = env.findCodex(a[0]);
      const k = str(env, a[1]).trim().toLowerCase();
      return e?.fields.find((f) => f.key.trim().toLowerCase() === k)?.value ?? '';
    },
  },
  { group: N_('Codex'), name: 'codex.characters', sig: 'codex.characters', doc: N_('All characters'), impl: (env) => codexOfType(env, 'character') },
  { group: N_('Codex'), name: 'codex.locations', sig: 'codex.locations', doc: N_('All locations'), impl: (env) => codexOfType(env, 'location') },
  { group: N_('Codex'), name: 'codex.objects', sig: 'codex.objects', doc: N_('All objects'), impl: (env) => codexOfType(env, 'object') },
  { group: N_('Codex'), name: 'codex.items', sig: 'codex.items', doc: N_('Alias for codex.objects'), impl: (env) => codexOfType(env, 'object') },
  { group: N_('Codex'), name: 'codex.lore', sig: 'codex.lore', doc: N_('All lore entries'), impl: (env) => codexOfType(env, 'lore') },
  { group: N_('Codex'), name: 'codex.subplots', sig: 'codex.subplots', doc: N_('All subplots'), impl: (env) => codexOfType(env, 'subplot') },
  { group: N_('Codex'), name: 'codex.volumes', sig: 'codex.volumes', doc: N_('All volume entries'), impl: (env) => codexOfType(env, 'volume') },
  { group: N_('Codex'), name: 'codex.other', sig: 'codex.other', doc: N_('All other entries'), impl: (env) => codexOfType(env, 'other') },
  {
    group: N_('Codex'),
    name: 'codex.all',
    sig: 'codex.all',
    doc: N_('All codex entries (except “never”)'),
    impl: (env) => env.codex.filter((e) => e.inclusion !== 'never').map((e) => env.codexObj(e)!),
  },
  {
    group: N_('Codex'),
    name: 'codex.byTag',
    sig: 'codex.byTag(tag)',
    doc: N_('All entries with this tag'),
    impl: (env, a) => {
      const t = str(env, a[0]).trim().toLowerCase();
      return env.codex.filter((e) => e.tags.some((x) => x.toLowerCase() === t)).map((e) => env.codexObj(e)!);
    },
  },

  // ---------------------------------------------------------- Snippets
  {
    group: N_('Snippets'),
    name: 'snippet.get',
    sig: 'snippet.get(title)',
    doc: N_('Snippet by title'),
    impl: (env, a) => {
      const title = str(env, a[0]).trim().toLowerCase();
      const s = env.data.snippets.find((x) => x.title.trim().toLowerCase() === title);
      if (!s) env.warn('warning', t('Snippet “{name}” not found', { name: str(env, a[0]) }));
      return s ? { $kind: 'snippet', id: s.id } : null;
    },
  },
  {
    group: N_('Snippets'),
    name: 'snippet.text',
    sig: 'snippet.text(snippet)',
    doc: N_('Text of a snippet'),
    impl: (env, a) => {
      const v = a[0];
      if (isObj(v) && v.$kind === 'snippet') return env.data.snippets.find((x) => x.id === v.id)?.text ?? '';
      const t = str(env, v).trim().toLowerCase();
      return env.data.snippets.find((x) => x.title.trim().toLowerCase() === t)?.text ?? '';
    },
  },

  // ---------------------------------------------------------- Komposition
  {
    group: N_('Composition'),
    name: 'include',
    sig: 'include("Komponente")',
    doc: N_('Includes a prompt component'),
    impl: (env, a) => env.include(str(env, a[0])),
  },
  {
    group: N_('Composition'),
    name: 'input',
    sig: 'input("Name")',
    doc: N_('Value of an input field (name is case-insensitive)'),
    impl: (env, a) => env.inputValue(str(env, a[0])),
  },
  {
    group: N_('Composition'),
    name: 'local',
    sig: 'local("name", wert?)',
    doc: N_('Set (2 arguments) or read (1 argument) a local value'),
    impl: (env, a) => {
      const name = str(env, a[0]);
      if (a.length >= 2) {
        env.setLocal(name, a[1]);
        return null;
      }
      return env.getLocal(name);
    },
  },
  {
    group: N_('Lists'),
    name: 'without',
    sig: 'without(liste, liste2)',
    doc: N_('List without the items in liste2'),
    impl: (_env, a) => {
      const remove = list(a[1]);
      return list(a[0]).filter((x) => !remove.some((r) => valuesEqual(x, r)));
    },
  },
  {
    group: N_('Lists'),
    name: 'join',
    sig: 'join(liste, trenner?)',
    doc: N_('Join list into text'),
    impl: (env, a) =>
      list(a[0])
        .map((x) => env.toText(x))
        .filter(Boolean)
        .join(a.length > 1 ? str(env, a[1]) : ', '),
  },
  { group: N_('Lists'), name: 'count', sig: 'count(liste)', doc: N_('Number of items'), impl: (_env, a) => (typeof a[0] === 'string' ? (a[0] ? 1 : 0) : list(a[0]).length) },
  { group: N_('Lists'), name: 'first', sig: 'first(liste)', doc: N_('First item'), impl: (_env, a) => list(a[0])[0] ?? null },
  {
    group: N_('Lists'),
    name: 'last',
    sig: 'last(liste)',
    doc: N_('Last item'),
    impl: (_env, a) => {
      const l = list(a[0]);
      return l[l.length - 1] ?? null;
    },
  },
  {
    group: N_('Lists'),
    name: 'list',
    sig: 'list(a, b, …)',
    doc: N_('List of the arguments'),
    impl: (_env, a) => a.flatMap((x) => (Array.isArray(x) ? x : x == null ? [] : [x])),
  },
  { group: N_('Format'), name: 'asXml', sig: 'asXml(wert)', doc: N_('Format as XML'), impl: (env, a) => env.toText(a[0] ?? null, 'xml') },
  { group: N_('Format'), name: 'asMarkdown', sig: 'asMarkdown(wert)', doc: N_('Format as Markdown'), impl: (env, a) => env.toText(a[0] ?? null, 'markdown') },
  { group: N_('Format'), name: 'asText', sig: 'asText(wert)', doc: N_('Format as plain text'), impl: (env, a) => env.toText(a[0] ?? null, 'plain') },

  // ---------------------------------------------------------- Logik
  { group: N_('Logic'), name: 'and', sig: 'and(a, b, …)', doc: N_('True if all arguments are true'), impl: (_env, a) => a.length > 0 && a.every((x) => isTruthy(x)) },
  { group: N_('Logic'), name: 'or', sig: 'or(a, b, …)', doc: N_('True if any argument is true'), impl: (_env, a) => a.some((x) => isTruthy(x)) },
  { group: N_('Logic'), name: 'not', sig: 'not(a)', doc: N_('Negation'), impl: (_env, a) => !isTruthy(a[0]) },
  { group: N_('Logic'), name: 'isEmpty', sig: 'isEmpty(a)', doc: N_('True if empty'), impl: (_env, a) => !isTruthy(a[0]) },
  { group: N_('Logic'), name: 'isNotEmpty', sig: 'isNotEmpty(a)', doc: N_('True if not empty'), impl: (_env, a) => isTruthy(a[0]) },
  { group: N_('Logic'), name: 'is', sig: 'is(a, b)', doc: N_('Equality (also as an operator: a is b)'), impl: (_env, a) => valuesEqual(a[0], a[1]) },
  { group: N_('Logic'), name: 'equals', sig: 'equals(a, b)', doc: N_('Equality'), impl: (_env, a) => valuesEqual(a[0], a[1]) },
  {
    group: N_('Logic'),
    name: 'contains',
    sig: 'contains(liste|text, wert)',
    doc: N_('Does the list contain the value, or the text the substring?'),
    impl: (_env, a) => containsValue(a[0] ?? null, a[1] ?? null),
  },
  { group: N_('Logic'), name: 'if', sig: 'if(bedingung, dann, sonst?)', doc: N_('Conditional value'), impl: (_env, a) => (isTruthy(a[0]) ? (a[1] ?? null) : (a[2] ?? null)) },
  { group: N_('Logic'), name: 'default', sig: 'default(wert, ersatz)', doc: N_('Fallback value if empty'), impl: (_env, a) => (isTruthy(a[0]) ? a[0] : (a[1] ?? null)) },
];
