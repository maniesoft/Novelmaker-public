// Hintergrund-Jobs: Zusammenfassungen in Stufen (Szenen → Kapitel → Band), Band-Eintrag im Kodex.
import { estimateMessagesTokens, LENGTH_OPTION_NAMES, t, type CodexInclusion, type JobInfo, type ModelRef } from '@novelmaker/shared';
import { HttpError, newId, now, type DB } from '../db';
import { createCodex, updateCodex } from '../repo/codex';
import { findModel, getProvider } from '../repo/llm';
import { getNovel, getOutline, updateChapter, updateNovel, updateScene } from '../repo/novels';
import { findPromptByKey, getPrompt } from '../repo/prompts';
import { buildParams, runGeneration } from './generate';
import { inputNumber, prepareRender } from './promptdata';

export interface SummaryJobOptions {
  novelId: string;
  model: ModelRef;
  steps: { scenes: boolean; chapters: boolean; novel: boolean };
  /** Auch vorhandene Zusammenfassungen neu erzeugen */
  regenerate: boolean;
  /** Band-Eintrag im Kodex anlegen/aktualisieren (nur bei Serien) */
  volumeEntry?: { inclusion: CodexInclusion } | null;
}

interface Task {
  kind: 'scene' | 'chapter' | 'novel';
  id: string;
  label: string;
}

interface JobState extends JobInfo {
  abort: AbortController;
}

function promptIdFor(db: DB, novelId: string, level: 'scene' | 'chapter' | 'novel'): string {
  const novel = getNovel(db, novelId);
  const custom = novel.settings.summaryPrompts?.[level];
  if (custom) {
    try {
      return getPrompt(db, custom).id;
    } catch {
      /* gelöscht → Standard */
    }
  }
  const p = findPromptByKey(db, `summary-${level}`);
  if (!p) throw new HttpError(400, t('No prompt for {level} summaries found (restore it in the prompt workshop).', { level }));
  return p.id;
}

function planTasks(db: DB, o: SummaryJobOptions): Task[] {
  const outline = getOutline(db, o.novelId);
  const tasks: Task[] = [];
  let chNo = 0;
  const chapterLabels = new Map<string, string>();
  for (const act of outline.acts)
    for (const ch of act.chapters) {
      chNo++;
      chapterLabels.set(ch.id, ch.title ? t('Chapter {n}: {title}', { n: chNo, title: ch.title }) : t('Chapter {n}', { n: chNo }));
    }
  if (o.steps.scenes) {
    for (const act of outline.acts)
      for (const ch of act.chapters)
        ch.scenes.forEach((s, i) => {
          if (s.wordCount === 0 || s.hideFromAI) return;
          if (!o.regenerate && s.summary.trim()) return;
          tasks.push({ kind: 'scene', id: s.id, label: t('{chapter}, scene {n}', { chapter: chapterLabels.get(ch.id)!, n: i + 1 }) });
        });
  }
  if (o.steps.chapters) {
    for (const act of outline.acts)
      for (const ch of act.chapters) {
        if (!ch.scenes.some((s) => s.wordCount > 0)) continue;
        if (!o.regenerate && ch.summary.trim()) continue;
        tasks.push({ kind: 'chapter', id: ch.id, label: chapterLabels.get(ch.id)! });
      }
  }
  if (o.steps.novel) tasks.push({ kind: 'novel', id: o.novelId, label: t('Volume “{title}”', { title: outline.novel.title }) });
  return tasks;
}

function renderTask(db: DB, o: SummaryJobOptions, task: Task) {
  const promptId = promptIdFor(db, o.novelId, task.kind);
  return prepareRender(db, {
    kind: 'summary',
    promptId,
    novelId: o.novelId,
    sceneId: task.kind === 'scene' ? task.id : null,
    chapterId: task.kind === 'chapter' ? task.id : null,
    inputs: {},
  });
}

export interface SummaryEstimate {
  tasks: { scenes: number; chapters: number; novel: number };
  promptTokens: number;
  completionTokens: number;
  cost: number | null;
  pricingKnown: boolean;
}

export function estimateSummaries(db: DB, o: SummaryJobOptions): SummaryEstimate {
  const tasks = planTasks(db, o);
  let promptTokens = 0;
  let completionTokens = 0;
  const outTokens = (kind: Task['kind']) => {
    const prep = renderTask(db, o, tasks.find((x) => x.kind === kind)!);
    const words = inputNumber(prep.prompt, prep.components, prep.inputs, LENGTH_OPTION_NAMES) ?? 200;
    return Math.round(words * 1.6);
  };
  const perScene = tasks.some((x) => x.kind === 'scene') ? outTokens('scene') : 0;
  const perChapter = tasks.some((x) => x.kind === 'chapter') ? outTokens('chapter') : 0;
  const sceneCount = tasks.filter((x) => x.kind === 'scene').length;
  const chapterCount = tasks.filter((x) => x.kind === 'chapter').length;
  for (const task of tasks) {
    const prep = renderTask(db, o, task);
    let pt = estimateMessagesTokens(prep.result.messages);
    if (task.kind === 'chapter') pt += Math.round((perScene * sceneCount) / Math.max(1, chapterCount)); // noch fehlende Szenen-Zusammenfassungen
    if (task.kind === 'novel') pt += perChapter * chapterCount;
    promptTokens += pt;
    completionTokens += outTokens(task.kind);
  }
  const m = findModel(db, o.model.providerId, o.model.modelId);
  const cost = m?.pricing ? promptTokens * m.pricing.prompt + completionTokens * m.pricing.completion : null;
  return {
    tasks: { scenes: sceneCount, chapters: chapterCount, novel: tasks.filter((x) => x.kind === 'novel').length },
    promptTokens,
    completionTokens,
    cost,
    pricingKnown: !!m?.pricing,
  };
}

