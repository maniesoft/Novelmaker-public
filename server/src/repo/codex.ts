// Kodex, Relationen, Snippets.
import { t, type CodexEntry, type CodexRelation, type Snippet } from '@novelmaker/shared';
import { HttpError, newId, notFound, now, parseJson, updateRow, type DB } from '../db';
import { getNovel } from './novels';

type Row = Record<string, any>;

export const rowToCodex = (r: Row): CodexEntry => ({
  id: r.id,
  seriesId: r.series_id ?? null,
  novelId: r.novel_id ?? null,
  type: r.type,
  name: r.name,
  aliases: parseJson(r.aliases, []),
  description: r.description,
  notes: r.notes,
  tags: parseJson(r.tags, []),
  fields: parseJson(r.fields, []),
  inclusion: r.inclusion,
  caseSensitive: !!r.case_sensitive,
  color: r.color ?? null,
  linkedNovelId: r.linked_novel_id ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Alle Einträge, die für einen Roman sichtbar sind (Band- und Serienebene). */
export function listCodexForNovel(db: DB, novelId: string): CodexEntry[] {
  const novel = getNovel(db, novelId);
  const rows = novel.seriesId
    ? db.prepare('SELECT * FROM codex_entries WHERE novel_id = ? OR (series_id = ? AND novel_id IS NULL) ORDER BY name COLLATE NOCASE').all(novelId, novel.seriesId)
    : db.prepare('SELECT * FROM codex_entries WHERE novel_id = ? ORDER BY name COLLATE NOCASE').all(novelId);
  return (rows as Row[]).map(rowToCodex);
}

export function getCodex(db: DB, id: string): CodexEntry {
  const r = db.prepare('SELECT * FROM codex_entries WHERE id = ?').get(id);
  if (!r) notFound(t('Codex entry not found'));
  return rowToCodex(r as Row);
}

export interface CodexInput extends Partial<CodexEntry> {
  /** "series" legt den Eintrag auf Serienebene an */
  level?: 'novel' | 'series';
}

function levelIds(db: DB, novelId: string, level: 'novel' | 'series' | undefined) {
  const novel = getNovel(db, novelId);
  if (level === 'series') {
    if (!novel.seriesId) throw new HttpError(400, t('The novel doesn’t belong to a series.'));
    return { series_id: novel.seriesId, novel_id: null };
  }
  return { series_id: null, novel_id: novelId };
}

export function createCodex(db: DB, novelId: string, data: CodexInput): CodexEntry {
  const id = newId();
  const ts = now();
  const lv = levelIds(db, novelId, data.level);
  db.prepare(
    `INSERT INTO codex_entries (id, series_id, novel_id, type, name, aliases, description, notes, tags, fields, inclusion, case_sensitive, color, linked_novel_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    lv.series_id,
    lv.novel_id,
    data.type ?? 'character',
    data.name?.trim() || t('New entry'),
    JSON.stringify(data.aliases ?? []),
    data.description ?? '',
    data.notes ?? '',
    JSON.stringify(data.tags ?? []),
    JSON.stringify(data.fields ?? []),
    data.inclusion ?? 'auto',
    data.caseSensitive ? 1 : 0,
    data.color ?? null,
    data.linkedNovelId ?? null,
    ts,
    ts,
  );
  return getCodex(db, id);
}

const CODEX_SPEC = {
  type: { col: 'type' },
  name: { col: 'name' },
  aliases: { col: 'aliases', kind: 'json' as const },
  description: { col: 'description' },
  notes: { col: 'notes' },
  tags: { col: 'tags', kind: 'json' as const },
  fields: { col: 'fields', kind: 'json' as const },
  inclusion: { col: 'inclusion' },
  caseSensitive: { col: 'case_sensitive', kind: 'bool' as const },
  color: { col: 'color' },
  linkedNovelId: { col: 'linked_novel_id' },
};

export function updateCodex(db: DB, id: string, patch: CodexInput & { novelId?: string }): CodexEntry {
  const current = getCodex(db, id);
  if (patch.level) {
    const novelId = patch.novelId ?? current.novelId ?? current.linkedNovelId;
    if (patch.level === 'series' && current.novelId) {
      const lv = levelIds(db, current.novelId, 'series');
      db.prepare('UPDATE codex_entries SET series_id = ?, novel_id = NULL WHERE id = ?').run(lv.series_id, id);
    } else if (patch.level === 'novel' && !current.novelId) {
      if (!novelId) throw new HttpError(400, t('Novel for the volume level is missing.'));
      db.prepare('UPDATE codex_entries SET series_id = NULL, novel_id = ? WHERE id = ?').run(novelId, id);
    }
  }
  const p = { ...patch };
  delete p.level;
  delete p.novelId;
  updateRow(db, 'codex_entries', id, p as Record<string, unknown>, CODEX_SPEC);
  return getCodex(db, id);
}

export function deleteCodex(db: DB, id: string) {
  db.prepare('DELETE FROM codex_entries WHERE id = ?').run(id);
  db.prepare('UPDATE novels SET pov_character_id = NULL WHERE pov_character_id = ?').run(id);
  db.prepare('UPDATE scenes SET pov_character_id = NULL WHERE pov_character_id = ?').run(id);
}

// ---------------------------------------------------------------- Doppelte Einträge (Band ↔ Serie)

const norm = (s: string) => s.trim().toLocaleLowerCase();
const sortedJson = (a: string[] | undefined) => JSON.stringify([...(a ?? [])].map((x) => x.trim()).sort());

/** Inhaltlich gleicher Eintrag? (Ebene und Farbe zählen nicht) */
export function sameCodexContent(a: Partial<CodexEntry>, b: CodexEntry): boolean {
  return (
    (a.type ?? 'character') === b.type &&
    norm(a.name ?? '') === norm(b.name) &&
    (a.description ?? '').trim() === b.description.trim() &&
    (a.notes ?? '').trim() === b.notes.trim() &&
    sortedJson(a.aliases) === sortedJson(b.aliases) &&
    sortedJson(a.tags) === sortedJson(b.tags) &&
    JSON.stringify(a.fields ?? []) === JSON.stringify(b.fields) &&
    (a.inclusion ?? 'auto') === b.inclusion
  );
}

export interface CodexDuplicate {
  bandId: string;
  seriesId: string;
  name: string;
}

export interface CodexDuplicates {
  /** Band-Einträge, die es inhaltlich gleich auf Serienebene gibt – lassen sich zusammenführen */
  identical: CodexDuplicate[];
  /** gleichnamig, aber abweichend: die Band-Fassung ersetzt in diesem Band den Serien-Eintrag */
  variants: CodexDuplicate[];
}

export function findCodexDuplicates(db: DB, novelId: string): CodexDuplicates {
  const out: CodexDuplicates = { identical: [], variants: [] };
  if (!getNovel(db, novelId).seriesId) return out;
  const entries = listCodexForNovel(db, novelId);
  const series = entries.filter((e) => !e.novelId);
  for (const b of entries.filter((e) => e.novelId)) {
    const same = series.filter((s) => norm(s.name) === norm(b.name));
    if (!same.length) continue;
    const ident = same.find((s) => sameCodexContent(b, s));
    if (ident) out.identical.push({ bandId: b.id, seriesId: ident.id, name: b.name });
    else out.variants.push({ bandId: b.id, seriesId: same[0].id, name: b.name });
  }
  return out;
}

/** Alle Verweise von einem Eintrag auf einen anderen umhängen und den alten löschen. */
function redirectCodex(db: DB, from: string, to: string) {
  db.prepare('UPDATE novels SET pov_character_id = ? WHERE pov_character_id = ?').run(to, from);
  db.prepare('UPDATE scenes SET pov_character_id = ? WHERE pov_character_id = ?').run(to, from);
  // Beziehungen umhängen – ohne Doppel und ohne Bezug auf sich selbst
  for (const r of db.prepare('SELECT * FROM codex_relations WHERE a_id = ? OR b_id = ?').all(from, from) as Row[]) {
    const a = r.a_id === from ? to : r.a_id;
    const b = r.b_id === from ? to : r.b_id;
    const dup = a === b || db.prepare('SELECT id FROM codex_relations WHERE id <> ? AND ((a_id = ? AND b_id = ?) OR (a_id = ? AND b_id = ?))').get(r.id, a, b, b, a);
    if (dup) db.prepare('DELETE FROM codex_relations WHERE id = ?').run(r.id);
    else db.prepare('UPDATE codex_relations SET a_id = ?, b_id = ? WHERE id = ?').run(a, b, r.id);
  }
  // IDs in JSON-Feldern: Anheftungen, Kontext und Eingaben von Chats, zuletzt gewählte Eingaben
  for (const [table, col] of [
    ['novels', 'settings'],
    ['chat_threads', 'context'],
    ['chat_threads', 'inputs'],
    ['settings', 'value'],
  ])
    db.prepare(`UPDATE ${table} SET ${col} = REPLACE(${col}, ?, ?) WHERE instr(${col}, ?) > 0`).run(from, to, from);
  db.prepare('DELETE FROM codex_entries WHERE id = ?').run(from);
}

/** Identische Band-Kopien von Serien-Einträgen entfernen; Verweise zeigen danach auf den Serien-Eintrag. */
export function mergeCodexDuplicates(db: DB, novelId: string): { merged: number; variants: number } {
  const dup = findCodexDuplicates(db, novelId);
  db.transaction(() => {
    for (const d of dup.identical) redirectCodex(db, d.bandId, d.seriesId);
  })();
  return { merged: dup.identical.length, variants: dup.variants.length };
}

// ---------------------------------------------------------------- Relationen

export function listRelations(db: DB, entryIds: string[]): CodexRelation[] {
  if (!entryIds.length) return [];
  const set = new Set(entryIds);
  return (db.prepare('SELECT * FROM codex_relations').all() as Row[])
    .filter((r) => set.has(r.a_id) || set.has(r.b_id))
    .map((r) => ({ id: r.id, aId: r.a_id, bId: r.b_id, label: r.label }));
}

export function createRelation(db: DB, aId: string, bId: string, label = ''): CodexRelation {
  if (aId === bId) throw new HttpError(400, t('An entry can’t be linked to itself.'));
  getCodex(db, aId);
  getCodex(db, bId);
  const exists = db.prepare('SELECT id FROM codex_relations WHERE (a_id = ? AND b_id = ?) OR (a_id = ? AND b_id = ?)').get(aId, bId, bId, aId) as Row | undefined;
  if (exists) {
    db.prepare('UPDATE codex_relations SET label = ? WHERE id = ?').run(label, exists.id);
    return { id: exists.id, aId, bId, label };
  }
  const id = newId();
  db.prepare('INSERT INTO codex_relations (id, a_id, b_id, label) VALUES (?, ?, ?, ?)').run(id, aId, bId, label);
  return { id, aId, bId, label };
}

export function deleteRelation(db: DB, id: string) {
  db.prepare('DELETE FROM codex_relations WHERE id = ?').run(id);
}

// ---------------------------------------------------------------- Snippets

const rowToSnippet = (r: Row): Snippet => ({
  id: r.id,
  novelId: r.novel_id ?? null,
  seriesId: r.series_id ?? null,
  title: r.title,
  text: r.text,
  pinned: !!r.pinned,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function listSnippets(db: DB, novelId: string): Snippet[] {
  const novel = getNovel(db, novelId);
  const rows = novel.seriesId
    ? db.prepare('SELECT * FROM snippets WHERE novel_id = ? OR (series_id = ? AND novel_id IS NULL) ORDER BY updated_at DESC').all(novelId, novel.seriesId)
    : db.prepare('SELECT * FROM snippets WHERE novel_id = ? ORDER BY updated_at DESC').all(novelId);
  return (rows as Row[]).map(rowToSnippet);
}

export function getSnippet(db: DB, id: string): Snippet {
  const r = db.prepare('SELECT * FROM snippets WHERE id = ?').get(id);
  if (!r) notFound(t('Snippet not found'));
  return rowToSnippet(r as Row);
}

export function createSnippet(db: DB, novelId: string, data: { title?: string; text?: string }): Snippet {
  const id = newId();
  const ts = now();
  db.prepare('INSERT INTO snippets (id, novel_id, title, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    novelId,
    data.title?.trim() || t('New snippet'),
    data.text ?? '',
    ts,
    ts,
  );
  return getSnippet(db, id);
}

export function updateSnippet(db: DB, id: string, patch: Partial<Snippet>): Snippet {
  const { pinned, ...rest } = patch;
  // Anheften ändert nicht das Änderungsdatum (sonst springt die Liste).
  if (pinned !== undefined) db.prepare('UPDATE snippets SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
  updateRow(db, 'snippets', id, rest, { title: { col: 'title' }, text: { col: 'text' } });
  return getSnippet(db, id);
}

export function deleteSnippet(db: DB, id: string) {
  db.prepare('DELETE FROM snippets WHERE id = ?').run(id);
}
