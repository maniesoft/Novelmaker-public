// Prompts und Komponenten (Komponenten sind Prompts vom Typ "component").
//
// Jeder Prompt hat je Sprache eine eigene Fassung (Tabelle prompt_texts: Name, Beschreibung, Nachrichten,
// Eingabefelder, Bausteine). Gemeinsam sind Typ, Herkunft und Schlüssel. prompts.lang ist die Ausgangssprache:
// fehlt eine Fassung, wird sie angezeigt bzw. benutzt. Ihr Inhalt steht zusätzlich in den alten Spalten von prompts.
import {
  BUILTIN_KEYS,
  builtinPrompt,
  builtinType,
  compileBlockPrompt,
  decodeClipboard,
  encodeClipboard,
  getLang,
  includedComponentNames,
  isLang,
  LANGS,
  LEGACY_BUILTIN_FINGERPRINTS,
  messagesFingerprint,
  parseNcPrompt,
  PERSONAS_COMPONENT,
  removeIncludes,
  renameChips,
  retypeSpec,
  t,
  toNcPrompt,
  toNovelmakerNames,
  type BlockPromptSpec,
  type Lang,
  type Prompt,
  type PromptComponentData,
  type PromptInput,
  type PromptMessage,
} from '@novelmaker/shared';
import { HttpError, newId, notFound, now, parseJson, type DB } from '../db';
import { getSettingsValue, setSettingsValue } from './settings';

type Row = Record<string, any>;

/** Inhalt einer Sprachfassung. */
interface PromptText {
  name: string;
  description: string;
  messages: PromptMessage[];
  inputs: PromptInput[];
  blocks: BlockPromptSpec | null;
}

type TextMap = Map<Lang, Row>;

const langOf = (v: unknown, fallback: Lang = getLang()): Lang => (isLang(v) ? v : fallback);

function loadTexts(db: DB, id?: string): Map<string, TextMap> {
  const rows = (id ? db.prepare('SELECT * FROM prompt_texts WHERE prompt_id = ?').all(id) : db.prepare('SELECT * FROM prompt_texts').all()) as Row[];
  const out = new Map<string, TextMap>();
  for (const r of rows) {
    if (!isLang(r.lang)) continue;
    let m = out.get(r.prompt_id);
    if (!m) out.set(r.prompt_id, (m = new Map()));
    m.set(r.lang, r);
  }
  return out;
}

/** Fassung wählen: gewünschte Sprache → Ausgangssprache → Englisch → irgendeine. */
function pickText(r: Row, texts: TextMap | undefined, lang: Lang): Row | null {
  if (!texts?.size) return null;
  return texts.get(lang) ?? texts.get(r.lang) ?? texts.get('en') ?? [...texts.values()][0];
}

