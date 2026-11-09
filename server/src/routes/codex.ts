import type { FastifyInstance } from 'fastify';
import { CodexMatcher, t, type Snippet } from '@novelmaker/shared';
import type { AppContext } from '../app';
import * as C from '../repo/codex';
import { getOutline } from '../repo/novels';
import { getAppSettings } from '../repo/settings';
import { createBackup } from '../services/backup';
import { loadActs } from '../services/promptdata';

type P = { id: string };

export function registerCodexRoutes(app: FastifyInstance, { db }: AppContext) {
  app.get<{ Params: P }>('/api/novels/:id/codex', async (req) => {
    const entries = C.listCodexForNovel(db, req.params.id);
    return { entries, relations: C.listRelations(db, entries.map((e) => e.id)) };
  });
  app.post<{ Params: P; Body: C.CodexInput }>('/api/novels/:id/codex', async (req) => C.createCodex(db, req.params.id, req.body ?? {}));
  /** Band-Einträge, die es auch auf Serienebene gibt (z. B. nach dem Import eines Bandes in eine Serie) */
  app.get<{ Params: P }>('/api/novels/:id/codex/duplicates', async (req) => C.findCodexDuplicates(db, req.params.id));
  app.post<{ Params: P }>('/api/novels/:id/codex/merge-duplicates', async (req) => {
    createBackup(db, getAppSettings(db).backupsToKeep, 'vor-kodex-zusammenfuehren');
    return C.mergeCodexDuplicates(db, req.params.id);
  });
  app.get<{ Params: P }>('/api/codex/:id', async (req) => C.getCodex(db, req.params.id));
  app.patch<{ Params: P; Body: C.CodexInput & { novelId?: string } }>('/api/codex/:id', async (req) => C.updateCodex(db, req.params.id, req.body));
  app.delete<{ Params: P }>('/api/codex/:id', async (req) => {
    C.deleteCodex(db, req.params.id);
    return { ok: true };
  });
  app.post<{ Params: P; Body: { otherId: string; label?: string } }>('/api/codex/:id/relations', async (req) =>
    C.createRelation(db, req.params.id, req.body.otherId, req.body.label ?? ''),
  );
  app.delete<{ Params: P }>('/api/codex-relations/:id', async (req) => {
    C.deleteRelation(db, req.params.id);
    return { ok: true };
  });

  /** In welchen Szenen wird ein Eintrag erwähnt? */
  app.get<{ Params: P; Querystring: { novelId: string } }>('/api/codex/:id/mentions', async (req) => {
    const entry = C.getCodex(db, req.params.id);
    const matcher = new CodexMatcher([{ ...entry, inclusion: 'auto' }]);
    const outline = getOutline(db, req.query.novelId);
    const acts = loadActs(db, req.query.novelId);
    const out: { sceneId: string; chapterTitle: string; sceneIndex: number; count: number }[] = [];
    let chNo = 0;
    acts.forEach((a) =>
      a.chapters.forEach((ch) => {
        chNo++;
        ch.scenes.forEach((s, i) => {
          const count = matcher.findMentions(s.text).length;
          if (count) out.push({ sceneId: s.id, chapterTitle: ch.title || t('Chapter {n}', { n: chNo }), sceneIndex: i + 1, count });
        });
      }),
    );
    void outline;
    return out;
  });

  // ------------------------------------------------------------ Snippets
  app.get<{ Params: P }>('/api/novels/:id/snippets', async (req) => C.listSnippets(db, req.params.id));
  app.post<{ Params: P; Body: { title?: string; text?: string } }>('/api/novels/:id/snippets', async (req) => C.createSnippet(db, req.params.id, req.body ?? {}));
  app.patch<{ Params: P; Body: Partial<Snippet> }>('/api/snippets/:id', async (req) => C.updateSnippet(db, req.params.id, req.body));
  app.delete<{ Params: P }>('/api/snippets/:id', async (req) => {
    C.deleteSnippet(db, req.params.id);
    return { ok: true };
  });
}
