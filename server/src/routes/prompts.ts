import type { FastifyInstance } from 'fastify';
import { collectPromptInputs, getLang, isLang, type Lang, type Prompt } from '@novelmaker/shared';
import type { AppContext } from '../app';
import * as Pr from '../repo/prompts';

type P = { id: string };
type Q = { lang?: string };

/** Sprache der Prompt-Fassung: ?lang=… bzw. lang im Body, sonst die eingestellte Sprache. */
const langOf = (v: unknown): Lang => (isLang(v) ? v : getLang());

export function registerPromptRoutes(app: FastifyInstance, { db }: AppContext) {
  app.get<{ Querystring: Q }>('/api/prompts', async (req) => Pr.listPrompts(db, langOf(req.query.lang)));
  app.post<{ Body: Pr.PromptInputData }>('/api/prompts', async (req) => Pr.createPrompt(db, { ...req.body, origin: 'custom', builtinKey: null, lang: langOf(req.body?.lang) }));
  app.get<{ Params: P; Querystring: Q }>('/api/prompts/:id', async (req) => Pr.getPrompt(db, req.params.id, langOf(req.query.lang)));
  app.patch<{ Params: P; Body: Pr.PromptInputData }>('/api/prompts/:id', async (req) => Pr.updatePrompt(db, req.params.id, req.body, langOf(req.body?.lang)));
  app.delete<{ Params: P }>('/api/prompts/:id', async (req) => {
    Pr.deletePrompt(db, req.params.id);
    return { ok: true };
  });
  /** Fassung einer Sprache anlegen (Kopie der Fassung `from`, sonst der angezeigten) bzw. löschen. */
  app.post<{ Params: P & { lang: string }; Body: { from?: string } }>('/api/prompts/:id/texts/:lang', async (req) =>
    Pr.createPromptText(db, req.params.id, langOf(req.params.lang), isLang(req.body?.from) ? req.body.from : undefined),
  );
  app.delete<{ Params: P & { lang: string } }>('/api/prompts/:id/texts/:lang', async (req) => Pr.deletePromptText(db, req.params.id, langOf(req.params.lang)));
  app.post<{ Params: P }>('/api/prompts/:id/duplicate', async (req) => Pr.duplicatePrompt(db, req.params.id));
  app.post<{ Params: P; Body: { lang?: string } }>('/api/prompts/:id/reset', async (req) => Pr.resetBuiltin(db, req.params.id, langOf(req.body?.lang)));
  app.post('/api/prompts/restore-builtins', async () => {
    Pr.restoreDeletedBuiltins(db);
    return { ok: true };
  });
  app.post<{ Body: { text: string; lang?: string } }>('/api/prompts/import', async (req) => Pr.importPrompt(db, req.body?.text ?? '', langOf(req.body?.lang)));
  app.get<{ Params: P; Querystring: Q }>('/api/prompts/:id/export', async (req) => ({ text: await Pr.exportPrompt(db, req.params.id, langOf(req.query.lang)) }));
  app.get<{ Params: P; Querystring: Q }>('/api/prompts/:id/usages', async (req) => Pr.componentUsages(db, req.params.id, langOf(req.query.lang)));
  /** Eingabefelder inkl. eingebundener Komponenten (für das Formular). */
  app.get<{ Params: P; Querystring: Q }>('/api/prompts/:id/inputs', async (req) => {
    const lang = langOf(req.query.lang);
    const p = Pr.getPrompt(db, req.params.id, lang);
    return collectPromptInputs(p, Pr.listComponents(db, p.lang));
  });
  app.post<{ Body: Pick<Prompt, 'messages' | 'inputs'> & { lang?: string } }>('/api/prompts/inputs', async (req) =>
    collectPromptInputs(req.body, Pr.listComponents(db, langOf(req.body?.lang))),
  );
}
