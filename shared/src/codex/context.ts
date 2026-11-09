// Auswahl der Kodex-Einträge für codex.context:
// Priorität immer > POV > angeheftet > in dieser Szene erwähnt > Rest (vorherige Szene, rekursiv).
import type { CodexContextItem, CodexEntry } from '../types';
import { estimateTokens } from '../tokens';
import { CodexMatcher } from './matcher';

export interface CodexSelectInput {
  entries: CodexEntry[];
  /** Aktuelle Szene, Beat, Markierung, Chatnachricht … */
  currentTexts: string[];
  /** Vorherige Szene (optional) */
  previousTexts?: string[];
  pinnedIds?: string[];
  povCharacterId?: string | null;
  recursive?: boolean;
  /** Token-Budget, 0 oder undefined = unbegrenzt */
  budget?: number;
  /** Für die Token-Zählung */
  formatEntry: (e: CodexEntry) => string;
  matcher?: CodexMatcher;
}

export interface CodexSelection {
  items: CodexContextItem[];
  included: CodexEntry[];
  /** IDs der Einträge, die nur per Erwähnung im Text erkannt wurden */
  mentionedIds: Set<string>;
}

const normName = (s: string) => s.trim().toLocaleLowerCase();

/**
 * In einer Serie ersetzt ein Band-Eintrag den gleichnamigen Serien-Eintrag („Band-Fassung“) –
 * sonst fänden Erwähnungen beide und beide gingen an die KI.
 * `redirect` leitet Verweise (POV, Anheftungen, Kontextauswahl) vom Serien- auf den Band-Eintrag um.
 */
export function effectiveCodex<T extends Pick<CodexEntry, 'id' | 'name' | 'novelId'>>(entries: T[]): { entries: T[]; redirect: Map<string, string> } {
  const band = new Map<string, string>();
  for (const e of entries) if (e.novelId) band.set(normName(e.name), e.id);
  const redirect = new Map<string, string>();
  if (!band.size) return { entries, redirect };
  const kept = entries.filter((e) => {
    const b = !e.novelId ? band.get(normName(e.name)) : undefined;
    if (b) redirect.set(e.id, b);
    return !b;
  });
  return { entries: kept, redirect };
}

const PRIORITY: Record<CodexContextItem['reason'], number> = {
  always: 0,
  pov: 1,
  pinned: 2,
  mentioned: 3,
  'previous-scene': 4,
  recursive: 5,
};

export function selectCodexEntries(input: CodexSelectInput): CodexSelection {
  const byId = new Map(input.entries.map((e) => [e.id, e]));
  const matcher = input.matcher ?? new CodexMatcher(input.entries);
  const reasons = new Map<string, CodexContextItem['reason']>();
  const add = (id: string | null | undefined, reason: CodexContextItem['reason']) => {
    if (!id || !byId.has(id)) return;
    const prev = reasons.get(id);
    if (!prev || PRIORITY[reason] < PRIORITY[prev]) reasons.set(id, reason);
  };

  for (const e of input.entries) if (e.inclusion === 'always') add(e.id, 'always');
  add(input.povCharacterId, 'pov');
  for (const id of input.pinnedIds ?? []) add(id, 'pinned');

  const mentionedIds = new Set<string>();
  for (const t of input.currentTexts) {
    for (const id of matcher.mentionedIds(t)) {
      mentionedIds.add(id);
      add(id, 'mentioned');
    }
  }
  for (const t of input.previousTexts ?? []) {
    for (const id of matcher.mentionedIds(t)) add(id, 'previous-scene');
  }
  if (input.recursive) {
    for (const id of [...reasons.keys()]) {
      const e = byId.get(id)!;
      for (const other of matcher.mentionedIds(e.description)) {
        if (other !== id) add(other, 'recursive');
      }
    }
  }

  const ordered = [...reasons.entries()]
    .map(([id, reason]) => ({ entry: byId.get(id)!, reason }))
    .sort(
      (a, b) =>
        PRIORITY[a.reason] - PRIORITY[b.reason] ||
        a.entry.type.localeCompare(b.entry.type) ||
        a.entry.name.localeCompare(b.entry.name, 'de'),
    );

  const budget = input.budget && input.budget > 0 ? input.budget : Infinity;
  let used = 0;
  const items: CodexContextItem[] = [];
  const included: CodexEntry[] = [];
  for (const { entry, reason } of ordered) {
    const tokens = estimateTokens(input.formatEntry(entry));
    const fits = used + tokens <= budget || reason === 'always';
    if (fits) {
      used += tokens;
      included.push(entry);
    }
    items.push({ id: entry.id, name: entry.name, type: entry.type, reason, tokens, included: fits });
  }
  return { items, included, mentionedIds };
}
