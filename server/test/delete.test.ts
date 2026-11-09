import { existsSync, readdirSync, rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Outline } from '@novelmaker/shared';
import { buildApp } from '../src/app';
import { BACKUP_DIR, DATA_DIR, openDb, ROOT_DIR, type DB } from '../src/db';
import { seedBuiltins } from '../src/repo/prompts';

let db: DB;
let app: FastifyInstance;

async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await app.inject({ method: method as any, url, payload: body as any });
  if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`);
  return res.json() as T;
}
const status = async (method: string, url: string) => (await app.inject({ method: method as any, url })).statusCode;
const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

beforeAll(async () => {
  // Sicherheitsnetz: niemals im echten Datenordner sichern/aufräumen
  expect(DATA_DIR.startsWith(ROOT_DIR)).toBe(false);
  rmSync(BACKUP_DIR, { recursive: true, force: true });
  db = openDb(':memory:');
  seedBuiltins(db);
  app = await buildApp(db, { serveWeb: false });
});

afterAll(async () => {
  await app.close();
  db.close();
  rmSync(BACKUP_DIR, { recursive: true, force: true });
});

describe('Löschen', () => {
  it('Szene, Kapitel und Akt', async () => {
    const n = await api('POST', '/api/novels', { title: 'Lösch-Test' });
    let o = await api<Outline>('GET', `/api/novels/${n.id}/outline`);
    const act1 = o.acts[0];
    const ch1 = act1.chapters[0];
    await api('POST', '/api/scenes', { chapterId: ch1.id });
    const act2 = await api('POST', '/api/acts', { novelId: n.id });
    o = await api<Outline>('GET', `/api/novels/${n.id}/outline`);
    expect(o.acts).toHaveLength(2);
    expect(o.acts[0].chapters[0].scenes).toHaveLength(2);

    const sceneId = o.acts[0].chapters[0].scenes[0].id;
    await api('POST', `/api/scenes/${sceneId}/snapshots`, { reason: 'Test' });
    const snaps = await api<any[]>('GET', `/api/scenes/${sceneId}/snapshots`);
    await api('DELETE', `/api/snapshots/${snaps[0].id}`);
    expect(await api<any[]>('GET', `/api/scenes/${sceneId}/snapshots`)).toHaveLength(0);

    await api('DELETE', `/api/scenes/${sceneId}`);
    expect(await status('GET', `/api/scenes/${sceneId}`)).toBe(404);

    await api('DELETE', `/api/chapters/${ch1.id}`);
    await api('DELETE', `/api/acts/${act2.id}`);
    o = await api<Outline>('GET', `/api/novels/${n.id}/outline`);
    expect(o.acts).toHaveLength(1);
    expect(o.acts[0].chapters).toHaveLength(0);
    // der letzte Akt bleibt
    expect(await status('DELETE', `/api/acts/${o.acts[0].id}`)).toBe(400);
  });

  it('Roman: alles weg, vorher Sicherung', async () => {
    const n = await api('POST', '/api/novels', { title: 'Weg damit' });
    await api('POST', `/api/novels/${n.id}/snippets`, { title: 'S' });
    await api('POST', `/api/novels/${n.id}/codex`, { name: 'Figur' });
    const t = await api('POST', `/api/novels/${n.id}/chats`, {});
    db.prepare("INSERT INTO chat_messages (id, thread_id, role, content, created_at) VALUES ('m1', ?, 'user', 'hi', 'x')").run(t.id);
    const before = { snippets: count('snippets'), codex: count('codex_entries'), chats: count('chat_threads'), msgs: count('chat_messages') };

    await api('DELETE', `/api/novels/${n.id}`);
    expect(await status('GET', `/api/novels/${n.id}`)).toBe(404);
    expect(count('snippets')).toBe(before.snippets - 1);
    expect(count('codex_entries')).toBe(before.codex - 1);
    expect(count('chat_threads')).toBe(before.chats - 1);
    expect(count('chat_messages')).toBe(before.msgs - 1);
    expect(existsSync(BACKUP_DIR) && readdirSync(BACKUP_DIR).some((f) => f.includes('vor-loeschen'))).toBe(true);
    expect(await status('DELETE', `/api/novels/${n.id}`)).toBe(404);
  });

  it('Serie auflösen behält Bände, Serien-Kodex und Serien-Snippets', async () => {
    const n = await api('POST', '/api/novels', { title: 'Band A' });
    const s = await api('POST', `/api/novels/${n.id}/convert-to-series`, { title: 'Reihe' });
    const v2 = await api('POST', `/api/series/${s.id}/volumes`, { title: 'Band B' });
    const entry = await api('POST', `/api/novels/${n.id}/codex`, { name: 'Serienfigur', level: 'series' });
    db.prepare("INSERT INTO snippets (id, series_id, title, text, created_at, updated_at) VALUES ('sn-series', ?, 'Serien-Notiz', '', 'x', 'x')").run(s.id);

    await api('DELETE', `/api/series/${s.id}`);
    expect((await api('GET', `/api/novels/${n.id}`)).seriesId).toBeNull();
    expect((await api('GET', `/api/novels/${v2.id}`)).title).toBe('Band B');
    expect((await api('GET', `/api/codex/${entry.id}`)).novelId).toBe(n.id);
    const sn = await api<any[]>('GET', `/api/novels/${n.id}/snippets`);
    expect(sn.map((x) => x.title)).toContain('Serien-Notiz');
  });

  it('Serie mit allen Bänden löschen', async () => {
    const n = await api('POST', '/api/novels', { title: 'Band 1' });
    const s = await api('POST', `/api/novels/${n.id}/convert-to-series`, { title: 'Weg-Reihe' });
    const v2 = await api('POST', `/api/series/${s.id}/volumes`, { title: 'Band 2' });
    const entry = await api('POST', `/api/novels/${n.id}/codex`, { name: 'Serienfigur 2', level: 'series' });

    await api('DELETE', `/api/series/${s.id}?volumes=delete`);
    expect(await status('GET', `/api/novels/${n.id}`)).toBe(404);
    expect(await status('GET', `/api/novels/${v2.id}`)).toBe(404);
    expect(await status('GET', `/api/codex/${entry.id}`)).toBe(404);
    expect((await api<any[]>('GET', '/api/series')).some((x) => x.id === s.id)).toBe(false);
    expect(await status('DELETE', `/api/series/${s.id}`)).toBe(404);
  });
});
