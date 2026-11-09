// Erkennt Kodex-Erwähnungen in Texten.
// - Wortgrenzen per \p{L}/\p{N} (Umlaute, ß)
// - optionale Endungen (Genitiv-s, -n, -es, -ns, Apostroph)
// - Groß-/Kleinschreibung pro Eintrag
import type { CodexInclusion } from '../types';

export interface MatchableEntry {
  id: string;
  name: string;
  aliases: string[];
  caseSensitive: boolean;
  inclusion: CodexInclusion;
}

export interface Mention {
  entryId: string;
  start: number;
  end: number;
  text: string;
}

const SUFFIX = "(?:['’]s|es|ns|en|s|n|['’])?";
const BEFORE = '(?<![\\p{L}\\p{N}_])';
const AFTER = '(?![\\p{L}\\p{N}_])';

function escapeTerm(term: string): string {
  return term
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}

function normalizeSpace(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

interface TermGroup {
  regex: RegExp | null;
  map: Map<string, string[]>;
  caseSensitive: boolean;
}

export interface MatcherOptions {
  /** Einträge mit Einbindung „nie“ trotzdem erkennen (Standard: nein). */
  includeNever?: boolean;
  /** Mindestlänge eines Namens/Alias */
  minLength?: number;
}

export class CodexMatcher {
  private groups: TermGroup[] = [];
  readonly entryCount: number;

  constructor(entries: MatchableEntry[], opts: MatcherOptions = {}) {
    const minLength = opts.minLength ?? 2;
    const ci = new Map<string, string[]>();
    const cs = new Map<string, string[]>();
    let count = 0;
    for (const e of entries) {
      if (e.inclusion === 'never' && !opts.includeNever) continue;
      count++;
      const terms = new Set([e.name, ...(e.aliases ?? [])].map((t) => normalizeSpace(t ?? '')).filter((t) => t.length >= minLength));
      for (const term of terms) {
        const key = e.caseSensitive ? term : term.toLocaleLowerCase();
        const target = e.caseSensitive ? cs : ci;
        const list = target.get(key) ?? [];
        if (!list.includes(e.id)) list.push(e.id);
        target.set(key, list);
      }
    }
    this.entryCount = count;
    this.groups = [
      { map: ci, caseSensitive: false, regex: null },
      { map: cs, caseSensitive: true, regex: null },
    ];
    for (const g of this.groups) {
      if (!g.map.size) continue;
      const alts = [...g.map.keys()].sort((a, b) => b.length - a.length).map(escapeTerm);
      g.regex = new RegExp(`${BEFORE}(${alts.join('|')})${SUFFIX}${AFTER}`, g.caseSensitive ? 'gu' : 'giu');
    }
  }

  findMentions(text: string): Mention[] {
    if (!text) return [];
    const found: Mention[] = [];
    for (const g of this.groups) {
      if (!g.regex) continue;
      g.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = g.regex.exec(text))) {
        const core = normalizeSpace(m[1]);
        const key = g.caseSensitive ? core : core.toLocaleLowerCase();
        const ids = g.map.get(key);
        if (ids) {
          for (const id of ids) found.push({ entryId: id, start: m.index, end: m.index + m[0].length, text: m[0] });
        }
        if (m[0].length === 0) g.regex.lastIndex++;
      }
    }
    if (found.length < 2) return found;
    // Überlappungen entfernen: längere Treffer gewinnen
    found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    const out: Mention[] = [];
    let lastEnd = -1;
    let lastStart = -1;
    for (const f of found) {
      if (f.start === lastStart && out.length && out[out.length - 1].end === f.end) {
        out.push(f); // gleicher Treffer, anderer Eintrag (gleicher Alias)
        continue;
      }
      if (f.start < lastEnd) continue;
      out.push(f);
      lastEnd = f.end;
      lastStart = f.start;
    }
    return out;
  }

  mentionedIds(text: string): Set<string> {
    return new Set(this.findMentions(text).map((m) => m.entryId));
  }

  /** Zählt Erwähnungen je Eintrag. */
  countMentions(text: string): Map<string, number> {
    const counts = new Map<string, number>();
    for (const m of this.findMentions(text)) counts.set(m.entryId, (counts.get(m.entryId) ?? 0) + 1);
    return counts;
  }
}
