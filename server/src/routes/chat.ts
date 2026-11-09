import type { FastifyInstance } from 'fastify';
import { t, type ChatThread, type InputValues, type ModelRef, type RefValue } from '@novelmaker/shared';
import type { AppContext } from '../app';
import { HttpError } from '../db';
import * as Ch from '../repo/chat';
import { getProvider } from '../repo/llm';
import { findPromptByKey } from '../repo/prompts';
import { buildParams, runGeneration, SseWriter } from '../services/generate';
import { prepareRender } from '../services/promptdata';

type P = { id: string };

interface SendBody {
  content?: string;
  promptId?: string | null;
  model?: ModelRef | null;
  inputs?: InputValues;
  context?: RefValue[];
  /** Letzte Antwort neu erzeugen */
  regenerate?: boolean;
  params?: Record<string, unknown>;
}

export function registerChatRoutes(app: FastifyInstance, { db }: AppContext) {
  app.get<{ Params: P }>('/api/novels/:id/chats', async (req) => Ch.listThreads(db, req.params.id));
  app.post<{ Params: P; Body: Partial<ChatThread> }>('/api/novels/:id/chats', async (req) => {
    const body = req.body ?? {};
    const promptId = body.promptId ?? findPromptByKey(db, 'chat')?.id ?? null;
    return Ch.createThread(db, req.params.id, { ...body, promptId });
  });
  app.get<{ Params: P }>('/api/chats/:id', async (req) => ({ thread: Ch.getThread(db, req.params.id), messages: Ch.listMessages(db, req.params.id) }));
  app.patch<{ Params: P; Body: Partial<ChatThread> }>('/api/chats/:id', async (req) => Ch.updateThread(db, req.params.id, req.body));
  app.delete<{ Params: P }>('/api/chats/:id', async (req) => {
    Ch.deleteThread(db, req.params.id);
    return { ok: true };
  });
  app.patch<{ Params: P; Body: { content: string } }>('/api/chat-messages/:id', async (req) => Ch.updateMessage(db, req.params.id, req.body.content));
  app.delete<{ Params: P }>('/api/chat-messages/:id', async (req) => {
    Ch.deleteMessage(db, req.params.id);
    return { ok: true };
  });

  /** Nachricht senden und Antwort streamen (SSE). */
  app.post<{ Params: P; Body: SendBody }>('/api/chats/:id/send', async (req, reply) => {
    const body = req.body ?? {};
    let thread = Ch.getThread(db, req.params.id);
    const patch: Partial<ChatThread> = {};
    if (body.promptId !== undefined) patch.promptId = body.promptId;
    if (body.model !== undefined) patch.model = body.model;
    if (body.inputs !== undefined) patch.inputs = body.inputs;
    if (body.context !== undefined) patch.context = body.context;
    if (Object.keys(patch).length) thread = Ch.updateThread(db, thread.id, patch);
    const model = thread.model;
    const promptId = thread.promptId;
    if (!model) throw new HttpError(400, t('No model selected.'));
    if (!promptId) throw new HttpError(400, t('No chat prompt selected.'));
    const provider = getProvider(db, model.providerId);

    let messages = Ch.listMessages(db, thread.id);
    let content: string;
    if (body.regenerate) {
      while (messages.length && messages[messages.length - 1].role === 'assistant') {
        Ch.deleteMessage(db, messages[messages.length - 1].id);
        messages = messages.slice(0, -1);
      }
      const lastUser = messages[messages.length - 1];
      if (!lastUser) throw new HttpError(400, t('No message to retry.'));
      content = lastUser.content;
      messages = messages.slice(0, -1);
    } else {
      content = (body.content ?? '').trim();
      if (!content) throw new HttpError(400, t('Empty message.'));
    }
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const prep = prepareRender(db, {
      kind: 'chat',
      promptId,
      novelId: thread.novelId,
      message: content,
      inputs: thread.inputs,
      context: thread.context,
      chatHistory: history,
    });
    const params = buildParams(db, model, prep, body.params);
    const userMsg = body.regenerate ? null : Ch.addMessage(db, thread.id, { role: 'user', content });
    if (!thread.title.trim()) thread = Ch.updateThread(db, thread.id, { title: content.replace(/\s+/g, ' ').slice(0, 60) });

    reply.hijack();
    const sse = new SseWriter(reply.raw);
    sse.send('meta', { warnings: prep.result.warnings, userMessage: userMsg, threadTitle: thread.title });
    const result = await runGeneration({
      db,
      provider,
      modelId: model.modelId,
      messages: prep.result.messages,
      params,
      log: { novelId: thread.novelId, promptId: prep.prompt.id, promptName: prep.prompt.name, kind: 'chat' },
      signal: sse.abort.signal,
      onEvent: (ev) => {
        if (ev.type === 'delta') sse.send('delta', { text: ev.text });
        else if (ev.type === 'reasoning') sse.send('reasoning', { text: ev.text });
      },
    });
    let assistant = null;
    if (result.text.trim()) {
      assistant = Ch.addMessage(db, thread.id, {
        role: 'assistant',
        content: result.text + (result.status === 'aborted' ? ' …' : ''),
        model: model.modelId,
        logId: result.logId,
      });
    }
    if (result.status === 'error') sse.send('error', { message: result.error, logId: result.logId });
    else sse.send('done', { assistantMessage: assistant, cost: result.cost, promptTokens: result.promptTokens, completionTokens: result.completionTokens });
    sse.end();
  });
}