function toPrompt(r: Row, texts: TextMap | undefined, lang: Lang): Prompt {
  const tx = pickText(r, texts, lang);
  const src = tx ?? r;
  return {
    id: r.id,
    type: r.type,
    name: src.name,
    description: src.description,
    messages: parseJson(src.messages, []),
    inputs: parseJson(src.inputs, []),
    origin: r.origin,
    builtinKey: r.builtin_key ?? null,
    blocks: parseJson<BlockPromptSpec | null>(src.blocks, null),
    lang: tx ? tx.lang : langOf(r.lang, 'de'),
    langs: LANGS.filter((l) => texts?.has(l)),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listPrompts(db: DB, lang: Lang = getLang()): Prompt[] {
  const rows = db.prepare('SELECT * FROM prompts').all() as Row[];
  const texts = loadTexts(db);
  return rows
    .map((r) => toPrompt(r, texts.get(r.id), lang))
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function getPrompt(db: DB, id: string, lang: Lang = getLang()): Prompt {
  const r = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id) as Row | undefined;
  if (!r) notFound(t('Prompt not found'));
  return toPrompt(r, loadTexts(db, id).get(id), lang);
}

export function findPromptByKey(db: DB, key: string, lang: Lang = getLang()): Prompt | null {
  const r = db.prepare('SELECT id FROM prompts WHERE builtin_key = ?').get(key) as Row | undefined;
  return r ? getPrompt(db, r.id, lang) : null;
}

/** Komponenten in einer Sprache (fehlt die Fassung: Ausgangsfassung) – für include(). */
export function listComponents(db: DB, lang: Lang = getLang()): PromptComponentData[] {
  const rows = db.prepare("SELECT * FROM prompts WHERE type = 'component'").all() as Row[];
  const texts = loadTexts(db);
  return rows.map((r) => {
    const p = toPrompt(r, texts.get(r.id), lang);
    return { name: p.name, messages: p.messages, inputs: p.inputs };
  });
}

/** Baustein-Prompts: Nachrichten und Eingabefelder werden immer aus den Bausteinen erzeugt (Rahmentexte in der Sprache der Fassung). */
function withCompiled<T extends Partial<PromptText>>(data: T, type: string, lang: Lang): T {
  if (!data.blocks) return data;
  const c = compileBlockPrompt(data.blocks, type, lang);
  return { ...data, messages: c.messages, inputs: c.inputs };
}

/** Sprachfassung speichern; die Ausgangsfassung zusätzlich in prompts spiegeln. */
function writeText(db: DB, id: string, lang: Lang, text: PromptText, ts = now()) {
  db.prepare(
    `INSERT INTO prompt_texts (prompt_id, lang, name, description, messages, inputs, blocks, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(prompt_id, lang) DO UPDATE SET name = excluded.name, description = excluded.description, messages = excluded.messages,
       inputs = excluded.inputs, blocks = excluded.blocks, updated_at = excluded.updated_at`,
  ).run(id, lang, text.name, text.description, JSON.stringify(text.messages), JSON.stringify(text.inputs), text.blocks ? JSON.stringify(text.blocks) : null, ts);
  db.prepare(
    'UPDATE prompts SET name = ?, description = ?, messages = ?, inputs = ?, blocks = ?, updated_at = ? WHERE id = ? AND lang = ?',
  ).run(text.name, text.description, JSON.stringify(text.messages), JSON.stringify(text.inputs), text.blocks ? JSON.stringify(text.blocks) : null, ts, id, lang);
  db.prepare('UPDATE prompts SET updated_at = ? WHERE id = ?').run(ts, id);
}

const textOf = (p: Pick<Prompt, 'name' | 'description' | 'messages' | 'inputs' | 'blocks'>): PromptText => ({
  name: p.name,
  description: p.description,
  messages: p.messages,
  inputs: p.inputs,
  blocks: p.blocks,
});

export type PromptInputData = Partial<Prompt> & { lang?: Lang };

export function createPrompt(db: DB, input: PromptInputData): Prompt {
  const lang = langOf(input.lang);
  const id = newId();
  const ts = now();
  const type = input.type ?? 'scene-beat-completion';
  const data = withCompiled(input, type, lang);
  const text: PromptText = {
    name: data.name?.trim() || t('New prompt'),
    description: data.description ?? '',
    messages: data.messages ?? [{ type: 'system', text: '', format: 'aic2' }],
    inputs: data.inputs ?? [],
    blocks: data.blocks ?? null,
  };
  db.prepare(
    `INSERT INTO prompts (id, type, name, description, messages, inputs, origin, builtin_key, blocks, lang, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, type, text.name, text.description, '[]', '[]', data.origin ?? 'custom', data.builtinKey ?? null, null, lang, ts, ts);
  writeText(db, id, lang, text, ts);
  return getPrompt(db, id, lang);
}

const TEXT_KEYS = ['name', 'description', 'messages', 'inputs', 'blocks'] as const;

/**
 * Prompt ändern. Inhalte (Name, Beschreibung, Nachrichten, Eingabefelder, Bausteine) gehen in die Fassung der Sprache
 * `lang` – gibt es sie noch nicht, entsteht sie aus der bisher angezeigten Fassung. Der Typ gilt für alle Fassungen.
 */
export function updatePrompt(db: DB, id: string, patchIn: PromptInputData, langIn?: Lang): Prompt {
  const lang = langOf(langIn ?? patchIn.lang);
  const before = getPrompt(db, id, lang);
  const ts = now();
  const type = patchIn.type ?? before.type;

  if (type !== before.type) {
    db.prepare('UPDATE prompts SET type = ?, updated_at = ? WHERE id = ?').run(type, ts, id);
    // andere Fassungen mit Bausteinen an den neuen Typ anpassen
    for (const [l, r] of loadTexts(db, id).get(id) ?? []) {
      if (l === lang) continue;
      const spec = parseJson<BlockPromptSpec | null>(r.blocks, null);
      if (!spec) continue;
      const blocks = retypeSpec(spec, before.type, type);
      const c = compileBlockPrompt(blocks, type, l);
      writeText(db, id, l, { name: r.name, description: r.description, messages: c.messages, inputs: c.inputs, blocks }, ts);
    }
  }

  const touchesText = TEXT_KEYS.some((k) => patchIn[k] !== undefined);
  if (touchesText || (before.lang === lang && before.blocks && type !== before.type)) {
    let next: PromptText = textOf(before);
    for (const k of TEXT_KEYS) if (patchIn[k] !== undefined) (next as unknown as Record<string, unknown>)[k] = patchIn[k];
    if (typeof next.name === 'string') next.name = next.name.trim() || before.name;
    // blocks: null = zum Experten-Prompt machen (Nachrichten bleiben)
    if (next.blocks) next = withCompiled(next, type, lang);
    writeText(db, id, lang, next, ts);
  }

  // Umbenannte Komponente: Name gilt für alle Fassungen, include()-Aufrufe in anderen Prompts mitziehen
  if (before.type === 'component' && patchIn.name?.trim() && patchIn.name.trim() !== before.name) {
    const name = patchIn.name.trim();
    db.prepare('UPDATE prompt_texts SET name = ? WHERE prompt_id = ?').run(name, id);
    db.prepare('UPDATE prompts SET name = ? WHERE id = ?').run(name, id);
    renameIncludes(db, before.name, name);
  }
  return getPrompt(db, id, lang);
}

/** include("alt") → include("neu") in allen Fassungen aller Prompts. */
function renameIncludes(db: DB, oldName: string, newName: string) {
  const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(include\\(\\s*)(["'])${esc}\\2`, 'gi');
  rewriteAllMessages(db, (text) => text.replace(re, (_all, pre, q) => `${pre}${q}${newName}${q}`));
}

/** Text aller Nachrichten in allen Fassungen umschreiben (Bausteine bleiben, nur Skript-Text). */
function rewriteAllMessages(db: DB, fn: (text: string) => string) {
  const apply = (json: string): string | null => {
    const messages = parseJson<PromptMessage[]>(json, []);
    let changed = false;
    const next = messages.map((m) => {
      const text = fn(m.text);
      if (text !== m.text) changed = true;
      return { ...m, text };
    });
    return changed ? JSON.stringify(next) : null;
  };
  for (const r of db.prepare('SELECT prompt_id, lang, messages FROM prompt_texts').all() as Row[]) {
    const next = apply(r.messages);
    if (next) db.prepare('UPDATE prompt_texts SET messages = ? WHERE prompt_id = ? AND lang = ?').run(next, r.prompt_id, r.lang);
  }
  for (const r of db.prepare('SELECT id, messages FROM prompts').all() as Row[]) {
    const next = apply(r.messages);
    if (next) db.prepare('UPDATE prompts SET messages = ? WHERE id = ?').run(next, r.id);
  }
}

export function deletePrompt(db: DB, id: string) {
  const p = getPrompt(db, id);
  if (p.builtinKey) {
    const deleted = getSettingsValue<string[]>(db, 'deletedBuiltins', []);
    if (!deleted.includes(p.builtinKey)) setSettingsValue(db, 'deletedBuiltins', [...deleted, p.builtinKey]);
  }
  db.prepare('DELETE FROM prompt_texts WHERE prompt_id = ?').run(id);
  db.prepare('DELETE FROM prompts WHERE id = ?').run(id);
}

/** Fassung einer Sprache anlegen: Kopie einer anderen Fassung (Platzhalter-Chips werden in die Zielsprache umbenannt). */
export function createPromptText(db: DB, id: string, lang: Lang, from?: Lang): Prompt {
  const texts = loadTexts(db, id).get(id);
  if (texts?.has(lang)) return getPrompt(db, id, lang);
  const src = getPrompt(db, id, from ?? lang);
  let text = textOf(src);
  if (text.blocks) {
    const opts = text.blocks.options;
    text = withCompiled({ ...text, blocks: { ...text.blocks, role: renameChips(text.blocks.role, lang, opts), task: renameChips(text.blocks.task, lang, opts) } }, src.type, lang);
  }
  writeText(db, id, lang, text);
  forgetDeletedText(db, src.builtinKey, lang);
  return getPrompt(db, id, lang);
}

/** Fassung einer Sprache löschen (die letzte nicht). */
export function deletePromptText(db: DB, id: string, lang: Lang): Prompt {
  const r = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id) as Row | undefined;
  if (!r) notFound(t('Prompt not found'));
  const texts = loadTexts(db, id).get(id) ?? new Map();
  if (!texts.has(lang)) return getPrompt(db, id);
  if (texts.size <= 1) throw new HttpError(400, t('The last version can’t be deleted — delete the prompt instead.'));
  db.prepare('DELETE FROM prompt_texts WHERE prompt_id = ? AND lang = ?').run(id, lang);
  if (r.lang === lang) {
    // neue Ausgangssprache: Englisch, sonst die erste vorhandene
    const rest = LANGS.filter((l) => l !== lang && texts.has(l));
    const base = rest.includes('en') ? 'en' : rest[0];
    const tx = texts.get(base)!;
    db.prepare('UPDATE prompts SET lang = ?, name = ?, description = ?, messages = ?, inputs = ?, blocks = ?, updated_at = ? WHERE id = ?').run(
      base,
      tx.name,
      tx.description,
      tx.messages,
      tx.inputs,
      tx.blocks,
      now(),
      id,
    );
  }
  if (r.builtin_key) {
    const deleted = getSettingsValue<string[]>(db, 'deletedBuiltinTexts', []);
    const k = `${r.builtin_key}:${lang}`;
    if (!deleted.includes(k)) setSettingsValue(db, 'deletedBuiltinTexts', [...deleted, k]);
  }
  return getPrompt(db, id);
}

function forgetDeletedText(db: DB, key: string | null, lang: Lang) {
  if (!key) return;
  const deleted = getSettingsValue<string[]>(db, 'deletedBuiltinTexts', []);
  const k = `${key}:${lang}`;
  if (deleted.includes(k)) setSettingsValue(db, 'deletedBuiltinTexts', deleted.filter((x) => x !== k));
}

export function duplicatePrompt(db: DB, id: string): Prompt {
  const r = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id) as Row | undefined;
  if (!r) notFound(t('Prompt not found'));
  const texts = loadTexts(db, id).get(id) ?? new Map<Lang, Row>();
  const base = langOf(r.lang, 'de');
  const first = getPrompt(db, id, base);
  const copy = createPrompt(db, { ...first, name: uniqueName(db, t('{name} (copy)', { name: first.name }, base), base), origin: 'custom', builtinKey: null, lang: base });
  for (const [l, tx] of texts) {
    if (l === base) continue;
    const p = toPrompt(r, new Map([[l, tx]]), l);
    writeText(db, copy.id, l, { ...textOf(p), name: uniqueName(db, t('{name} (copy)', { name: p.name }, l), l) });
  }
  return getPrompt(db, copy.id);
}

