import type { FastifyInstance } from 'fastify';
import type { ModelCollection, Provider } from '@novelmaker/shared';
import type { AppContext } from '../app';
import * as L from '../repo/llm';

type P = { id: string };

/** API-Keys werden nur maskiert an den Browser gegeben. */
function mask(p: Provider) {
  return { ...p, apiKey: p.apiKey ? `••••${p.apiKey.slice(-4)}` : '', hasKey: !!p.apiKey };
}

export function registerLlmRoutes(app: FastifyInstance, { db }: AppContext) {
  app.get('/api/providers', async () => L.listProviders(db).map(mask));
  app.post<{ Body: Partial<Provider> }>('/api/providers', async (req) => mask(L.createProvider(db, req.body)));
  app.patch<{ Params: P; Body: Partial<Provider> }>('/api/providers/:id', async (req) => {
    const body = { ...req.body };
    if (typeof body.apiKey === 'string' && body.apiKey.startsWith('••••')) delete body.apiKey;
    return mask(L.updateProvider(db, req.params.id, body));
  });
  app.delete<{ Params: P }>('/api/providers/:id', async (req) => {
    L.deleteProvider(db, req.params.id);
    return { ok: true };
  });
  app.post<{ Params: P }>('/api/providers/:id/refresh', async (req) => mask(await L.refreshProviderModels(db, req.params.id)));

  app.get('/api/collections', async () => L.listCollections(db));
  app.post<{ Body: Partial<ModelCollection> }>('/api/collections', async (req) => L.createCollection(db, req.body ?? {}));
  app.patch<{ Params: P; Body: Partial<ModelCollection> }>('/api/collections/:id', async (req) => L.updateCollection(db, req.params.id, req.body));
  app.delete<{ Params: P }>('/api/collections/:id', async (req) => {
    L.deleteCollection(db, req.params.id);
    return { ok: true };
  });
  app.post<{ Body: { text: string; providerId?: string } }>('/api/collections/import', async (req) => L.importCollection(db, req.body.text, req.body.providerId));
  app.get<{ Params: P }>('/api/collections/:id/export', async (req) => L.exportCollection(db, req.params.id));

  app.get<{ Querystring: { limit?: string; novelId?: string } }>('/api/logs', async (req) =>
    L.listLogs(db, Math.min(500, Number(req.query.limit ?? 100) || 100), req.query.novelId).map((l) => ({ ...l, messages: [], response: l.response.slice(0, 300) })),
  );
  app.get('/api/logs/stats', async () => L.logStats(db));
  app.get<{ Params: P }>('/api/logs/:id', async (req) => L.getLog(db, req.params.id));
}
