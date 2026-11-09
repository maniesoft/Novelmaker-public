import Fastify, { type FastifyInstance } from 'fastify';
import { setLang, t } from '@novelmaker/shared';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DbHandle, HttpError, ROOT_DIR, type DB } from './db';
import { getAppSettings } from './repo/settings';
import { JobManager } from './services/jobs';
import { SystemControl } from './services/system';
import { registerNovelRoutes } from './routes/novels';
import { registerCodexRoutes } from './routes/codex';
import { registerPromptRoutes } from './routes/prompts';
import { registerLlmRoutes } from './routes/llm';
import { registerGenerateRoutes } from './routes/generate';
import { registerChatRoutes } from './routes/chat';
import { registerMiscRoutes } from './routes/misc';
import { registerSystemRoutes } from './routes/system';
import { registerI18nRoutes } from './routes/i18n';

export interface AppContext {
  db: DB;
  jobs: JobManager;
  system: SystemControl;
}

/**
 * db: entweder eine feste Verbindung (Tests) oder der Proxy eines DbHandle (Programm), damit sich der
 * Speicherort ohne Neustart wechseln lässt.
 */
export async function buildApp(db: DB, opts: { logger?: boolean; serveWeb?: boolean; system?: SystemControl } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ? { level: 'warn' } : false, bodyLimit: 100 * 1024 * 1024 });
  const jobs = new JobManager(db);
  const system = opts.system ?? new SystemControl(new DbHandle(db), db.name);
  system.hasRunningJobs = () => jobs.list().some((j) => j.status === 'running' || j.status === 'pending');
  const ctx: AppContext = { db, jobs, system };

  // Sprache für Meldungen und Prompt-Fassungen: die Einstellung der App (einzelner Nutzer → global)
  app.addHook('onRequest', async () => {
    try {
      setLang(getAppSettings(db).language);
    } catch {
      /* Datenbank gerade nicht erreichbar */
    }
  });

  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, _req, reply) => {
    const status = err instanceof HttpError ? err.statusCode : (err.statusCode ?? 500);
    if (status >= 500) console.error(err);
    reply.status(status).send({ error: err.message || t('Unknown error') });
  });

  registerNovelRoutes(app, ctx);
  registerCodexRoutes(app, ctx);
  registerPromptRoutes(app, ctx);
  registerLlmRoutes(app, ctx);
  registerGenerateRoutes(app, ctx);
  registerChatRoutes(app, ctx);
  registerMiscRoutes(app, ctx);
  registerSystemRoutes(app, ctx);
  registerI18nRoutes(app);

  const dist = join(ROOT_DIR, 'web', 'dist');
  if (opts.serveWeb !== false && existsSync(join(dist, 'index.html'))) {
    await app.register(fastifyStatic, { root: dist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: t('Not found') });
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: t('Not found') });
      reply
        .type('text/html; charset=utf-8')
        .send(
          `<h1>Novelmaker</h1><p>${t('The interface hasn’t been built yet. Please run <code>npm run build</code> or start <code>start.bat</code>.')}</p>`,
        );
    });
  }
  return app;
}
