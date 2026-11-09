import type { FastifyInstance } from 'fastify';
import { t } from '@novelmaker/shared';
import type { AppContext } from '../app';
import { HttpError } from '../db';
import { getAppSettings } from '../repo/settings';
import { createBackup } from '../services/backup';
import type { MoveMode } from '../services/system';

export function registerSystemRoutes(app: FastifyInstance, { db, system }: AppContext) {
  app.get('/api/system', async () => system.info());

  /** Was liegt in diesem Ordner? (für den Dialog „Speicherort ändern“) */
  app.post<{ Body: { folder: string } }>('/api/system/check-folder', async (req) => {
    if (!req.body?.folder?.trim()) throw new HttpError(400, t('No folder specified.'));
    return system.checkFolder(req.body.folder);
  });

  app.post<{ Body: { folder: string; mode: MoveMode } }>('/api/system/db-location', async (req) => {
    if (!req.body?.folder?.trim()) throw new HttpError(400, t('No folder specified.'));
    return system.changeDbLocation(req.body.folder, req.body.mode);
  });

  app.post<{ Body: { folder: string | null } }>('/api/system/backup-dir', async (req) => ({ backupDir: system.setBackupDir(req.body?.folder ?? null) }));

  app.post<{ Body: { initial?: string } }>('/api/system/browse', async (req) => ({ path: await system.browseFolder(req.body?.initial) }));

  app.post<{ Body: { path: string } }>('/api/system/reveal', async (req) => {
    system.reveal(req.body.path);
    return { ok: true };
  });

  app.post('/api/backups', async () => ({ file: createBackup(db, getAppSettings(db).backupsToKeep, 'manuell') }));

  /** Novelmaker beenden: Sicherung anlegen, Sperre lösen, Server stoppen (das Konsolenfenster schließt sich dann). */
  app.post('/api/system/shutdown', async (_req, reply) => {
    if (!system.onShutdown) throw new HttpError(400, t('Quitting isn’t possible here.'));
    reply.send({ ok: true });
    setTimeout(() => void system.onShutdown?.(), 200);
    return reply;
  });
}
