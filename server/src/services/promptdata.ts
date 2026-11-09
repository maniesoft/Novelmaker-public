import {
  collectPromptInputs,
  defaultInputValue,
  effectiveCodex,
  getLang,
  t,
  type Lang,
  EDITOR_TYPES,
  REFERENCE_INPUT_KINDS,
  renderPrompt,
  type ChatMessageData,
  type GenerateRequest,
  type InputValues,
  type Prompt,
  type PromptActData,
  type PromptComponentData,
  type PromptData,
  type RefValue,
  type RenderablePrompt,
  type RenderResult,
} from '@novelmaker/shared';
import { HttpError, parseJson, type DB } from '../db';
import { listCodexForNovel, listSnippets } from '../repo/codex';
import { getNovel, getSeries } from '../repo/novels';
import { getPrompt, listComponents } from '../repo/prompts';

type Row = Record<string, any>;

export function loadActs(db: DB, novelId: string, sceneTextOverride?: { id: string; text: string }): PromptActData[] {
  const acts = db.prepare('SELECT id, title, summary FROM acts WHERE novel_id = ? ORDER BY sort_order, rowid').all(novelId) as Row[];
  const chapters = db
    .prepare('SELECT c.id, c.act_id, c.title, c.summary FROM chapters c JOIN acts a ON a.id = c.act_id WHERE a.novel_id = ? ORDER BY c.sort_order, c.rowid')
    .all(novelId) as Row[];
  const scenes = db
    .prepare(
      `SELECT s.id, s.chapter_id, s.title, s.summary, s.text, s.pov_character_id, s.pov_type, s.labels, s.hide_from_ai
       FROM scenes s JOIN chapters c ON c.id = s.chapter_id JOIN acts a ON a.id = c.act_id
       WHERE a.novel_id = ? ORDER BY s.sort_order, s.rowid`,
    )
    .all(novelId) as Row[];
  return acts.map((a) => ({
    id: a.id,
    title: a.title,
    summary: a.summary,
    chapters: chapters
      .filter((c) => c.act_id === a.id)
      .map((c) => ({
        id: c.id,
        title: c.title,
        summary: c.summary,
        scenes: scenes
          .filter((s) => s.chapter_id === c.id)
          .map((s) => ({
            id: s.id,
            title: s.title,
            summary: s.summary,
            text: sceneTextOverride && sceneTextOverride.id === s.id ? sceneTextOverride.text : s.text,
            povCharacterId: s.pov_character_id ?? null,
            povType: s.pov_type ?? null,
            labels: parseJson(s.labels, []),
            hideFromAI: !!s.hide_from_ai,
          })),
      })),
  }));
}

export interface BuildDataInput {
  novelId: string;
  sceneId?: string | null;
  chapterId?: string | null;
  message?: string;
  textBefore?: string | null;
  textAfter?: string | null;
  selection?: string;
  sceneText?: string;
  inputs?: InputValues;
  pinnedCodexIds?: string[];
  chat?: { history: ChatMessageData[]; message: string };
}

export function buildPromptData(db: DB, inp: BuildDataInput, components?: PromptComponentData[]): PromptData {
  const novel = getNovel(db, inp.novelId);
  const series = novel.seriesId ? getSeries(db, novel.seriesId) : null;
  // Band-Fassungen ersetzen gleichnamige Serien-Einträge; Verweise auf diese zeigen dann auf die Band-Fassung
  const { entries: codex, redirect } = effectiveCodex(listCodexForNovel(db, novel.id));
  const r = (id: string | null | undefined) => (id ? (redirect.get(id) ?? id) : (id ?? null));
  let acts = loadActs(db, novel.id, inp.sceneId && inp.sceneText != null ? { id: inp.sceneId, text: inp.sceneText } : undefined);
  let inputs = inp.inputs ?? {};
  if (redirect.size) {
    acts = acts.map((a) => ({ ...a, chapters: a.chapters.map((c) => ({ ...c, scenes: c.scenes.map((sc) => ({ ...sc, povCharacterId: r(sc.povCharacterId) })) })) }));
    inputs = Object.fromEntries(
      Object.entries(inputs).map(([k, v]) => [k, Array.isArray(v) ? v.map((ref) => (ref.type === 'codex' && ref.id ? { ...ref, id: r(ref.id)! } : ref)) : v]),
    );
  }
  return {
    novel: redirect.size ? { ...novel, povCharacterId: r(novel.povCharacterId) } : novel,
    series,
    acts,
    codex,
    snippets: listSnippets(db, novel.id),
    components: components ?? listComponents(db),
    currentSceneId: inp.sceneId ?? null,
    currentChapterId: inp.chapterId ?? null,
    message: inp.message ?? '',
    textBefore: inp.textBefore ?? null,
    textAfter: inp.textAfter ?? null,
    selection: inp.selection ?? '',
    inputs,
    pinnedCodexIds: (inp.pinnedCodexIds ?? []).map((id) => r(id)!),
    chat: inp.chat,
  };
}

