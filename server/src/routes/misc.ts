import type { FastifyInstance } from 'fastify';
import { CodexMatcher, effectiveCodex, t, type AppSettings } from '@novelmaker/shared';
import type { AppContext } from '../app';
import { listCodexForNovel, listSnippets } from '../repo/codex';
import { getAppSettings, updateAppSettings } from '../repo/settings';
import { exportJson, listBackups } from '../services/backup';
import type { SummaryJobOptions } from '../services/jobs';
import { estimateSummaries } from '../services/jobs';
import { loadActs } from '../services/promptdata';

type P = { id: string };

function excerpt(text: string, index: number, len: number): string {
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + len + 60);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ') + (end < text.length ? '…' : '');
}

export function registerMiscRoutes(app: FastifyInstance, { db, jobs }: AppContext) {
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/settings', async () => getAppSettings(db));
  app.patch<{ Body: Partial<AppSettings> }>('/api/settings', async (req) => updateAppSettings(db, req.body ?? {}));

  // ------------------------------------------------------------ Jobs
  app.get('/api/jobs', async () => jobs.list());
  app.get<{ Params: P }>('/api/jobs/:id', async (req) => jobs.get(req.params.id));
  app.post<{ Params: P }>('/api/jobs/:id/cancel', async (req) => {
    jobs.cancel(req.params.id);
    return { ok: true };
  });
  app.post('/api/jobs/clear', async () => {
    jobs.clearFinished();
    return { ok: true };
  });
  app.post<{ Body: SummaryJobOptions }>('/api/jobs/summaries/estimate', async (req) => estimateSummaries(db, req.body));
  app.post<{ Body: SummaryJobOptions }>('/api/jobs/summaries', async (req) => jobs.startSummaries(req.body));
  app.post<{ Body: { novelId: string; inclusion: 'auto' | 'always' | 'never' } }>('/api/jobs/volume-entry', async (req) => {
    // Band-Eintrag aus vorhandener Band-Zusammenfassung erzeugen (ohne KI)
    const row = db.prepare('SELECT summary FROM novels WHERE id = ?').get(req.body.novelId) as { summary: string } | undefined;
    if (!row?.summary.trim()) return { ok: false, error: t('This volume doesn’t have a summary yet.') };
    jobs.upsertVolumeEntry(req.body.novelId, row.summary, req.body.inclusion);
    return { ok: true };
  });

  // ------------------------------------------------------------ Suche
  app.get<{ Params: P; Querystring: { q: string } }>('/api/novels/:id/search', async (req) => {
    const q = (req.query.q ?? '').trim();
    if (q.length < 2) return { scenes: [], codex: [], snippets: [] };
    const needle = q.toLocaleLowerCase();
    const scenes: { sceneId: string; label: string; count: number; excerpts: string[] }[] = [];
    let chNo = 0;
    for (const act of loadActs(db, req.params.id))
      for (const ch of act.chapters) {
        chNo++;
        const chLabel = ch.title || t('Chapter {n}', { n: chNo });
        ch.scenes.forEach((s, i) => {
          const hay = s.text.toLocaleLowerCase();
          const hits: number[] = [];
          let idx = hay.indexOf(needle);
          while (idx >= 0 && hits.length < 50) {
            hits.push(idx);
            idx = hay.indexOf(needle, idx + needle.length);
          }
          const inTitle = s.title.toLocaleLowerCase().includes(needle) || s.summary.toLocaleLowerCase().includes(needle);
          if (hits.length || inTitle)
            scenes.push({
              sceneId: s.id,
              label: `${chLabel}${ch.scenes.length > 1 ? ` · ${t('Scene {n}', { n: i + 1 })}` : ''}${s.title ? `: ${s.title}` : ''}`,
              count: hits.length,
              excerpts: hits.slice(0, 3).map((h) => excerpt(s.text, h, q.length)),
            });
        });
      }
    const codex = listCodexForNovel(db, req.params.id)
      .filter((e) => [e.name, ...e.aliases, e.description, e.notes].some((x) => x.toLocaleLowerCase().includes(needle)))
      .map((e) => ({ id: e.id, name: e.name, type: e.type }));
    const snippets = listSnippets(db, req.params.id)
      .filter((s) => (s.title + '\n' + s.text).toLocaleLowerCase().includes(needle))
      .map((s) => ({ id: s.id, title: s.title }));
    return { scenes, codex, snippets };
  });

  /** Kodex-Erwähnungen je Szene (für die Plan-Ansicht). */
  app.get<{ Params: P }>('/api/novels/:id/mentions', async (req) => {
    const entries = effectiveCodex(listCodexForNovel(db, req.params.id)).entries;
    const matcher = new CodexMatcher(entries);
    const out: Record<string, string[]> = {};
    for (const act of loadActs(db, req.params.id))
      for (const ch of act.chapters) for (const s of ch.scenes) out[s.id] = [...matcher.mentionedIds(s.text)];
    return out;
  });

  // ------------------------------------------------------------ Sicherung
  app.get('/api/backups', async () => listBackups());
  app.get('/api/backup/export.json', async (_req, reply) => {
    const d = new Date().toISOString().slice(0, 10);
    reply.header('Content-Disposition', `attachment; filename="novelmaker-export-${d}.json"`);
    return exportJson(db);
  });
}
