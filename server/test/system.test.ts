// Speicherort der Datenbank, Sicherungsordner, Cover, Serienzuordnung.
// Eigener Datenordner, damit die config.json anderer Testdateien nicht berührt wird.
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

const root = mkdtempSync(join(tmpdir(), 'nm-system-'));
process.env.NOVELMAKER_DATA = join(root, 'data');

let app: FastifyInstance;
let handle: import('../src/db').DbHandle;
let system: import('../src/services/system').SystemControl;

async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await app.inject({ method: method as any, url, payload: body as any });
  if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`);
  return res.json() as T;
}
const status = async (method: string, url: string, body?: unknown) => (await app.inject({ method: method as any, url, payload: body as any })).statusCode;

beforeAll(async () => {
  const { buildApp } = await import('../src/app');
  const { DbHandle, openDb } = await import('../src/db');
  const { dbPath } = await import('../src/config');
  const { SystemControl } = await import('../src/services/system');
  const { seedBuiltins } = await import('../src/repo/prompts');
  const file = dbPath();
  expect(file.startsWith(root)).toBe(true);
  handle = new DbHandle(openDb(file));
  seedBuiltins(handle.db);
  system = new SystemControl(handle, file);
  app = await buildApp(handle.db, { serveWeb: false, system });
});

afterAll(async () => {
  await app.close();
  handle.raw.close();
  rmSync(root, { recursive: true, force: true });
});

describe('Cover', () => {
  it('lädt hoch, liefert aus und löscht', async () => {
    const n = await api('POST', '/api/novels', { title: 'Mit Cover' });
    expect(n.coverVersion).toBeNull();
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a3c3a8b70000000049454e44ae426082', 'hex');
    const up = await api('PUT', `/api/novels/${n.id}/cover`, { mime: 'image/png', data: png.toString('base64') });
    expect(up.coverVersion).toBeTruthy();
    const res = await app.inject({ method: 'GET', url: `/api/novels/${n.id}/cover` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.rawPayload.equals(png)).toBe(true);
    const list = await api('GET', '/api/novels');
    expect(list.find((x: any) => x.id === n.id).coverVersion).toBe(up.coverVersion);
    expect(await status('PUT', `/api/novels/${n.id}/cover`, { mime: 'text/html', data: 'eA==' })).toBe(400);
    await api('DELETE', `/api/novels/${n.id}/cover`);
    expect(await status('GET', `/api/novels/${n.id}/cover`)).toBe(404);
  });
});

describe('Serie', () => {
  it('nimmt einen Einzelroman als nächsten Band auf und löst ihn wieder', async () => {
    const a = await api('POST', '/api/novels', { title: 'Band A' });
    await api('POST', `/api/novels/${a.id}/convert-to-series`, { title: 'Reihe' });
    const b = await api('POST', '/api/novels', { title: 'Band B' });
    const figur = await api('POST', `/api/novels/${b.id}/codex`, { name: 'Figur B' });
    const seriesId = (await api('GET', `/api/novels/${a.id}`)).seriesId;
    const joined = await api('POST', `/api/novels/${b.id}/join-series`, { seriesId, codexIds: [figur.id] });
    expect(joined).toMatchObject({ seriesId, volumeNumber: 2 });
    // Eintrag liegt jetzt auf Serienebene und ist in Band A sichtbar
    const codexA = await api('GET', `/api/novels/${a.id}/codex`);
    expect(codexA.entries.map((e: any) => e.name)).toContain('Figur B');
    expect(await status('POST', `/api/novels/${b.id}/join-series`, { seriesId })).toBe(400);
    const left = await api('POST', `/api/novels/${b.id}/leave-series`);
    expect(left).toMatchObject({ seriesId: null, volumeNumber: null });
  });
});

describe('Speicherort und Sicherung', () => {
  it('Sicherungen: eigener Ordner, nur eigene Dateien werden aufgeräumt', async () => {
    const dir = join(root, 'meine-sicherungen');
    const r = await api('POST', '/api/system/backup-dir', { folder: dir });
    expect(r.backupDir).toBe(dir);
    writeFileSync(join(dir, 'fremd.db'), 'nicht anfassen');
    await api('PATCH', '/api/settings', { backupsToKeep: 1 });
    await api('POST', '/api/backups');
    await new Promise((res) => setTimeout(res, 1100));
    await api('POST', '/api/backups');
    const files = readdirSync(dir);
    expect(files).toContain('fremd.db');
    expect(files.filter((f) => f.startsWith('novelmaker-'))).toHaveLength(1);
    const info = await api('GET', '/api/system');
    expect(info.backupDir).toBe(dir);
    expect(info.backups).toHaveLength(1);
  });

  it('verschiebt die Datenbank in einen anderen Ordner und arbeitet dort weiter', async () => {
    const before = (await api('GET', '/api/novels')).length;
    const cloud = join(root, 'Dropbox', 'Novelmaker');
    const check = await api('POST', '/api/system/check-folder', { folder: cloud });
    expect(check).toMatchObject({ exists: false, isCurrent: false });
    const r = await api('POST', '/api/system/db-location', { folder: cloud, mode: 'move' });
    expect(r.dbPath).toBe(join(cloud, 'novelmaker.db'));
    expect(existsSync(join(cloud, 'novelmaker.db.lock'))).toBe(true);
    // gleiche Daten, neue Datei
    expect((await api('GET', '/api/novels')).length).toBe(before);
    await api('POST', '/api/novels', { title: 'Nach dem Umzug' });
    const info = await api('GET', '/api/system');
    expect(info.dbPath).toBe(join(cloud, 'novelmaker.db'));
    // config.json merkt sich den Ordner
    const { dbPath } = await import('../src/config');
    expect(dbPath()).toBe(join(cloud, 'novelmaker.db'));
  });

  it('nutzt eine vorhandene Datenbank (z. B. vom anderen Rechner) und schützt vor Fehlbedienung', async () => {
    const other = join(root, 'anderer-rechner');
    const { openDb } = await import('../src/db');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(other, { recursive: true });
    const odb = openDb(join(other, 'novelmaker.db'));
    const t = new Date().toISOString();
    odb.prepare("INSERT INTO novels (id, title, created_at, updated_at) VALUES ('x', 'Vom Laptop', ?, ?)").run(t, t);
    odb.close();
    const check = await api('POST', '/api/system/check-folder', { folder: other });
    expect(check).toMatchObject({ exists: true, novels: 1, titles: ['Vom Laptop'] });
    expect(await status('POST', '/api/system/db-location', { folder: other, mode: 'move' })).toBe(400);
    await api('POST', '/api/system/db-location', { folder: other, mode: 'use-existing' });
    expect((await api('GET', '/api/novels')).map((n: any) => n.title)).toEqual(['Vom Laptop']);
    // fremde, frische Sperre → Wechsel wird abgelehnt
    const locked = join(root, 'gesperrt');
    mkdirSync(locked, { recursive: true });
    const ldb = openDb(join(locked, 'novelmaker.db'));
    ldb.close();
    writeFileSync(join(locked, 'novelmaker.db.lock'), JSON.stringify({ host: 'ANDERER-PC', pid: 1, since: t, heartbeat: new Date().toISOString() }));
    expect(await status('POST', '/api/system/db-location', { folder: locked, mode: 'use-existing' })).toBe(409);
  });
});
