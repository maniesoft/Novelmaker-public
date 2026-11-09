import type { FastifyInstance } from 'fastify';
import { estimateMessagesTokens, t, type EstimateResult, type GenerateRequest, type PreviewResult, type RefValue } from '@novelmaker/shared';
import type { AppContext } from '../app';
import { HttpError } from '../db';
import { listMessages } from '../repo/chat';
import { getProvider } from '../repo/llm';
import { buildParams, estimateGeneration, runGeneration, SseWriter } from '../services/generate';
import { prepareRender } from '../services/promptdata';

type Req = GenerateRequest & { chapterId?: string | null; context?: RefValue[] };

function withChatHistory(ctx: AppContext, req: Req): Req {
  if (req.chatThreadId && !req.chatHistory) {
    const history = listMessages(ctx.db, req.chatThreadId).map((m) => ({ role: m.role, content: m.content }));
    return { ...req, chatHistory: history };
  }
  return req;
}

export function registerGenerateRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  /** Fertig gerenderte Nachrichten, Warnungen, Token-Zahl und Kodex-Auswahl – ohne KI-Aufruf. */
  app.post<{ Body: Req }>('/api/preview', async (req): Promise<PreviewResult & { params?: Record<string, unknown> }> => {
    const body = withChatHistory(ctx, req.body);
    const prep = prepareRender(db, body);
    const params = body.model ? buildParams(db, body.model, prep, body.params) : undefined;
    return {
      messages: prep.result.messages,
      warnings: prep.result.warnings,
      tokens: estimateMessagesTokens(prep.result.messages),
      codex: prep.result.codex,
      params,
      estimate: params ? estimateGeneration(db, body, prep, params) : undefined,
    };
  });

  /** Nur Tokens/Kosten schätzen (leichter als die Vorschau, für die Anzeige neben „Generieren“). */
  app.post<{ Body: Req }>('/api/estimate', async (req): Promise<EstimateResult> => {
    const body = withChatHistory(ctx, req.body);
    const prep = prepareRender(db, body);
    const params = body.model ? buildParams(db, body.model, prep, body.params) : {};
    return { ...estimateGeneration(db, body, prep, params), warnings: prep.result.warnings };
  });

  /** Generierung mit Streaming (SSE). Abbruch: Verbindung schließen. */
  app.post<{ Body: Req }>('/api/generate', async (req, reply) => {
    const body = withChatHistory(ctx, req.body);
    if (!body.model?.providerId || !body.model.modelId) throw new HttpError(400, t('No model selected.'));
    const provider = getProvider(db, body.model.providerId);
    const prep = prepareRender(db, body);
    if (!prep.result.messages.length) throw new HttpError(400, t('The prompt doesn’t produce any messages.'));
    const params = buildParams(db, body.model, prep, body.params);

    reply.hijack();
    const sse = new SseWriter(reply.raw);
    sse.send('meta', { warnings: prep.result.warnings, promptTokens: estimateMessagesTokens(prep.result.messages), params });
    const result = await runGeneration({
      db,
      provider,
      modelId: body.model.modelId,
      messages: prep.result.messages,
      params,
      log: { novelId: body.novelId, promptId: prep.prompt.id, promptName: prep.prompt.name, kind: body.kind },
      signal: sse.abort.signal,
      onEvent: (ev) => {
        if (ev.type === 'delta') sse.send('delta', { text: ev.text });
        else if (ev.type === 'reasoning') sse.send('reasoning', { text: ev.text });
      },
    });
    if (result.status === 'error') sse.send('error', { message: result.error, logId: result.logId });
    else
      sse.send('done', {
        logId: result.logId,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        cost: result.cost,
        finish: result.finish,
        durationMs: result.durationMs,
        status: result.status,
      });
    sse.end();
  });
}
