// Serien, Romane, Akte, Kapitel, Szenen, Snapshots.
import {
  countWords,
  docToPlainText,
  emptyDoc,
  isDoc,
  type Act,
  type Chapter,
  type Novel,
  type NovelListItem,
  type Outline,
  type OutlineAct,
  type PMDoc,
  type Scene,
  type SceneMeta,
  type SceneSnapshot,
  type Series,
  t, getLang, languageInfo } from '@novelmaker/shared';
import { HttpError, newId, notFound, now, parseJson, updateRow, type DB } from '../db';

type Row = Record<string, any>;

export const rowToSeries = (r: Row): Series => ({
  id: r.id,
  title: r.title,
  description: r.description,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const rowToNovel = (r: Row): Novel => ({
  id: r.id,
  seriesId: r.series_id ?? null,
  volumeNumber: r.volume_number ?? null,
  title: r.title,
  author: r.author,
  description: r.description,
  language: r.language,
  tense: r.tense,
  povType: r.pov_type,
  povCharacterId: r.pov_character_id ?? null,
  additionalInstructions: r.additional_instructions,
  summary: r.summary,
  settings: parseJson(r.settings, {}),
  coverVersion: r.cover_at ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const COVER_AT = '(SELECT cv.updated_at FROM novel_covers cv WHERE cv.novel_id = n.id) AS cover_at';

const rowToAct = (r: Row): Act => ({ id: r.id, novelId: r.novel_id, sortOrder: r.sort_order, title: r.title, summary: r.summary });
const rowToChapter = (r: Row): Chapter => ({ id: r.id, actId: r.act_id, sortOrder: r.sort_order, title: r.title, summary: r.summary });

export const rowToSceneMeta = (r: Row): SceneMeta => ({
  id: r.id,
  chapterId: r.chapter_id,
  sortOrder: r.sort_order,
  title: r.title,
  summary: r.summary,
  povCharacterId: r.pov_character_id ?? null,
  povType: r.pov_type ?? null,
  labels: parseJson(r.labels, []),
  wordCount: r.word_count,
  hideFromAI: !!r.hide_from_ai,
  updatedAt: r.updated_at,
});

export const rowToScene = (r: Row): Scene => ({
  ...rowToSceneMeta(r),
  content: parseJson<PMDoc>(r.content, emptyDoc()),
  text: r.text,
});

const SCENE_META_COLS = 'id, chapter_id, sort_order, title, summary, pov_character_id, pov_type, labels, word_count, hide_from_ai, updated_at';

// ---------------------------------------------------------------- Serien

export function listSeries(db: DB): Series[] {
  return (db.prepare('SELECT * FROM series ORDER BY title COLLATE NOCASE').all() as Row[]).map(rowToSeries);
}

export function getSeries(db: DB, id: string): Series {
  const r = db.prepare('SELECT * FROM series WHERE id = ?').get(id);
  if (!r) notFound(t('Series not found'));
  return rowToSeries(r as Row);
}

export function createSeries(db: DB, data: { title: string; description?: string }): Series {
  const id = newId();
  const ts = now();
  db.prepare('INSERT INTO series (id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, data.title || t('New series'), data.description ?? '', ts, ts);
  return getSeries(db, id);
}

export function updateSeries(db: DB, id: string, patch: Partial<Series>): Series {
  updateRow(db, 'series', id, patch, { title: { col: 'title' }, description: { col: 'description' } });
  return getSeries(db, id);
}

export function deleteSeries(db: DB, id: string, opts: { deleteVolumes?: boolean } = {}) {
  if (opts.deleteVolumes) {
    // Serie samt Bänden; Serien-Kodex und -Snippets hängen per ON DELETE CASCADE an der Serie
    db.transaction(() => {
      db.prepare('DELETE FROM novels WHERE series_id = ?').run(id);
      db.prepare('DELETE FROM series WHERE id = ?').run(id);
    })();
    return;
  }
  // Romane bleiben erhalten (werden eigenständig), Serien-Kodex wird zu Band-Kodex des ersten Bandes
  const first = db.prepare('SELECT id FROM novels WHERE series_id = ? ORDER BY volume_number LIMIT 1').get(id) as Row | undefined;
  db.transaction(() => {
    if (first) {
      db.prepare('UPDATE codex_entries SET novel_id = ?, series_id = NULL WHERE series_id = ? AND novel_id IS NULL').run(first.id, id);
      db.prepare('UPDATE snippets SET novel_id = ?, series_id = NULL WHERE series_id = ? AND novel_id IS NULL').run(first.id, id);
    }
    db.prepare('UPDATE snippets SET series_id = NULL WHERE series_id = ? AND novel_id IS NOT NULL').run(id);
    db.prepare('UPDATE novels SET series_id = NULL, volume_number = NULL WHERE series_id = ?').run(id);
    db.prepare('DELETE FROM series WHERE id = ?').run(id);
  })();
}

// ---------------------------------------------------------------- Romane

export function listNovels(db: DB): NovelListItem[] {
  const rows = db
    .prepare(
      `SELECT n.*, ${COVER_AT}, COALESCE(SUM(s.word_count), 0) AS wc, COUNT(s.id) AS sc
       FROM novels n
       LEFT JOIN acts a ON a.novel_id = n.id
       LEFT JOIN chapters c ON c.act_id = a.id
       LEFT JOIN scenes s ON s.chapter_id = c.id
       GROUP BY n.id
       ORDER BY n.updated_at DESC`,
    )
    .all() as Row[];
  return rows.map((r) => ({ ...rowToNovel(r), wordCount: r.wc, sceneCount: r.sc }));
}

export function getNovel(db: DB, id: string): Novel {
  const r = db.prepare(`SELECT n.*, ${COVER_AT} FROM novels n WHERE n.id = ?`).get(id);
  if (!r) notFound(t('Novel not found'));
  return rowToNovel(r as Row);
}

export function touchNovel(db: DB, id: string) {
  db.prepare('UPDATE novels SET updated_at = ? WHERE id = ?').run(now(), id);
}

export interface CreateNovelInput {
  title?: string;
  author?: string;
  language?: string;
  tense?: string;
  povType?: string;
  seriesId?: string | null;
  volumeNumber?: number | null;
  /** Leeres Grundgerüst anlegen (Standard) */
  skeleton?: boolean;
}

export function createNovel(db: DB, data: CreateNovelInput): Novel {
  const id = newId();
  const ts = now();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO novels (id, series_id, volume_number, title, author, language, tense, pov_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      data.seriesId ?? null,
      data.volumeNumber ?? null,
      data.title?.trim() || t('New novel'),
      data.author ?? '',
      data.language ?? languageInfo(getLang()).novelLanguage,
      data.tense ?? 'past',
      data.povType ?? 'third-limited',
      ts,
      ts,
    );
    if (data.skeleton !== false) {
      const act = createAct(db, id, {});
      const ch = createChapter(db, act.id, { title: '' });
      createScene(db, ch.id, {});
    }
  })();
  return getNovel(db, id);
}

const NOVEL_SPEC = {
  title: { col: 'title' },
  author: { col: 'author' },
  description: { col: 'description' },
  language: { col: 'language' },
  tense: { col: 'tense' },
  povType: { col: 'pov_type' },
  povCharacterId: { col: 'pov_character_id' },
  additionalInstructions: { col: 'additional_instructions' },
  summary: { col: 'summary' },
  settings: { col: 'settings', kind: 'json' as const },
  seriesId: { col: 'series_id' },
  volumeNumber: { col: 'volume_number' },
};

export function updateNovel(db: DB, id: string, patch: Partial<Novel>): Novel {
  if (patch.settings) patch = { ...patch, settings: { ...getNovel(db, id).settings, ...patch.settings } };
  updateRow(db, 'novels', id, patch as Record<string, unknown>, NOVEL_SPEC);
  return getNovel(db, id);
}

export function deleteNovel(db: DB, id: string) {
  db.prepare('DELETE FROM novels WHERE id = ?').run(id);
}

export function novelIdOfScene(db: DB, sceneId: string): string {
  const r = db
    .prepare('SELECT a.novel_id FROM scenes s JOIN chapters c ON c.id = s.chapter_id JOIN acts a ON a.id = c.act_id WHERE s.id = ?')
    .get(sceneId) as Row | undefined;
  if (!r) notFound(t('Scene not found'));
  return r.novel_id;
}

export function novelIdOfChapter(db: DB, chapterId: string): string {
  const r = db.prepare('SELECT a.novel_id FROM chapters c JOIN acts a ON a.id = c.act_id WHERE c.id = ?').get(chapterId) as Row | undefined;
  if (!r) notFound(t('Chapter not found'));
  return r.novel_id;
}

// ---------------------------------------------------------------- Gliederung

export function getOutline(db: DB, novelId: string): Outline {
  const novel = getNovel(db, novelId);
  const series = novel.seriesId ? getSeries(db, novel.seriesId) : null;
  const acts = (db.prepare('SELECT * FROM acts WHERE novel_id = ? ORDER BY sort_order, rowid').all(novelId) as Row[]).map(rowToAct);
  const chapters = (
    db.prepare('SELECT c.* FROM chapters c JOIN acts a ON a.id = c.act_id WHERE a.novel_id = ? ORDER BY c.sort_order, c.rowid').all(novelId) as Row[]
  ).map(rowToChapter);
  const scenes = db
    .prepare(
      `SELECT ${SCENE_META_COLS.split(', ')
        .map((c) => 's.' + c)
        .join(', ')} FROM scenes s JOIN chapters c ON c.id = s.chapter_id JOIN acts a ON a.id = c.act_id
       WHERE a.novel_id = ? ORDER BY s.sort_order, s.rowid`,
    )
    .all(novelId) as Row[];
  const scenesMeta = scenes.map(rowToSceneMeta);
  const outlineActs: OutlineAct[] = acts.map((a) => ({
    ...a,
    chapters: chapters.filter((c) => c.actId === a.id).map((c) => ({ ...c, scenes: scenesMeta.filter((s) => s.chapterId === c.id) })),
  }));
  return { novel, series, acts: outlineActs };
}

/** Alle Szenen mit Inhalt (für Manuskript, Export, Prompt-Daten). */
export function getFullScenes(db: DB, novelId: string): Scene[] {
  return db
    .prepare(
      `SELECT s.* FROM scenes s JOIN chapters c ON c.id = s.chapter_id JOIN acts a ON a.id = c.act_id
       WHERE a.novel_id = ? ORDER BY a.sort_order, a.rowid, c.sort_order, c.rowid, s.sort_order, s.rowid`,
    )
    .all(novelId)
    .map((r) => rowToScene(r as Row));
}

function reorder(db: DB, table: string, parentCol: string, parentId: string, movingId: string, index: number) {
  const ids = (db.prepare(`SELECT id FROM ${table} WHERE ${parentCol} = ? AND id != ? ORDER BY sort_order, rowid`).all(parentId, movingId) as Row[]).map(
    (r) => r.id as string,
  );
  const i = Math.max(0, Math.min(index, ids.length));
  ids.splice(i, 0, movingId);
  const stmt = db.prepare(`UPDATE ${table} SET sort_order = ?, ${parentCol} = ? WHERE id = ?`);
  ids.forEach((id, n) => stmt.run(n, parentId, id));
}

function nextOrder(db: DB, table: string, parentCol: string, parentId: string): number {
  const r = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM ${table} WHERE ${parentCol} = ?`).get(parentId) as Row;
  return r.n;
}

// ---------------------------------------------------------------- Akte

export function createAct(db: DB, novelId: string, data: { title?: string; index?: number }): Act {
  const id = newId();
  db.prepare('INSERT INTO acts (id, novel_id, sort_order, title) VALUES (?, ?, ?, ?)').run(id, novelId, nextOrder(db, 'acts', 'novel_id', novelId), data.title ?? '');
  if (data.index != null) reorder(db, 'acts', 'novel_id', novelId, id, data.index);
  touchNovel(db, novelId);
  return rowToAct(db.prepare('SELECT * FROM acts WHERE id = ?').get(id) as Row);
}

export function updateAct(db: DB, id: string, patch: Partial<Act>) {
  updateRow(db, 'acts', id, patch, { title: { col: 'title' }, summary: { col: 'summary' } }, null);
}

export function moveAct(db: DB, id: string, index: number) {
  const r = db.prepare('SELECT novel_id FROM acts WHERE id = ?').get(id) as Row | undefined;
  if (!r) notFound(t('Act not found'));
  db.transaction(() => reorder(db, 'acts', 'novel_id', r.novel_id, id, index))();
}

export function deleteAct(db: DB, id: string) {
  const r = db.prepare('SELECT novel_id FROM acts WHERE id = ?').get(id) as Row | undefined;
  if (!r) notFound(t('Act not found'));
  const count = (db.prepare('SELECT COUNT(*) AS n FROM acts WHERE novel_id = ?').get(r.novel_id) as Row).n;
  if (count <= 1) throw new HttpError(400, t('The last act can’t be deleted.'));
  db.prepare('DELETE FROM acts WHERE id = ?').run(id);
}

// ---------------------------------------------------------------- Kapitel

export function createChapter(db: DB, actId: string, data: { title?: string; index?: number; withScene?: boolean }): Chapter {
  const id = newId();
  db.prepare('INSERT INTO chapters (id, act_id, sort_order, title) VALUES (?, ?, ?, ?)').run(id, actId, nextOrder(db, 'chapters', 'act_id', actId), data.title ?? '');
  if (data.index != null) reorder(db, 'chapters', 'act_id', actId, id, data.index);
  if (data.withScene) createScene(db, id, {});
  return rowToChapter(db.prepare('SELECT * FROM chapters WHERE id = ?').get(id) as Row);
}

export function updateChapter(db: DB, id: string, patch: Partial<Chapter>) {
  updateRow(db, 'chapters', id, patch, { title: { col: 'title' }, summary: { col: 'summary' } }, null);
}

export function moveChapter(db: DB, id: string, actId: string | undefined, index: number) {
  const r = db.prepare('SELECT act_id FROM chapters WHERE id = ?').get(id) as Row | undefined;
  if (!r) notFound(t('Chapter not found'));
  db.transaction(() => reorder(db, 'chapters', 'act_id', actId ?? r.act_id, id, index))();
}

export function deleteChapter(db: DB, id: string) {
  db.prepare('DELETE FROM chapters WHERE id = ?').run(id);
}

// ---------------------------------------------------------------- Szenen

export function getScene(db: DB, id: string): Scene {
  const r = db.prepare('SELECT * FROM scenes WHERE id = ?').get(id);
  if (!r) notFound(t('Scene not found'));
  return rowToScene(r as Row);
}

export function createScene(db: DB, chapterId: string, data: { title?: string; index?: number; content?: PMDoc; summary?: string }): Scene {
  const id = newId();
  const content = data.content && isDoc(data.content) ? data.content : emptyDoc();
  const text = docToPlainText(content);
  db.prepare(
    'INSERT INTO scenes (id, chapter_id, sort_order, title, content, text, summary, word_count, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, chapterId, nextOrder(db, 'scenes', 'chapter_id', chapterId), data.title ?? '', JSON.stringify(content), text, data.summary ?? '', countWords(text), now());
  if (data.index != null) reorder(db, 'scenes', 'chapter_id', chapterId, id, data.index);
  return getScene(db, id);
}

const SCENE_SPEC = {
  title: { col: 'title' },
  summary: { col: 'summary' },
  povCharacterId: { col: 'pov_character_id' },
  povType: { col: 'pov_type' },
  labels: { col: 'labels', kind: 'json' as const },
  hideFromAI: { col: 'hide_from_ai', kind: 'bool' as const },
};

export function updateScene(db: DB, id: string, patch: Partial<Scene>): SceneMeta {
  const p: Record<string, unknown> = { ...patch };
  const sets: Record<string, unknown> = {};
  if (patch.content && isDoc(patch.content)) {
    const text = docToPlainText(patch.content);
    db.prepare('UPDATE scenes SET content = ?, text = ?, word_count = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(patch.content),
      text,
      countWords(text),
      now(),
      id,
    );
  }
  delete p.content;
  Object.assign(sets, p);
  updateRow(db, 'scenes', id, sets, SCENE_SPEC);
  const r = db.prepare(`SELECT ${SCENE_META_COLS} FROM scenes WHERE id = ?`).get(id);
  if (!r) notFound(t('Scene not found'));
  touchNovel(db, novelIdOfScene(db, id));
  return rowToSceneMeta(r as Row);
}

export function moveScene(db: DB, id: string, chapterId: string | undefined, index: number) {
  const r = db.prepare('SELECT chapter_id FROM scenes WHERE id = ?').get(id) as Row | undefined;
  if (!r) notFound(t('Scene not found'));
  db.transaction(() => reorder(db, 'scenes', 'chapter_id', chapterId ?? r.chapter_id, id, index))();
}

export function deleteScene(db: DB, id: string) {
  db.prepare('DELETE FROM scenes WHERE id = ?').run(id);
}

/**
 * Teilt eine Szene an der Cursorposition. Der Browser liefert beide Hälften als Doc.
 * mode "scene": neue Szene im selben Kapitel. mode "chapter": neues Kapitel, nachfolgende Szenen wandern mit.
 */
export function splitScene(db: DB, id: string, data: { before: PMDoc; after: PMDoc; mode: 'scene' | 'chapter'; title?: string }) {
  const scene = getScene(db, id);
  return db.transaction(() => {
    createSnapshot(db, id, t('Before splitting'));
    updateScene(db, id, { content: data.before });
    const siblings = (db.prepare('SELECT id FROM scenes WHERE chapter_id = ? ORDER BY sort_order, rowid').all(scene.chapterId) as Row[]).map((r) => r.id as string);
    const pos = siblings.indexOf(id);
    if (data.mode === 'scene') {
      const s = createScene(db, scene.chapterId, { content: data.after, index: pos + 1, title: data.title });
      return { sceneId: s.id };
    }
    const ch = db.prepare('SELECT * FROM chapters WHERE id = ?').get(scene.chapterId) as Row;
    const chapters = (db.prepare('SELECT id FROM chapters WHERE act_id = ? ORDER BY sort_order, rowid').all(ch.act_id) as Row[]).map((r) => r.id as string);
    const newCh = createChapter(db, ch.act_id, { title: data.title ?? '', index: chapters.indexOf(ch.id) + 1 });
    const s = createScene(db, newCh.id, { content: data.after });
    siblings.slice(pos + 1).forEach((sid, i) => {
      db.prepare('UPDATE scenes SET chapter_id = ?, sort_order = ? WHERE id = ?').run(newCh.id, i + 1, sid);
    });
    return { sceneId: s.id, chapterId: newCh.id };
  })();
}

// ---------------------------------------------------------------- Snapshots

export function listSnapshots(db: DB, sceneId: string): SceneSnapshot[] {
  return (db.prepare('SELECT id, scene_id, created_at, reason, word_count FROM scene_snapshots WHERE scene_id = ? ORDER BY created_at DESC').all(sceneId) as Row[]).map(
    (r) => ({ id: r.id, sceneId: r.scene_id, createdAt: r.created_at, reason: r.reason, wordCount: r.word_count }),
  );
}

export function getSnapshot(db: DB, id: string): SceneSnapshot {
  const r = db.prepare('SELECT * FROM scene_snapshots WHERE id = ?').get(id) as Row | undefined;
  if (!r) notFound(t('Snapshot not found'));
  return {
    id: r.id,
    sceneId: r.scene_id,
    createdAt: r.created_at,
    reason: r.reason,
    wordCount: r.word_count,
    content: parseJson(r.content, emptyDoc()),
    text: r.text,
  };
}

export function createSnapshot(db: DB, sceneId: string, reason: string, content?: PMDoc): SceneSnapshot {
  const scene = getScene(db, sceneId);
  const doc = content && isDoc(content) ? content : scene.content;
  const text = docToPlainText(doc);
  // identische direkt aufeinanderfolgende Snapshots vermeiden
  const last = db.prepare('SELECT id, content FROM scene_snapshots WHERE scene_id = ? ORDER BY created_at DESC LIMIT 1').get(sceneId) as Row | undefined;
  const json = JSON.stringify(doc);
  if (last && last.content === json) return getSnapshot(db, last.id);
  const id = newId();
  db.prepare('INSERT INTO scene_snapshots (id, scene_id, created_at, reason, content, text, word_count) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    sceneId,
    now(),
    reason,
    json,
    text,
    countWords(text),
  );
  // höchstens 100 Snapshots pro Szene behalten
  db.prepare(
    `DELETE FROM scene_snapshots WHERE scene_id = ? AND id NOT IN (SELECT id FROM scene_snapshots WHERE scene_id = ? ORDER BY created_at DESC LIMIT 100)`,
  ).run(sceneId, sceneId);
  return getSnapshot(db, id);
}

export function restoreSnapshot(db: DB, id: string): Scene {
  const snap = getSnapshot(db, id);
  createSnapshot(db, snap.sceneId, t('Before restoring'));
  updateScene(db, snap.sceneId, { content: snap.content });
  return getScene(db, snap.sceneId);
}

export function deleteSnapshot(db: DB, id: string) {
  db.prepare('DELETE FROM scene_snapshots WHERE id = ?').run(id);
}

// ---------------------------------------------------------------- Serie

export function convertToSeries(db: DB, novelId: string, data: { title: string; description?: string; codexIds?: string[] }): Series {
  const novel = getNovel(db, novelId);
  if (novel.seriesId) throw new HttpError(400, t('The novel already belongs to a series.'));
  return db.transaction(() => {
    const s = createSeries(db, { title: data.title || novel.title, description: data.description });
    db.prepare('UPDATE novels SET series_id = ?, volume_number = 1, updated_at = ? WHERE id = ?').run(s.id, now(), novelId);
    const stmt = db.prepare('UPDATE codex_entries SET series_id = ?, novel_id = NULL, updated_at = ? WHERE id = ? AND novel_id = ?');
    for (const cid of data.codexIds ?? []) stmt.run(s.id, now(), cid, novelId);
    return s;
  })();
}

/** Einzelroman als (weiteren) Band in eine bestehende Serie aufnehmen. */
export function joinSeries(db: DB, novelId: string, data: { seriesId: string; volumeNumber?: number | null; codexIds?: string[] }): Novel {
  const novel = getNovel(db, novelId);
  if (novel.seriesId) throw new HttpError(400, t('The novel already belongs to a series.'));
  getSeries(db, data.seriesId);
  const max = (db.prepare('SELECT COALESCE(MAX(volume_number), 0) AS n FROM novels WHERE series_id = ?').get(data.seriesId) as Row).n as number;
  const vol = data.volumeNumber && data.volumeNumber > 0 ? Math.round(data.volumeNumber) : max + 1;
  db.transaction(() => {
    db.prepare('UPDATE novels SET series_id = ?, volume_number = ?, updated_at = ? WHERE id = ?').run(data.seriesId, vol, now(), novelId);
    const stmt = db.prepare('UPDATE codex_entries SET series_id = ?, novel_id = NULL, updated_at = ? WHERE id = ? AND novel_id = ?');
    for (const cid of data.codexIds ?? []) stmt.run(data.seriesId, now(), cid, novelId);
  })();
  return getNovel(db, novelId);
}

/** Band aus der Serie lösen – er wird wieder ein Einzelroman. Serien-Kodex bleibt bei der Serie. */
export function leaveSeries(db: DB, novelId: string): Novel {
  const novel = getNovel(db, novelId);
  if (!novel.seriesId) throw new HttpError(400, t('The novel doesn’t belong to a series.'));
  db.transaction(() => {
    db.prepare('UPDATE novels SET series_id = NULL, volume_number = NULL, updated_at = ? WHERE id = ?').run(now(), novelId);
    // POV-Figur auf Serienebene ist im Einzelroman nicht mehr sichtbar
    db.prepare('UPDATE novels SET pov_character_id = NULL WHERE id = ? AND pov_character_id IN (SELECT id FROM codex_entries WHERE novel_id IS NULL)').run(novelId);
  })();
  return getNovel(db, novelId);
}

// ---------------------------------------------------------------- Cover

export function getCover(db: DB, novelId: string): { mime: string; data: Buffer; updatedAt: string } | null {
  const r = db.prepare('SELECT mime, data, updated_at FROM novel_covers WHERE novel_id = ?').get(novelId) as Row | undefined;
  return r ? { mime: r.mime, data: r.data as Buffer, updatedAt: r.updated_at } : null;
}

const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function setCover(db: DB, novelId: string, mime: string, data: Buffer): Novel {
  getNovel(db, novelId);
  if (!COVER_TYPES.includes(mime)) throw new HttpError(400, t('Please choose an image (JPEG, PNG, WebP, or GIF).'));
  if (data.length > 8 * 1024 * 1024) throw new HttpError(400, t('The image is too large (max. 8 MB).'));
  db.prepare(
    'INSERT INTO novel_covers (novel_id, mime, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(novel_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at',
  ).run(novelId, mime, data, now());
  touchNovel(db, novelId);
  return getNovel(db, novelId);
}

export function deleteCover(db: DB, novelId: string): Novel {
  db.prepare('DELETE FROM novel_covers WHERE novel_id = ?').run(novelId);
  return getNovel(db, novelId);
}

export function createVolume(db: DB, seriesId: string, data: { title?: string }): Novel {
  getSeries(db, seriesId);
  const last = db.prepare('SELECT * FROM novels WHERE series_id = ? ORDER BY volume_number DESC LIMIT 1').get(seriesId) as Row | undefined;
  const vol = (last?.volume_number ?? 0) + 1;
  const n = createNovel(db, {
    title: data.title || t('Volume {n}', { n: vol }),
    author: last?.author,
    language: last?.language,
    tense: last?.tense,
    povType: last?.pov_type,
    seriesId,
    volumeNumber: vol,
  });
  if (last) {
    const settings = parseJson(last.settings, {});
    // POV-Figur nur übernehmen, wenn sie auf Serienebene liegt (sonst im neuen Band unsichtbar)
    const pov = last.pov_character_id
      ? (db.prepare('SELECT novel_id FROM codex_entries WHERE id = ?').get(last.pov_character_id) as Row | undefined)
      : undefined;
    updateNovel(db, n.id, {
      settings,
      additionalInstructions: last.additional_instructions,
      povCharacterId: pov && pov.novel_id == null ? last.pov_character_id : null,
    });
  }
  return getNovel(db, n.id);
}
