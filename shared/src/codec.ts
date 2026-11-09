// Novelcrafter-Zwischenablage: Base64 (ohne "="-Auffüllung) → gzip → JSON.
// Läuft im Browser und in Node (CompressionStream ist in beiden vorhanden).
import { t } from './i18n';
import type { InputKind, PromptInput, PromptMessage, PromptType } from './types';

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  let s = b64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pipe(bytes: Uint8Array, transform: any): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = new Response(bytes as any).body!.pipeThrough(transform);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Uint8Array(await new Response(stream as any).arrayBuffer());
}

export async function decodeClipboard(text: string): Promise<unknown> {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed); // bereits entpacktes JSON
  const bytes = base64ToBytes(trimmed);
  const raw = await pipe(bytes, new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(raw));
}

export async function encodeClipboard(data: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(data));
  const gz = await pipe(json, new CompressionStream('gzip'));
  return bytesToBase64(gz).replace(/=+$/, '');
}

// ---------------------------------------------------------------- Prompt-Format nc:prompt:1

export interface NcPrompt {
  $schema: 'nc:prompt:1';
  type: string;
  name: string;
  description?: string;
  messages: { type: string; text: string; format?: string }[];
  inputs?: PromptInput[];
}

export interface NcModels {
  $schema: 'nc:models:1';
  name: string;
  models: { id: string; name?: string }[];
}

export interface ImportedPrompt {
  type: PromptType;
  name: string;
  description: string;
  messages: PromptMessage[];
  inputs: PromptInput[];
}

const KNOWN_INPUT_KINDS: InputKind[] = ['dropdown', 'text', 'act', 'chapter', 'scene', 'snippet', 'codex', 'fullNovel'];

/** Entfernt den Zusatz „ (Copy)“ (auch mehrfach bzw. nummeriert). */
export function stripCopySuffix(name: string): string {
  return name.replace(/(\s*\((Copy|Kopie)(\s*\d+)?\))+\s*$/i, '').trim();
}

/**
 * Mitgelieferte Komponenten heißen in Novelcrafter „Novelcrafter/…“, in Novelmaker „Novelmaker/…“.
 * Beim Import werden Namen und include()-Aufrufe umgeschrieben, beim Export zurück.
 */
const NC_PREFIX = 'Novelcrafter/';
const NM_PREFIX = 'Novelmaker/';
const includeRe = (prefix: string) => new RegExp(String.raw`(include\(\s*)(["'])` + prefix.replace('/', '\\/'), 'gi');
export function toNovelmakerNames(text: string): string {
  return text.replace(includeRe(NC_PREFIX), `$1$2${NM_PREFIX}`);
}
export function toNovelcrafterNames(text: string): string {
  return text.replace(includeRe(NM_PREFIX), `$1$2${NC_PREFIX}`);
}
/** Entfernt alle `{include("name")}` aus einem Template – steht der Aufruf allein auf einer Zeile, samt folgenden Leerzeilen. */
export function removeIncludes(text: string, name: string): string {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const call = String.raw`\{\s*include\(\s*(["'])${esc}\1\s*\)\s*\}`;
  return text.replace(new RegExp(String.raw`^[ \t]*${call}(?:[ \t]*\r?\n)*`, 'gim'), '').replace(new RegExp(call, 'gi'), '');
}

/** Novelcrafters Personas gibt es in Novelmaker nicht – deren include() fällt beim Import weg. */
export const PERSONAS_COMPONENT = NM_PREFIX + 'Personas';

const mapName = (name: string, from: string, to: string) => (name.toLowerCase().startsWith(from.toLowerCase()) ? to + name.slice(from.length) : name);

export function parseNcPrompt(data: unknown): { prompt: ImportedPrompt; warnings: string[] } {
  const warnings: string[] = [];
  if (!data || typeof data !== 'object') throw new Error(t('Not valid prompt JSON.'));
  const d = data as Partial<NcPrompt> & { $schema?: string };
  if (d.$schema !== 'nc:prompt:1') {
    if (d.$schema === 'nc:models:1') throw new Error(t('This is a model collection, not a prompt.'));
    warnings.push(t('Unknown schema “{schema}” — trying to import anyway.', { schema: String(d.$schema) }));
  }
  if (!Array.isArray(d.messages)) throw new Error(t('Prompt contains no messages.'));
  const messages: PromptMessage[] = d.messages.map((m, i) => {
    let role = String(m.type ?? 'user').toLowerCase();
    if (role === 'ai') role = 'assistant';
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      warnings.push(t('Message {n}: unknown role “{role}”, imported as “user”.', { n: i + 1, role }));
      role = 'user';
    }
    if (m.format && m.format !== 'aic2') warnings.push(t('Message {n}: format “{format}” is treated as aic2.', { n: i + 1, format: m.format }));
    return { type: role as PromptMessage['type'], text: removeIncludes(toNovelmakerNames(String(m.text ?? '')), PERSONAS_COMPONENT), format: m.format ?? 'aic2' };
  });
  const inputs: PromptInput[] = (d.inputs ?? []).map((inp) => {
    const types = (inp.types ?? []).filter((kind) => {
      const ok = KNOWN_INPUT_KINDS.includes(kind);
      if (!ok) warnings.push(t('Input “{name}”: type “{type}” is not supported.', { name: inp.name, type: kind }));
      return ok;
    });
    return { ...inp, types };
  });
  return {
    prompt: {
      type: String(d.type ?? 'scene-beat-completion'),
      name: mapName(stripCopySuffix(String(d.name ?? t('Imported prompt'))), NC_PREFIX, NM_PREFIX),
      description: String(d.description ?? ''),
      messages,
      inputs,
    },
    warnings,
  };
}

export function toNcPrompt(p: ImportedPrompt): NcPrompt {
  const out: NcPrompt = {
    $schema: 'nc:prompt:1',
    type: p.type,
    name: mapName(p.name, NM_PREFIX, NC_PREFIX),
    messages: p.messages.map((m) => ({ type: m.type, text: toNovelcrafterNames(m.text), format: m.format ?? 'aic2' })),
  };
  if (p.description) out.description = p.description;
  if (p.inputs.length) out.inputs = p.inputs;
  return out;
}

export function parseNcModels(data: unknown): NcModels {
  const d = data as Partial<NcModels>;
  if (!d || d.$schema !== 'nc:models:1' || !Array.isArray(d.models)) {
    if (d && (d as { $schema?: string }).$schema === 'nc:prompt:1') throw new Error(t('This is a prompt, not a model collection.'));
    throw new Error(t('Not a valid model collection (nc:models:1).'));
  }
  return {
    $schema: 'nc:models:1',
    name: String(d.name ?? t('Imported collection')),
    models: d.models.filter((m) => m && typeof m.id === 'string').map((m) => ({ id: m.id, name: m.name ?? '' })),
  };
}
