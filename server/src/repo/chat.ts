import { t, type ChatMessage, type ChatThread, type InputValues, type ModelRef, type RefValue } from '@novelmaker/shared';
import { newId, notFound, now, parseJson, updateRow, type DB } from '../db';

type Row = Record<string, any>;

const rowToThread = (r: Row): ChatThread => ({
  id: r.id,
  novelId: r.novel_id,
  title: r.title,
  promptId: r.prompt_id ?? null,
  model: parseJson<ModelRef | null>(r.model, null),
  context: parseJson<RefValue[]>(r.context, []),
  inputs: parseJson<InputValues>(r.inputs, {}),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const rowToMessage = (r: Row): ChatMessage => ({
  id: r.id,
  threadId: r.thread_id,
  role: r.role,
  content: r.content,
  createdAt: r.created_at,
  model: r.model ?? null,
  logId: r.log_id ?? null,
});

export function listThreads(db: DB, novelId: string): ChatThread[] {
  return (db.prepare('SELECT * FROM chat_threads WHERE novel_id = ? ORDER BY updated_at DESC').all(novelId) as Row[]).map(rowToThread);
}

export function getThread(db: DB, id: string): ChatThread {
  const r = db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(id);
  if (!r) notFound(t('Chat not found'));
  return rowToThread(r as Row);
}

export function createThread(db: DB, novelId: string, data: Partial<ChatThread>): ChatThread {
  const id = newId();
  const ts = now();
  db.prepare(
    'INSERT INTO chat_threads (id, novel_id, title, prompt_id, model, context, inputs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, novelId, data.title ?? '', data.promptId ?? null, data.model ? JSON.stringify(data.model) : null, JSON.stringify(data.context ?? []), JSON.stringify(data.inputs ?? {}), ts, ts);
  return getThread(db, id);
}

export function updateThread(db: DB, id: string, patch: Partial<ChatThread>): ChatThread {
  updateRow(db, 'chat_threads', id, patch as Record<string, unknown>, {
    title: { col: 'title' },
    promptId: { col: 'prompt_id' },
    model: { col: 'model', kind: 'json' },
    context: { col: 'context', kind: 'json' },
    inputs: { col: 'inputs', kind: 'json' },
  });
  return getThread(db, id);
}

export function deleteThread(db: DB, id: string) {
  db.prepare('DELETE FROM chat_threads WHERE id = ?').run(id);
}

export function listMessages(db: DB, threadId: string): ChatMessage[] {
  return (db.prepare('SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at, rowid').all(threadId) as Row[]).map(rowToMessage);
}

export function addMessage(db: DB, threadId: string, data: { role: ChatMessage['role']; content: string; model?: string | null; logId?: string | null }): ChatMessage {
  const id = newId();
  db.prepare('INSERT INTO chat_messages (id, thread_id, role, content, created_at, model, log_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    threadId,
    data.role,
    data.content,
    now(),
    data.model ?? null,
    data.logId ?? null,
  );
  db.prepare('UPDATE chat_threads SET updated_at = ? WHERE id = ?').run(now(), threadId);
  return rowToMessage(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id) as Row);
}

export function updateMessage(db: DB, id: string, content: string): ChatMessage {
  db.prepare('UPDATE chat_messages SET content = ? WHERE id = ?').run(content, id);
  const r = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id);
  if (!r) notFound(t('Message not found'));
  return rowToMessage(r as Row);
}

export function deleteMessage(db: DB, id: string) {
  db.prepare('DELETE FROM chat_messages WHERE id = ?').run(id);
}