function cleanSummary(text: string): string {
  return text
    .replace(/^\s*(#+\s*)?(Zusammenfassung|Summary)\s*:?\s*\n/i, '')
    .replace(/<\/?(summary|scene|chapter)[^>]*>/gi, '')
    .trim();
}

export class JobManager {
  private jobs = new Map<string, JobState>();

  constructor(private db: DB) {}

  list(): JobInfo[] {
    return [...this.jobs.values()].map(strip).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  get(id: string): JobInfo {
    const j = this.jobs.get(id);
    if (!j) throw new HttpError(404, t('Job not found'));
    return strip(j);
  }

  cancel(id: string) {
    const j = this.jobs.get(id);
    if (j && (j.status === 'running' || j.status === 'pending')) {
      j.abort.abort();
      j.status = 'cancelled';
      j.finishedAt = now();
    }
  }

  clearFinished() {
    for (const [id, j] of this.jobs) if (j.status !== 'running' && j.status !== 'pending') this.jobs.delete(id);
  }

  startSummaries(o: SummaryJobOptions): JobInfo {
    const db = this.db;
    const novel = getNovel(db, o.novelId);
    getProvider(db, o.model.providerId);
    if ([...this.jobs.values()].some((j) => j.novelId === o.novelId && j.status === 'running' && j.type === 'summaries'))
      throw new HttpError(409, t('A summary job is already running for this novel.'));
    const tasks = planTasks(db, o);
    const job: JobState = {
      id: newId(),
      type: 'summaries',
      title: t('Summaries: {title}', { title: novel.title }),
      novelId: o.novelId,
      status: 'running',
      progress: { done: 0, total: tasks.length },
      step: t('Starting'),
      log: [],
      cost: 0,
      startedAt: now(),
      finishedAt: null,
      error: null,
      abort: new AbortController(),
    };
    this.jobs.set(job.id, job);
    void this.runSummaries(job, o, tasks);
    return strip(job);
  }

  private async runSummaries(job: JobState, o: SummaryJobOptions, tasks: Task[]) {
    const db = this.db;
    const provider = getProvider(db, o.model.providerId);
    let consecutiveErrors = 0;
    try {
      for (const task of tasks) {
        if (job.abort.signal.aborted) break;
        job.step = task.label;
        const prep = renderTask(db, o, task);
        const params = buildParams(db, o.model, prep, undefined);
        if (params.max_tokens == null) {
          const len = inputNumber(prep.prompt, prep.components, prep.inputs, LENGTH_OPTION_NAMES);
          if (len) params.max_tokens = Math.round(len * 2 + 300);
        }
        const res = await runGeneration({
          db,
          provider,
          modelId: o.model.modelId,
          messages: prep.result.messages,
          params,
          log: { novelId: o.novelId, promptId: prep.prompt.id, promptName: prep.prompt.name, kind: `summary-${task.kind}` },
          signal: job.abort.signal,
        });
        job.cost += res.cost ?? 0;
        if (res.status === 'aborted') break;
        if (res.status === 'error' || !res.text.trim()) {
          consecutiveErrors++;
          job.log.push(`✗ ${task.label}: ${res.error ?? t('empty response')}`);
          if (consecutiveErrors >= 3) throw new Error(t('Stopped after 3 errors in a row: {error}', { error: res.error ?? t('empty responses') }));
        } else {
          consecutiveErrors = 0;
          const text = cleanSummary(res.text);
          if (task.kind === 'scene') updateScene(db, task.id, { summary: text });
          else if (task.kind === 'chapter') updateChapter(db, task.id, { summary: text });
          else {
            const n = updateNovel(db, task.id, { summary: text });
            if (o.volumeEntry && n.seriesId) this.upsertVolumeEntry(task.id, text, o.volumeEntry.inclusion);
          }
          job.log.push(`✓ ${task.label}`);
        }
        job.progress.done++;
      }
      if (job.abort.signal.aborted) {
        job.status = 'cancelled';
        job.log.push(t('Canceled.'));
      } else job.status = 'done';
    } catch (e) {
      job.status = 'error';
      job.error = (e as Error).message;
      job.log.push(t('Error: {error}', { error: job.error ?? '' }));
    } finally {
      job.step = job.status === 'done' ? t('Done') : job.step;
      job.finishedAt = now();
    }
  }

  /** Band-Eintrag „Band N: Titel“ (Typ Band, Serienebene) anlegen oder aktualisieren. */
  upsertVolumeEntry(novelId: string, summary: string, inclusion: CodexInclusion) {
    const db = this.db;
    const n = getNovel(db, novelId);
    if (!n.seriesId) return;
    const name = t('Volume {n}: {title}', { n: n.volumeNumber ?? '?', title: n.title });
    const existing = db.prepare("SELECT id FROM codex_entries WHERE type = 'volume' AND linked_novel_id = ?").get(novelId) as { id: string } | undefined;
    if (existing) updateCodex(db, existing.id, { name, aliases: [n.title], description: summary, inclusion });
    else {
      const e = createCodex(db, novelId, { level: 'series', type: 'volume', name, aliases: [n.title], description: summary, inclusion, linkedNovelId: novelId });
      return e;
    }
  }
}

function strip(j: JobState): JobInfo {
  const { abort: _a, ...rest } = j;
  return { ...rest, progress: { ...rest.progress }, log: [...rest.log] };
}
