import type { FastifyInstance } from 'fastify';
import { t, type ImportOptions, type Novel, type PMDoc, type Scene, type Series } from '@novelmaker/shared';
import type { AppContext } from '../app';
import { HttpError } from '../db';
import * as R from '../repo/novels';
import { getAppSettings } from '../repo/settings';
import { createBackup } from '../services/backup';
import { planExport, renderClipboard, renderDocx, renderMarkdown, type ExportScope } from '../services/exporters';
import { analyzeImport, runImport } from '../services/importers';

type P = { id: string };

function safeFilename(s: string) {
  return (s || 'roman').replace(/[^\p{L}\p{N} _.-]+/gu, '').trim() || 'roman';
}

export function registerNovelRoutes(app: FastifyInstance, { db }: AppContext) {
  /** Vor großen Löschungen (Roman, Serie) die Datenbank sichern. */
  const backupBeforeDelete = () => {
    try {
      createBackup(db, getAppSettings(db).backupsToKeep, 'vor-loeschen');
    } catch (e) {
      console.error(t('Backup before deleting failed: {error}', { error: (e as Error).message }));
    }
  };

  // ------------------------------------------------------------ Serien
  app.get('/api/series', async () => R.listSeries(db));
  app.post<{ Body: { title: string; description?: string } }>('/api/series', async (req) => R.createSeries(db, req.body));
  app.patch<{ Params: P; Body: Partial<Series> }>('/api/series/:id', async (req) => R.updateSeries(db, req.params.id, req.body));
  // ?volumes=delete löscht auch alle Bände, sonst werden sie Einzelromane
  app.delete<{ Params: P; Querystring: { volumes?: string } }>('/api/series/:id', async (req) => {
    R.getSeries(db, req.params.id);
    backupBeforeDelete();
    R.deleteSeries(db, req.params.id, { deleteVolumes: req.query.volumes === 'delete' });
    return { ok: true };
  });
  app.post<{ Params: P; Body: { title?: string } }>('/api/series/:id/volumes', async (req) => R.createVolume(db, req.params.id, req.body ?? {}));

  // ------------------------------------------------------------ Romane
  app.get('/api/novels', async () => R.listNovels(db));
  app.post<{ Body: R.CreateNovelInput }>('/api/novels', async (req) => R.createNovel(db, req.body ?? {}));
  app.get<{ Params: P }>('/api/novels/:id', async (req) => R.getNovel(db, req.params.id));
  app.patch<{ Params: P; Body: Partial<Novel> }>('/api/novels/:id', async (req) => R.updateNovel(db, req.params.id, req.body));
  app.delete<{ Params: P }>('/api/novels/:id', async (req) => {
    R.getNovel(db, req.params.id);
    backupBeforeDelete();
    R.deleteNovel(db, req.params.id);
    return { ok: true };
  });
  app.get<{ Params: P }>('/api/novels/:id/outline', async (req) => R.getOutline(db, req.params.id));
  app.get<{ Params: P }>('/api/novels/:id/manuscript', async (req) => {
    const outline = R.getOutline(db, req.params.id);
    const scenes = R.getFullScenes(db, req.params.id);
    return { outline, scenes: Object.fromEntries(scenes.map((s) => [s.id, { id: s.id, content: s.content, updatedAt: s.updatedAt }])) };
  });
  app.post<{ Params: P; Body: { title: string; description?: string; codexIds?: string[] } }>('/api/novels/:id/convert-to-series', async (req) =>
    R.convertToSeries(db, req.params.id, req.body),
  );
  app.post<{ Params: P; Body: { seriesId: string; volumeNumber?: number | null; codexIds?: string[] } }>('/api/novels/:id/join-series', async (req) =>
    R.joinSeries(db, req.params.id, req.body),
  );
  app.post<{ Params: P }>('/api/novels/:id/leave-series', async (req) => R.leaveSeries(db, req.params.id));

  // ------------------------------------------------------------ Cover
  app.get<{ Params: P }>('/api/novels/:id/cover', async (req, reply) => {
    const c = R.getCover(db, req.params.id);
    if (!c) return reply.status(404).send({ error: t('No cover') });
    // die URL enthält ?v=<Zeitstempel> – darf also lange im Cache bleiben
    reply.header('Content-Type', c.mime).header('Cache-Control', 'private, max-age=31536000, immutable');
    return reply.send(c.data);
  });
  app.put<{ Params: P; Body: { mime: string; data: string } }>('/api/novels/:id/cover', async (req) => {
    if (!req.body?.data) throw new HttpError(400, t('No image received.'));
    return R.setCover(db, req.params.id, req.body.mime, Buffer.from(req.body.data, 'base64'));
  });
  app.delete<{ Params: P }>('/api/novels/:id/cover', async (req) => R.deleteCover(db, req.params.id));

  /**
   * Export als Word, Markdown oder für die Zwischenablage (JSON mit HTML + Klartext).
   * ?scope=novel|act|chapter|scene&item=<id>; ?sceneHeadings=0|1 überschreibt die Einstellung.
   */
  type ExportReq = { Params: P & { format: string }; Querystring: { scope?: string; item?: string; sceneHeadings?: string } };
  app.get<ExportReq>('/api/novels/:id/export/:format', async (req, reply) => {
    const { format } = req.params;
    if (!['docx', 'markdown', 'clipboard'].includes(format)) throw new HttpError(400, t('Unknown export format “{format}”.', { format }));
    const scope = (req.query.scope ?? 'novel') as ExportScope;
    if (!['novel', 'act', 'chapter', 'scene'].includes(scope)) throw new HttpError(400, t('Unknown scope “{scope}”.', { scope }));
    if (scope !== 'novel' && !req.query.item) throw new HttpError(400, t('No act, chapter, or scene specified.'));
    const sh = req.query.sceneHeadings;
    const sceneHeadings = sh === '1' ? true : sh === '0' ? false : getAppSettings(db).exportSceneHeadings;
    const plan = planExport(db, req.params.id, scope, req.query.item ?? null, { sceneHeadings });
    if (format === 'clipboard') return { label: plan.label, ...renderClipboard(plan) };
    const name = safeFilename(scope === 'novel' ? plan.novel.title : `${plan.novel.title} - ${plan.label}`);
    if (format === 'markdown') {
      reply.header('Content-Type', 'text/markdown; charset=utf-8').header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}.md`);
      return renderMarkdown(plan);
    }
    const buf = await renderDocx(plan);
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}.docx`);
    return reply.send(buf);
  });
  // Import (Datei base64-kodiert): docx, Markdown, Text oder Zip – einfaches Format oder Novelcrafter-Export (options.format)
  type ImportBody = { Body: { filename?: string; data: string; options?: ImportOptions } };
  const importFile = (body: ImportBody['Body'] | undefined) => {
    if (!body?.data) throw new HttpError(400, t('No file received.'));
    return { data: Buffer.from(body.data, 'base64'), filename: body.filename ?? 'Import.docx', options: body.options ?? {} };
  };
  app.post<ImportBody>('/api/import/analyze', async (req) => {
    const f = importFile(req.body);
    return analyzeImport(f.data, f.filename, f.options);
  });
  app.post<ImportBody>('/api/import', async (req) => {
    const f = importFile(req.body);
    return runImport(db, f.data, f.filename, f.options);
  });
  app.post<ImportBody>('/api/import/docx', async (req) => {
    const f = importFile(req.body);
    return runImport(db, f.data, f.filename, f.options);
  });

  // ------------------------------------------------------------ Akte & Kapitel
  app.post<{ Body: { novelId: string; title?: string; index?: number } }>('/api/acts', async (req) => {
    const act = R.createAct(db, req.body.novelId, req.body);
    // ein neuer Akt bekommt gleich ein Kapitel mit Szene
    R.createChapter(db, act.id, { withScene: true });
    return act;
  });
  app.patch<{ Params: P; Body: { title?: string; summary?: string } }>('/api/acts/:id', async (req) => {
    R.updateAct(db, req.params.id, req.body);
    return { ok: true };
  });
  app.post<{ Params: P; Body: { index: number } }>('/api/acts/:id/move', async (req) => {
    R.moveAct(db, req.params.id, req.body.index);
    return { ok: true };
  });
  app.delete<{ Params: P }>('/api/acts/:id', async (req) => {
    R.deleteAct(db, req.params.id);
    return { ok: true };
  });

  app.post<{ Body: { actId: string; title?: string; index?: number } }>('/api/chapters', async (req) => {
    const ch = R.createChapter(db, req.body.actId, { ...req.body, withScene: true });
    R.touchNovel(db, R.novelIdOfChapter(db, ch.id));
    return ch;
  });
  app.patch<{ Params: P; Body: { title?: string; summary?: string } }>('/api/chapters/:id', async (req) => {
    R.updateChapter(db, req.params.id, req.body);
    return { ok: true };
  });
  app.post<{ Params: P; Body: { actId?: string; index: number } }>('/api/chapters/:id/move', async (req) => {
    R.moveChapter(db, req.params.id, req.body.actId, req.body.index);
    return { ok: true };
  });
  app.delete<{ Params: P }>('/api/chapters/:id', async (req) => {
    R.deleteChapter(db, req.params.id);
    return { ok: true };
  });

  // ------------------------------------------------------------ Szenen
  app.post<{ Body: { chapterId: string; title?: string; index?: number; content?: PMDoc } }>('/api/scenes', async (req) =>
    R.createScene(db, req.body.chapterId, req.body),
  );
  app.get<{ Params: P }>('/api/scenes/:id', async (req) => R.getScene(db, req.params.id));
  app.patch<{ Params: P; Body: Partial<Scene> }>('/api/scenes/:id', async (req) => R.updateScene(db, req.params.id, req.body));
  app.post<{ Params: P; Body: { chapterId?: string; index: number } }>('/api/scenes/:id/move', async (req) => {
    R.moveScene(db, req.params.id, req.body.chapterId, req.body.index);
    return { ok: true };
  });
  app.delete<{ Params: P }>('/api/scenes/:id', async (req) => {
    R.deleteScene(db, req.params.id);
    return { ok: true };
  });
  app.post<{ Params: P; Body: { before: PMDoc; after: PMDoc; mode: 'scene' | 'chapter'; title?: string } }>('/api/scenes/:id/split', async (req) =>
    R.splitScene(db, req.params.id, req.body),
  );

  // ------------------------------------------------------------ Snapshots
  app.get<{ Params: P }>('/api/scenes/:id/snapshots', async (req) => R.listSnapshots(db, req.params.id));
  app.post<{ Params: P; Body: { reason?: string; content?: PMDoc } }>('/api/scenes/:id/snapshots', async (req) =>
    R.createSnapshot(db, req.params.id, req.body?.reason ?? t('Manual'), req.body?.content),
  );
  app.get<{ Params: P }>('/api/snapshots/:id', async (req) => R.getSnapshot(db, req.params.id));
  app.post<{ Params: P }>('/api/snapshots/:id/restore', async (req) => R.restoreSnapshot(db, req.params.id));
  app.delete<{ Params: P }>('/api/snapshots/:id', async (req) => {
    R.deleteSnapshot(db, req.params.id);
    return { ok: true };
  });
}
