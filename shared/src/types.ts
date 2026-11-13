// Gemeinsame Domänentypen für Server und Browser.
import type { BlockPromptSpec } from './blocks';
import { DEFAULT_LANG, N_, t, type Lang } from './i18n';

export type Tense = 'past' | 'present';
export type PovType = 'first' | 'second' | 'third-limited' | 'third-omniscient';
export type ContextFormat = 'xml' | 'markdown' | 'plain';

export interface Series {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface NovelSettings {
  /** Akt-Ebene in der Gliederung zeigen (sonst automatisch: nur wenn mehr als ein Akt). */
  showActs?: boolean | null;
  /** Szenen-Ebene zeigen (sonst automatisch: nur wenn ein Kapitel mehr als eine Szene hat). */
  showScenes?: boolean | null;
  /** Token-Budget für codex.context (0 = unbegrenzt). */
  codexTokenBudget?: number;
  /** Auch Erwähnungen in der vorherigen Szene berücksichtigen. */
  codexScanPreviousScene?: boolean;
  /** Erwähnt ein eingebundener Eintrag einen anderen, kommt der mit (eine Ebene). */
  codexRecursive?: boolean;
  /** Ausgabeformat für Kodex-Einträge, Szenen usw. */
  contextFormat?: ContextFormat;
  /** Prompt-IDs für die Zusammenfassungs-Stufen. */
  summaryPrompts?: { scene?: string; chapter?: string; novel?: string };
  /** Neben dem Text angeheftete Kodex-Einträge und Szenen (Snippets haben ein eigenes Feld). */
  pins?: PinRef[];
}

export interface PinRef {
  kind: 'codex' | 'scene';
  id: string;
  /** Kodex: auch an die KI geben (wie „angeheftet“ im Kontext). Standard: ja. */
  ai?: boolean;
}

export interface Novel {
  id: string;
  seriesId: string | null;
  volumeNumber: number | null;
  title: string;
  author: string;
  description: string;
  language: string;
  tense: Tense;
  povType: PovType;
  povCharacterId: string | null;
  additionalInstructions: string;
  summary: string;
  settings: NovelSettings;
  /** Zeitstempel des Covers (für die Bild-URL), null = kein Cover. */
  coverVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NovelListItem extends Novel {
  wordCount: number;
  sceneCount: number;
}

export interface Act {
  id: string;
  novelId: string;
  sortOrder: number;
  title: string;
  summary: string;
}

export interface Chapter {
  id: string;
  actId: string;
  sortOrder: number;
  title: string;
  summary: string;
}

export interface SceneMeta {
  id: string;
  chapterId: string;
  sortOrder: number;
  title: string;
  summary: string;
  povCharacterId: string | null;
  povType: PovType | null;
  labels: string[];
  wordCount: number;
  hideFromAI: boolean;
  updatedAt: string;
}

export interface Scene extends SceneMeta {
  /** ProseMirror-JSON */
  content: PMDoc;
  /** Klartext-Cache (ohne Beats und Notizen) */
  text: string;
}

export interface OutlineChapter extends Chapter {
  scenes: SceneMeta[];
}
export interface OutlineAct extends Act {
  chapters: OutlineChapter[];
}
export interface Outline {
  novel: Novel;
  series: Series | null;
  acts: OutlineAct[];
}

export interface SceneSnapshot {
  id: string;
  sceneId: string;
  createdAt: string;
  reason: string;
  wordCount: number;
  content?: PMDoc;
  text?: string;
}

// ---------------------------------------------------------------- Kodex

export type CodexType = 'character' | 'location' | 'object' | 'lore' | 'subplot' | 'volume' | 'other';
export type CodexInclusion = 'auto' | 'always' | 'never';

export const CODEX_TYPES: { value: CodexType; label: string; xmlTag: string }[] = [
  { value: 'character', label: N_('Character'), xmlTag: 'character' },
  { value: 'location', label: N_('Location'), xmlTag: 'location' },
  { value: 'object', label: N_('Object'), xmlTag: 'object' },
  { value: 'lore', label: N_('Lore'), xmlTag: 'lore' },
  { value: 'subplot', label: N_('Subplot'), xmlTag: 'subplot' },
  { value: 'volume', label: N_('Volume'), xmlTag: 'volume' },
  { value: 'other', label: N_('Other'), xmlTag: 'entry' },
];

/** Anzeigename eines Kodex-Typs in der eingestellten Sprache. */
export const codexTypeLabel = (type: string): string => {
  const x = CODEX_TYPES.find((c) => c.value === type);
  return x ? t(x.label) : type;
};

export interface CodexField {
  key: string;
  value: string;
}

export interface CodexEntry {
  id: string;
  seriesId: string | null;
  novelId: string | null;
  type: CodexType;
  name: string;
  aliases: string[];
  description: string;
  notes: string;
  tags: string[];
  fields: CodexField[];
  inclusion: CodexInclusion;
  caseSensitive: boolean;
  color: string | null;
  /** Bei Band-Einträgen: der zusammengefasste Roman. */
  linkedNovelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CodexRelation {
  id: string;
  aId: string;
  bId: string;
  label: string;
}

export interface Snippet {
  id: string;
  novelId: string | null;
  seriesId: string | null;
  title: string;
  text: string;
  /** Angeheftet: bleibt beim Schreiben neben dem Editor sichtbar. */
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------- Import

/** Wie Szenentext ohne Trennlinie (Zusammenfassung ____ Prosa) behandelt wird (nur Novelcrafter-Format). */
export type UnseparatedMode = 'auto' | 'summary' | 'prose';

/**
 * "simple": einfaches Format – alles ist Prosa; ein Zip enthält Manuskript-Dateien (docx/md/txt),
 * einen Ordner „Kontext“ (je Datei ein Kodex-Eintrag) und „Snippets“.
 * "novelcrafter": Export aus Novelcrafter (Zusammenfassung ____ Prosa, Kodex-Ordner, Snippets, Chats).
 */
export type ImportFormat = 'simple' | 'novelcrafter';

export interface ImportOptions {
  /** Ohne Angabe: Novelcrafter bei einem erkannten Novelcrafter-Zip, sonst einfach. */
  format?: ImportFormat;
  /** Nur Novelcrafter: Szenen ohne Trennlinie. */
  unseparated?: UnseparatedMode;
  /** Nur Novelcrafter: Bedeutung einer waagerechten Linie im Szenentext (Novelcrafter trennt damit Zusammenfassung und Prosa). */
  separator?: 'summary' | 'scene-break';
  /** Titel überschreiben (sonst aus dem Dokument). */
  title?: string;
  /** Als nächsten Band an diese Serie anhängen (sonst Einzelroman). */
  seriesId?: string | null;
  codex?: boolean;
  snippets?: boolean;
  chats?: boolean;
}

export interface ImportPreview {
  kind: 'docx' | 'novelcrafter-zip' | 'zip' | 'markdown' | 'text';
  /** Das für diese Vorschau verwendete Format. */
  format: ImportFormat;
  /** Was die Datei vermutlich ist. */
  detected: ImportFormat;
  title: string;
  author: string;
  acts: number;
  chapters: number;
  scenes: number;
  /** Manuskript-Dateien (im Zip: mehrere = je ein Kapitel). */
  files: number;
  /** Gefundene waagerechte Linien (leere Absätze mit Unterrand). */
  separatorLines: number;
  /** Szenen mit Trennlinie: Zusammenfassung oben, Prosa unten. */
  separated: number;
  /** Szenen ohne Trennlinie, automatisch eingeordnet. */
  unseparated: { summary: number; prose: number };
  emptyScenes: number;
  codex: { total: number; byType: Record<string, number> };
  snippets: number;
  chats: number;
  warnings: string[];
  /** Format des (einzigen) Manuskripts, wenn es gar keine Überschriften enthält – alles landet in einem Kapitel. */
  missingHeadings: 'docx' | 'markdown' | 'text' | null;
}

export interface ImportResult {
  novelId: string;
  chapters: number;
  scenes: number;
  /** Szenen mit Zusammenfassung bzw. mit Prosa. */
  summaries: number;
  proseScenes: number;
  codex: number;
  /** Beim Import in eine Serie: Kodex-Einträge, die die Serie schon gleich hatte (nicht neu angelegt). */
  codexExisting?: number;
  snippets: number;
  chats: number;
  /** Bandnummer, wenn an eine Serie angehängt. */
  volumeNumber: number | null;
  warnings: string[];
}

// ---------------------------------------------------------------- Prompts

export type PromptType =
  | 'scene-beat-completion'
  | 'continue-writing'
  | 'text-replacement'
  | 'summary'
  | 'workshop-chat'
  | 'component'
  | (string & {});

export const PROMPT_TYPES: { value: PromptType; label: string }[] = [
  { value: 'scene-beat-completion', label: N_('Beat → prose') },
  { value: 'continue-writing', label: N_('Continue writing') },
  { value: 'text-replacement', label: N_('Edit text') },
  { value: 'summary', label: N_('Summary') },
  { value: 'workshop-chat', label: N_('Chat') },
  { value: 'component', label: N_('Component') },
];

/** Anzeigename eines Prompt-Typs in der eingestellten Sprache. */
export const promptTypeLabel = (type: string): string => {
  const x = PROMPT_TYPES.find((p) => p.value === type);
  return x ? t(x.label) : type;
};

export type MessageRole = 'system' | 'user' | 'assistant';

export interface PromptMessage {
  type: MessageRole;
  text: string;
  format?: string;
}

export type InputKind = 'dropdown' | 'text' | 'act' | 'chapter' | 'scene' | 'snippet' | 'codex' | 'fullNovel';
export const REFERENCE_INPUT_KINDS: InputKind[] = ['act', 'chapter', 'scene', 'snippet', 'codex', 'fullNovel'];

/** Eingabefeld eines Prompts (JSON-Format, kompatibel zum Novelcrafter-Import). */
export interface PromptInput {
  name: string;
  description?: string;
  required?: boolean;
  mode?: 'single' | 'multiple';
  types: InputKind[];
  default?: { type: string; id?: string; value?: string }[];
  settings?: {
    dropdown?: { options: string[] };
    text?: { placeholder?: string; default?: string };
    scene?: { mode?: 'full' | 'summary' };
    chapter?: { mode?: 'full' | 'summary' };
    act?: { mode?: 'full' | 'summary' };
    fullNovel?: { mode?: 'full' | 'summary' };
    [k: string]: unknown;
  };
  addToContext?: boolean;
  hideInput?: boolean;
  displayName?: string;
}

export type PromptOrigin = 'builtin' | 'imported' | 'custom';

export interface Prompt {
  id: string;
  type: PromptType;
  name: string;
  description: string;
  messages: PromptMessage[];
  inputs: PromptInput[];
  origin: PromptOrigin;
  builtinKey: string | null;
  /** Baustein-Prompt (eigenes Format); messages/inputs werden daraus erzeugt. null = Experten-Prompt (Skript-Syntax, z. B. importiert). */
  blocks: BlockPromptSpec | null;
  /**
   * Sprache dieser Fassung. Jeder Prompt wird je Sprache getrennt gespeichert (Name, Beschreibung, Inhalt);
   * fehlt die gewünschte Sprache, kommt die Ausgangsfassung (dann ist lang ≠ angefragte Sprache).
   */
  lang: Lang;
  /** Sprachen, in denen eine eigene Fassung gespeichert ist */
  langs: Lang[];
  createdAt: string;
  updatedAt: string;
}

/** Wert eines Eingabefelds: Text oder eine Liste von Verweisen. */
export type RefKind = 'act' | 'chapter' | 'scene' | 'snippet' | 'codex' | 'fullNovel' | 'text';
export interface RefValue {
  type: RefKind;
  id?: string;
  mode?: 'full' | 'summary';
  /** Bei type "text": spontan eingetippter Text */
  text?: string;
  /** Anzeigename (nur UI) */
  label?: string;
}
export type InputValue = string | RefValue[];
export type InputValues = Record<string, InputValue>;

// ---------------------------------------------------------------- LLM

export type ProviderKind = 'openrouter' | 'ollama' | 'lmstudio' | 'koboldcpp' | 'custom';

export interface ProviderModel {
  id: string;
  name?: string;
  contextLength?: number;
  /** Preis pro Token in USD */
  pricing?: { prompt: number; completion: number };
}

export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  models: ProviderModel[];
  modelsFetchedAt: string | null;
  createdAt: string;
}

export const PROVIDER_TEMPLATES: { kind: ProviderKind; name: string; baseUrl: string }[] = [
  { kind: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { kind: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { kind: 'lmstudio', name: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
  { kind: 'koboldcpp', name: 'KoboldCpp', baseUrl: 'http://localhost:5001/v1' },
  { kind: 'custom', name: N_('Custom server'), baseUrl: 'http://localhost:8080/v1' },
];

export interface ModelRef {
  providerId: string;
  modelId: string;
}

export interface CollectionModel extends ModelRef {
  name: string;
  /** Standard-Parameter (temperature, top_p, max_tokens, …), werden in den Request übernommen */
  params?: Record<string, unknown>;
}

export interface ModelCollection {
  id: string;
  name: string;
  models: CollectionModel[];
  sortOrder: number;
}

export interface ChatMessageData {
  role: MessageRole;
  content: string;
}

export interface RenderedMessage {
  role: MessageRole;
  content: string;
}

export interface ChatThread {
  id: string;
  novelId: string;
  title: string;
  promptId: string | null;
  model: ModelRef | null;
  context: RefValue[];
  inputs: InputValues;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  model: string | null;
  logId: string | null;
}

export interface GenerationLog {
  id: string;
  createdAt: string;
  novelId: string | null;
  promptId: string | null;
  promptName: string;
  kind: string;
  providerId: string | null;
  modelId: string;
  messages: RenderedMessage[];
  params: Record<string, unknown>;
  response: string;
  promptTokens: number | null;
  completionTokens: number | null;
  cost: number | null;
  durationMs: number | null;
  status: 'ok' | 'error' | 'aborted' | 'running';
  error: string | null;
}

export interface AppSettings {
  /** Sprache der Oberfläche und der Prompts (Standard beim ersten Start: Englisch) */
  language: Lang;
  theme: 'light' | 'dark' | 'system';
  defaultCollectionId: string | null;
  /** max_tokens aus der Eingabe "Words" ableiten */
  deriveMaxTokens: boolean;
  maxTokensFactor: number;
  maxTokensBuffer: number;
  backupsToKeep: number;
  editorFontSize: number;
  editorWidth: number;
  /** Export/Kopieren: Szenen als Überschriften (Gliederung) statt mit „* * *“ getrennt */
  exportSceneHeadings: boolean;
  /** zuletzt genutzte Auswahl pro Werkzeug */
  lastSelections: Record<string, { promptId?: string; model?: ModelRef; inputs?: InputValues }>;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  language: DEFAULT_LANG,
  theme: 'system',
  defaultCollectionId: null,
  deriveMaxTokens: true,
  maxTokensFactor: 2,
  maxTokensBuffer: 300,
  backupsToKeep: 10,
  editorFontSize: 18,
  editorWidth: 720,
  exportSceneHeadings: true,
  lastSelections: {},
};

/** Anfrage für eine Generierung bzw. Vorschau. */
export interface GenerateRequest {
  kind: 'beat' | 'continue' | 'rewrite' | 'chat' | 'summary' | 'preview';
  promptId?: string;
  /** Ungespeicherter Prompt (Werkstatt-Vorschau) */
  prompt?: Pick<Prompt, 'type' | 'name' | 'messages' | 'inputs'>;
  /** Sprache des Prompts und der eingebundenen Komponenten (Standard: eingestellte Sprache) */
  lang?: Lang;
  model?: ModelRef;
  params?: Record<string, unknown>;
  novelId: string;
  sceneId?: string | null;
  message?: string;
  textBefore?: string;
  textAfter?: string;
  selection?: string;
  /** Ungespeicherter Szenentext */
  sceneText?: string;
  inputs?: InputValues;
  pinnedCodexIds?: string[];
  chatThreadId?: string;
  chatHistory?: ChatMessageData[];
}

export interface RenderWarning {
  level: 'error' | 'warning' | 'info';
  message: string;
}

export interface CodexContextItem {
  id: string;
  name: string;
  type: CodexType;
  reason: 'always' | 'pov' | 'pinned' | 'mentioned' | 'previous-scene' | 'recursive';
  tokens: number;
  included: boolean;
}

export interface PreviewResult {
  messages: RenderedMessage[];
  warnings: RenderWarning[];
  tokens: number;
  codex: CodexContextItem[];
  /** nur wenn ein Modell angegeben ist */
  estimate?: CostEstimate;
}

/** Grobe Schätzung von Tokens und Kosten vor dem Generieren. */
export interface CostEstimate {
  promptTokens: number;
  /** erwartete Länge der Antwort; null = unbekannt */
  completionTokens: number | null;
  /** Woraus die erwartete Antwortlänge abgeleitet ist */
  completionBasis: 'words' | 'length' | 'selection' | 'max_tokens' | null;
  /** Wert aus „Wörter“ bzw. „Länge“ */
  words: number | null;
  /** Obergrenze aus max_tokens; null = keine gesetzt */
  maxCompletionTokens: number | null;
  /** USD pro Token; null = unbekannt */
  pricing: { prompt: number; completion: number } | null;
  /** lokaler Server (Ollama, LM Studio, …) – kostenlos */
  local: boolean;
  promptCost: number | null;
  /** Eingabe + erwartete Ausgabe; null = Preis oder Antwortlänge unbekannt */
  cost: number | null;
  /** Eingabe + max_tokens */
  maxCost: number | null;
  contextLength: number | null;
}

export interface EstimateResult extends CostEstimate {
  warnings: RenderWarning[];
}

export interface JobInfo {
  id: string;
  type: string;
  title: string;
  novelId: string | null;
  status: 'pending' | 'running' | 'done' | 'error' | 'cancelled';
  progress: { done: number; total: number };
  step: string;
  log: string[];
  cost: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

// ---------------------------------------------------------------- ProseMirror JSON

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
}
export interface PMDoc extends PMNode {
  type: 'doc';
  content: PMNode[];
}