function uniqueName(db: DB, name: string, lang: Lang = getLang()): string {
  const names = new Set(listPrompts(db, lang).map((p) => p.name.toLowerCase()));
  if (!names.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) if (!names.has(`${name} (${i})`.toLowerCase())) return `${name} (${i})`;
}

/** Komponenten früherer Versionen hießen „Novelcrafter/…“ – auf „Novelmaker/…“ umstellen (inkl. include()-Aufrufen). */
function migrateComponentNames(db: DB) {
  const old = db.prepare("SELECT id, name FROM prompts WHERE type = 'component' AND name LIKE 'Novelcrafter/%'").all() as Row[];
  for (const r of old) {
    const target = 'Novelmaker/' + (r.name as string).slice('Novelcrafter/'.length);
    const taken = db.prepare("SELECT id FROM prompts WHERE type = 'component' AND lower(name) = lower(?)").get(target);
    if (taken) renameIncludes(db, r.name, target);
    else {
      const p = getPrompt(db, r.id);
      updatePrompt(db, r.id, { name: target }, p.lang);
    }
  }
  // include()-Aufrufe, deren alte Komponente es gar nicht gab
  rewriteAllMessages(db, (text) => (/include\(\s*["']Novelcrafter\//i.test(text) ? toNovelmakerNames(text) : text));
}

/**
 * Frühere Versionen lieferten die leere Platzhalter-Komponente „Novelmaker/Personas“ mit (Überbleibsel aus Novelcrafter).
 * Unverändert wird sie samt ihrer include()-Aufrufe entfernt; selbst befüllt bleibt sie als eigene Komponente.
 */
function retirePersonasComponent(db: DB) {
  const key = 'component:personas';
  const deleted = getSettingsValue<string[]>(db, 'deletedBuiltins', []);
  const r = db.prepare('SELECT id, name, messages FROM prompts WHERE builtin_key = ?').get(key) as Row | undefined;
  if (!r && !deleted.includes(key)) return;
  if (deleted.includes(key)) setSettingsValue(db, 'deletedBuiltins', deleted.filter((k) => k !== key));
  const deletedTexts = getSettingsValue<string[]>(db, 'deletedBuiltinTexts', []);
  if (deletedTexts.some((k) => k.startsWith(`${key}:`))) setSettingsValue(db, 'deletedBuiltinTexts', deletedTexts.filter((k) => !k.startsWith(`${key}:`)));
  let name = PERSONAS_COMPONENT;
  if (r) {
    const versions = [r.messages, ...(db.prepare('SELECT messages FROM prompt_texts WHERE prompt_id = ?').all(r.id) as Row[]).map((x) => x.messages)];
    const filled = versions.some((json) => parseJson<PromptMessage[]>(json, []).some((m) => m.text.replace(/\{![\s\S]*?!\}/g, '').trim()));
    if (filled) {
      db.prepare("UPDATE prompts SET builtin_key = NULL, origin = CASE origin WHEN 'builtin' THEN 'custom' ELSE origin END WHERE id = ?").run(r.id);
      return;
    }
    db.prepare('DELETE FROM prompt_texts WHERE prompt_id = ?').run(r.id);
    db.prepare('DELETE FROM prompts WHERE id = ?').run(r.id);
    name = r.name;
  }
  // include()-Aufrufe nur entfernen, wenn es keine gleichnamige Komponente mehr gibt
  const other = db.prepare("SELECT id FROM prompts WHERE type = 'component' AND lower(name) = lower(?)").get(name);
  if (!other) rewriteAllMessages(db, (text) => removeIncludes(text, name));
}

/** Unverändert gebliebene mitgelieferte Prompts früherer Versionen (deutsch) auf die Baustein-Fassung umstellen. */
function upgradeLegacyBuiltins(db: DB) {
  for (const key of BUILTIN_KEYS) {
    const b = builtinPrompt(key, 'de');
    if (!b?.blocks) continue;
    const p = findPromptByKey(db, key, 'de');
    if (!p || p.lang !== 'de' || p.blocks || !LEGACY_BUILTIN_FINGERPRINTS[key]?.includes(messagesFingerprint(p.messages))) continue;
    updatePrompt(db, p.id, { type: b.type, description: b.description, blocks: b.blocks }, 'de');
  }
}

/**
 * Mitgelieferte Prompts anlegen, falls sie fehlen (vom Nutzer gelöschte nicht wieder), und fehlende
 * Sprachfassungen ergänzen (vom Nutzer gelöschte Fassungen ebenfalls nicht).
 */
export function seedBuiltins(db: DB) {
  migrateComponentNames(db);
  retirePersonasComponent(db);
  upgradeLegacyBuiltins(db);
  const deleted = new Set(getSettingsValue<string[]>(db, 'deletedBuiltins', []));
  const deletedTexts = new Set(getSettingsValue<string[]>(db, 'deletedBuiltinTexts', []));
  const allTexts = loadTexts(db);
  for (const key of BUILTIN_KEYS) {
    if (deleted.has(key)) continue;
    let id = (db.prepare('SELECT id FROM prompts WHERE builtin_key = ?').get(key) as Row | undefined)?.id as string | undefined;
    const en = builtinPrompt(key, 'en')!;
    if (!id && builtinType(key) === 'component') {
      // gleichnamige (z. B. importierte) Komponente übernimmt den Schlüssel
      const existing = db.prepare("SELECT id FROM prompts WHERE type = 'component' AND lower(name) = lower(?)").get(en.name) as Row | undefined;
      if (existing) {
        db.prepare('UPDATE prompts SET builtin_key = ? WHERE id = ?').run(key, existing.id);
        id = existing.id;
      }
    }
    if (!id) {
      id = createPrompt(db, { type: en.type, name: en.name, description: en.description, messages: en.messages, inputs: en.inputs, blocks: en.blocks ?? null, origin: 'builtin', builtinKey: key, lang: 'en' }).id;
      allTexts.set(id, loadTexts(db, id).get(id) ?? new Map());
    }
    const have = allTexts.get(id) ?? new Map();
    for (const lang of LANGS) {
      if (have.has(lang) || deletedTexts.has(`${key}:${lang}`)) continue;
      const b = builtinPrompt(key, lang)!;
      writeText(db, id, lang, { name: b.name, description: b.description, messages: b.messages, inputs: b.inputs, blocks: b.blocks ?? null });
    }
  }
}

export function resetBuiltin(db: DB, id: string, lang: Lang = getLang()): Prompt {
  const p = getPrompt(db, id, lang);
  const b = p.builtinKey ? builtinPrompt(p.builtinKey, lang) : undefined;
  if (!b) throw new HttpError(400, t('Not a built-in prompt.'));
  forgetDeletedText(db, p.builtinKey, lang);
  return updatePrompt(db, id, { name: b.name, description: b.description, messages: b.messages, inputs: b.inputs, type: b.type, blocks: b.blocks ?? null }, lang);
}

export function restoreDeletedBuiltins(db: DB) {
  setSettingsValue(db, 'deletedBuiltins', []);
  setSettingsValue(db, 'deletedBuiltinTexts', []);
  seedBuiltins(db);
}

export async function importPrompt(db: DB, text: string, lang: Lang = getLang()): Promise<{ prompt: Prompt; warnings: string[]; replaced: boolean }> {
  let data: unknown;
  try {
    data = await decodeClipboard(text);
  } catch {
    throw new HttpError(400, t('The text isn’t a valid prompt export from Novelcrafter (Base64/gzip/JSON).'));
  }
  let parsed;
  try {
    parsed = parseNcPrompt(data);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const { prompt, warnings } = parsed;
  if (prompt.type === 'component') {
    const existing = db.prepare("SELECT id FROM prompts WHERE type = 'component' AND lower(name) = lower(?)").get(prompt.name) as Row | undefined;
    if (existing) {
      const p = updatePrompt(db, existing.id, { messages: prompt.messages, inputs: prompt.inputs, description: prompt.description || undefined, blocks: null }, lang);
      db.prepare("UPDATE prompts SET origin = 'imported' WHERE id = ?").run(existing.id);
      warnings.push(t('Existing component “{name}” was replaced.', { name: prompt.name }));
      return { prompt: { ...p, origin: 'imported' }, warnings, replaced: true };
    }
  }
  const name = uniqueName(db, prompt.name, lang);
  if (name !== prompt.name) warnings.push(t('Name already exists — imported as “{name}”.', { name }));
  const created = createPrompt(db, { ...prompt, name, origin: 'imported', blocks: null, lang });
  const known = new Set(listComponents(db, lang).map((c) => c.name.toLowerCase()));
  for (const m of prompt.messages) {
    for (const inc of includedComponentNames(m.text)) {
      if (!known.has(inc.toLowerCase())) warnings.push(t('Component “{name}” is missing — please import or create it as well.', { name: inc }));
    }
  }
  return { prompt: created, warnings: [...new Set(warnings)], replaced: false };
}

export async function exportPrompt(db: DB, id: string, lang: Lang = getLang()): Promise<string> {
  const p = getPrompt(db, id, lang);
  return encodeClipboard(toNcPrompt(p));
}

/** Welche Prompts binden diese Komponente ein (in irgendeiner Fassung)? */
export function componentUsages(db: DB, id: string, lang: Lang = getLang()): { id: string; name: string; type: string }[] {
  const comp = getPrompt(db, id, lang);
  const key = comp.name.trim().toLowerCase();
  const users = new Set<string>();
  for (const r of db.prepare('SELECT prompt_id, messages FROM prompt_texts').all() as Row[]) {
    if (r.prompt_id === id) continue;
    const messages = parseJson<PromptMessage[]>(r.messages, []);
    if (messages.some((m) => includedComponentNames(m.text).some((n) => n.trim().toLowerCase() === key))) users.add(r.prompt_id);
  }
  return listPrompts(db, lang)
    .filter((p) => users.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, type: p.type }));
}