/** Prompt für eine Generierung; lang = Sprache der benutzten Fassung (dazu passen die Komponenten). */
export function resolvePrompt(db: DB, req: Pick<GenerateRequest, 'promptId' | 'prompt' | 'lang'>): RenderablePrompt & { id: string | null; name: string; lang: Lang } {
  const lang = req.lang ?? getLang();
  if (req.prompt) return { ...req.prompt, id: req.promptId ?? null, name: req.prompt.name ?? t('Preview'), lang };
  if (!req.promptId) throw new HttpError(400, t('No prompt selected.'));
  const p: Prompt = getPrompt(db, req.promptId, lang);
  return { type: p.type, name: p.name, messages: p.messages, inputs: p.inputs, id: p.id, lang: p.lang };
}

/** Kontextauswahl (Chat) in das erste passende Eingabefeld (addToContext, Mehrfachauswahl) legen. */
export function applyContext(prompt: RenderablePrompt, components: PromptComponentData[], inputs: InputValues, context: RefValue[] | undefined): { inputs: InputValues; used: boolean } {
  if (!context?.length) return { inputs, used: true };
  const defs = collectPromptInputs(prompt, components);
  const target =
    defs.find((d) => d.addToContext && d.mode === 'multiple' && d.types.some((t) => REFERENCE_INPUT_KINDS.includes(t))) ??
    defs.find((d) => d.mode === 'multiple' && d.types.some((t) => REFERENCE_INPUT_KINDS.includes(t)));
  if (!target) return { inputs, used: false };
  const existing = Array.isArray(inputs[target.name]) ? (inputs[target.name] as RefValue[]) : [];
  return { inputs: { ...inputs, [target.name]: [...existing, ...context] }, used: true };
}

/** Zahl aus einem Eingabefeld (z. B. „Wörter“/„Words“); mehrere Namen = Alternativen. */
export function inputNumber(prompt: RenderablePrompt, components: PromptComponentData[], inputs: InputValues, names: string | string[]): number | null {
  const keys = (Array.isArray(names) ? names : [names]).map((n) => n.toLowerCase());
  for (const [k, v] of Object.entries(inputs)) {
    if (keys.includes(k.toLowerCase()) && typeof v === 'string' && v.trim()) {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    }
  }
  const def = collectPromptInputs(prompt, components).find((d) => keys.includes(d.name.toLowerCase()));
  const d = def ? defaultInputValue(def) : undefined;
  const n = d ? parseInt(d, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

export interface Prepared {
  prompt: RenderablePrompt & { id: string | null; name: string; lang: Lang };
  result: RenderResult;
  components: PromptComponentData[];
  inputs: InputValues;
}

export function prepareRender(db: DB, req: GenerateRequest & { chapterId?: string | null; context?: RefValue[] }): Prepared {
  const prompt = resolvePrompt(db, req);
  const components = listComponents(db, prompt.lang);
  let inputs = req.inputs ?? {};
  const ctx = applyContext(prompt, components, inputs, req.context);
  inputs = ctx.inputs;
  const isEditor = req.kind === 'beat' || req.kind === 'continue' || req.kind === 'rewrite' || (req.kind === 'preview' && req.textBefore != null);
  const data = buildPromptData(
    db,
    {
      novelId: req.novelId,
      sceneId: req.sceneId,
      chapterId: req.chapterId,
      message: req.message,
      textBefore: isEditor ? (req.textBefore ?? '') : null,
      textAfter: isEditor ? (req.textAfter ?? '') : null,
      selection: req.selection,
      sceneText: req.sceneText,
      inputs,
      pinnedCodexIds: req.pinnedCodexIds,
      chat: req.chatHistory || req.kind === 'chat' ? { history: req.chatHistory ?? [], message: req.message ?? '' } : undefined,
    },
    components,
  );
  // Werkstatt-Vorschau ohne Editorposition: so tun, als stünde der Beat am Ende der Szene
  if (req.kind === 'preview' && req.textBefore === undefined && data.currentSceneId && EDITOR_TYPES.includes(prompt.type)) {
    const scene = data.acts.flatMap((a) => a.chapters.flatMap((c) => c.scenes)).find((s) => s.id === data.currentSceneId);
    data.textBefore = scene?.text ?? '';
    data.textAfter = '';
  }
  const result = renderPrompt(prompt, data);
  if (!ctx.used)
    result.warnings.push({
      level: 'warning',
      message: t('The prompt doesn’t accept selected context (the “Choose context when running” block is off) — the selected context will be ignored.'),
    });
  return { prompt, result, components, inputs };
}
