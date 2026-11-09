// Hilfsfunktionen für ProseMirror-JSON (Szeneninhalt).
import { t } from './i18n';
import type { PMDoc, PMNode } from './types';

export const BEAT_NODE = 'beat';
export const NOTE_NODE = 'hiddenNote';
/** Rahmen um Absätze (z. B. zwischengespeicherte KI-Varianten); `excluded` = nicht an die KI, nicht in Wortzahl und Export */
export const FRAME_NODE = 'frame';

export function isExcludedFrame(node: PMNode): boolean {
  return node.type === FRAME_NODE && node.attrs?.excluded !== false;
}

export function emptyDoc(): PMDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

export function isDoc(x: unknown): x is PMDoc {
  return !!x && typeof x === 'object' && (x as PMDoc).type === 'doc';
}

function inlineText(node: PMNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (!node.content) return '';
  return node.content.map(inlineText).join('');
}

export interface PlainTextOptions {
  includeBeats?: boolean;
  includeNotes?: boolean;
  /** auch Text aus ausgeblendeten Rahmen */
  includeExcludedFrames?: boolean;
}

/** Klartext eines Blocks (rekursiv). Absätze werden durch Leerzeile getrennt. */
function blockTexts(node: PMNode, opts: PlainTextOptions, out: string[]) {
  switch (node.type) {
    case BEAT_NODE:
      if (opts.includeBeats) out.push(inlineText(node));
      return;
    case NOTE_NODE:
      if (opts.includeNotes) out.push(inlineText(node));
      return;
    case FRAME_NODE:
      if (isExcludedFrame(node) && !opts.includeExcludedFrames) return;
      for (const c of node.content ?? []) blockTexts(c, opts, out);
      return;
    case 'paragraph':
    case 'heading':
      out.push(inlineText(node));
      return;
    case 'horizontalRule':
      out.push('* * *');
      return;
    case 'bulletList':
    case 'orderedList':
    case 'listItem':
    case 'blockquote':
    case 'doc':
      for (const c of node.content ?? []) blockTexts(c, opts, out);
      return;
    default:
      if (node.content) for (const c of node.content) blockTexts(c, opts, out);
      else if (node.text) out.push(node.text);
  }
}

export function nodesToPlainText(nodes: PMNode[], opts: PlainTextOptions = {}): string {
  const out: string[] = [];
  for (const n of nodes) blockTexts(n, opts, out);
  return out
    .map((s) => s.replace(/\s+$/g, ''))
    .filter((s, i, arr) => !(s === '' && (i === 0 || arr[i - 1] === '')))
    .join('\n\n')
    .trim();
}

export function docToPlainText(doc: PMDoc | null | undefined, opts: PlainTextOptions = {}): string {
  if (!doc || !Array.isArray(doc.content)) return '';
  return nodesToPlainText(doc.content, opts);
}

const WORD_RE = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

export function countWords(text: string): number {
  if (!text) return 0;
  let n = 0;
  WORD_RE.lastIndex = 0;
  while (WORD_RE.exec(text)) n++;
  return n;
}

export function firstWords(text: string, n: number): string {
  if (!text || n <= 0) return '';
  const re = new RegExp(WORD_RE.source, 'gu');
  let m: RegExpExecArray | null;
  let count = 0;
  let end = 0;
  while ((m = re.exec(text))) {
    count++;
    end = m.index + m[0].length;
    if (count >= n) break;
  }
  if (count < n) return text;
  // bis zum Satzzeichen direkt nach dem letzten Wort mitnehmen
  const rest = text.slice(end).match(/^[^\s\p{L}\p{N}]*/u);
  return text.slice(0, end + (rest ? rest[0].length : 0));
}

export function lastWords(text: string, n: number): string {
  if (!text || n <= 0) return '';
  const re = new RegExp(WORD_RE.source, 'gu');
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) starts.push(m.index);
  if (starts.length <= n) return text;
  let start = starts[starts.length - n];
  // Anführungszeichen o. Ä. direkt vor dem ersten Wort mitnehmen
  while (start > 0 && /[»«„“"'‚‘(\[]/u.test(text[start - 1])) start--;
  return text.slice(start);
}

/** Klartext → Doc. Jede Zeile wird ein Absatz, Leerzeilen trennen ebenfalls. */
export function textToNodes(text: string): PMNode[] {
  const lines = text.replace(/\r\n?/g, '\n').split(/\n+/);
  const nodes: PMNode[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(\*\s*){3,}$|^-{3,}$|^#\s*#\s*#$/.test(line)) {
      nodes.push({ type: 'horizontalRule' });
      continue;
    }
    nodes.push({ type: 'paragraph', content: inlineMarkdown(line) });
  }
  return nodes;
}

export function textToDoc(text: string): PMDoc {
  const content = textToNodes(text);
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

/** Sehr einfache Inline-Auszeichnung (**fett**, *kursiv*) aus KI-Antworten übernehmen. */
export function inlineMarkdown(line: string): PMNode[] {
  const out: PMNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ type: 'text', text: line.slice(last, m.index) });
    if (m[2]) out.push({ type: 'text', text: m[2], marks: [{ type: 'bold' }] });
    else out.push({ type: 'text', text: m[3] ?? m[4], marks: [{ type: 'italic' }] });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ type: 'text', text: line.slice(last) });
  return out.filter((n) => n.text);
}

let idCounter = 0;
export function makeId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  idCounter++;
  return `id-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function beatNode(text: string): PMNode {
  return {
    type: BEAT_NODE,
    attrs: { id: makeId() },
    content: text ? [{ type: 'text', text }] : [],
  };
}

/**
 * Nummerierte Liste (z. B. Chat-Antwort) → Beat-Blöcke.
 * Folgezeilen ohne Nummer werden an den vorherigen Beat angehängt.
 */
export function beatsFromText(text: string): PMNode[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const items: string[] = [];
  const numbered = /^\s*(?:\*\*)?(\d{1,3})[.):](?:\*\*)?\s+(.*)$/;
  const bullet = /^\s*[-*•]\s+(.*)$/;
  const hasNumbered = lines.some((l) => numbered.test(l));
  for (const line of lines) {
    const m = hasNumbered ? line.match(numbered) : line.match(bullet);
    if (m) {
      items.push(hasNumbered ? `${m[1]}. ${m[2].trim()}` : m[1].trim());
    } else if (line.trim() && items.length) {
      items[items.length - 1] += ' ' + line.trim();
    }
  }
  if (!items.length) {
    for (const para of text.split(/\n\s*\n/)) if (para.trim()) items.push(para.trim().replace(/\s*\n\s*/g, ' '));
  }
  return items.map((s) => beatNode(s.replace(/\*\*/g, '')));
}

// ---------------------------------------------------------------- HTML / Markdown

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineHtml(nodes: PMNode[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '<br>';
      if (n.type !== 'text') return inlineHtml(n.content);
      let s = esc(n.text ?? '');
      for (const mk of n.marks ?? []) {
        if (mk.type === 'bold') s = `<strong>${s}</strong>`;
        else if (mk.type === 'italic') s = `<em>${s}</em>`;
        else if (mk.type === 'strike') s = `<s>${s}</s>`;
        else if (mk.type === 'underline') s = `<u>${s}</u>`;
        else if (mk.type === 'code') s = `<code>${s}</code>`;
      }
      return s;
    })
    .join('');
}

export interface HtmlOptions {
  /** reines Manuskript (z. B. zum Kopieren): ohne Beats, Notizen und ausgeblendete Rahmen, Rahmen ohne Kasten */
  manuscript?: boolean;
}

/** Statisches HTML (für das Manuskript, ohne Editor). Klassen entsprechen dem Editor. */
export function nodesToHtml(nodes: PMNode[] | undefined, opts: HtmlOptions = {}): string {
  if (!nodes) return '';
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'paragraph':
          return `<p>${inlineHtml(n.content) || '<br>'}</p>`;
        case 'heading': {
          const l = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 2)));
          return `<h${l}>${inlineHtml(n.content)}</h${l}>`;
        }
        case 'blockquote':
          return `<blockquote>${nodesToHtml(n.content, opts)}</blockquote>`;
        case 'bulletList':
          return `<ul>${nodesToHtml(n.content, opts)}</ul>`;
        case 'orderedList':
          return `<ol>${nodesToHtml(n.content, opts)}</ol>`;
        case 'listItem':
          return `<li>${nodesToHtml(n.content, opts)}</li>`;
        case 'horizontalRule':
          return '<hr>';
        case BEAT_NODE:
          if (opts.manuscript) return '';
          return `<div class="beat-static"><span class="beat-static-label">${esc(t('Beat'))}</span>${inlineHtml(n.content)}</div>`;
        case NOTE_NODE:
          if (opts.manuscript) return '';
          return `<div class="note-static">${inlineHtml(n.content)}</div>`;
        case FRAME_NODE: {
          if (opts.manuscript) return isExcludedFrame(n) ? '' : nodesToHtml(n.content, opts);
          const cls = `frame-static${isExcludedFrame(n) ? ' frame-static-excluded' : ''}`;
          const title = `<div class="frame-static-title">${esc(String(n.attrs?.title || t('Frame')))}</div>`;
          return `<div class="${cls}">${title}${n.attrs?.collapsed ? '' : nodesToHtml(n.content)}</div>`;
        }
        default:
          return n.content ? nodesToHtml(n.content, opts) : '';
      }
    })
    .join('');
}

export function docToHtml(doc: PMDoc | null | undefined): string {
  return doc ? nodesToHtml(doc.content) : '';
}

function inlineMd(nodes: PMNode[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '  \n';
      if (n.type !== 'text') return inlineMd(n.content);
      let s = n.text ?? '';
      const marks = (n.marks ?? []).map((m) => m.type);
      if (marks.includes('italic')) s = `*${s}*`;
      if (marks.includes('bold')) s = `**${s}**`;
      if (marks.includes('strike')) s = `~~${s}~~`;
      return s;
    })
    .join('');
}

export function nodesToMarkdown(nodes: PMNode[] | undefined, depth = 0): string {
  if (!nodes) return '';
  const parts: string[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case 'paragraph':
        parts.push(inlineMd(n.content));
        break;
      case 'heading':
        parts.push('#'.repeat(Math.min(6, Number(n.attrs?.level ?? 2) + 3)) + ' ' + inlineMd(n.content));
        break;
      case 'blockquote':
        parts.push(
          nodesToMarkdown(n.content, depth)
            .split('\n')
            .map((l) => '> ' + l)
            .join('\n'),
        );
        break;
      case 'bulletList':
      case 'orderedList':
        parts.push(
          (n.content ?? [])
            .map((li, i) => (n.type === 'orderedList' ? `${i + 1}. ` : '- ') + nodesToMarkdown(li.content, depth + 1).replace(/\n\n/g, '\n'))
            .join('\n'),
        );
        break;
      case 'horizontalRule':
        parts.push('* * *');
        break;
      case BEAT_NODE:
      case NOTE_NODE:
        break; // nicht Teil des Manuskripts
      case FRAME_NODE:
        if (!isExcludedFrame(n)) parts.push(nodesToMarkdown(n.content, depth));
        break;
      default:
        if (n.content) parts.push(nodesToMarkdown(n.content, depth));
    }
  }
  return parts.filter((p) => p !== '').join('\n\n');
}

export function docToMarkdown(doc: PMDoc | null | undefined): string {
  return doc ? nodesToMarkdown(doc.content) : '';
}

/** Rahmen-Block mit Absätzen aus Klartext. */
export function frameNode(text: string, title: string, excluded = true): PMNode {
  const content = textToNodes(text);
  return { type: FRAME_NODE, attrs: { title, excluded, collapsed: false }, content: content.length ? content : [{ type: 'paragraph' }] };
}

/** Alle Beats eines Dokuments mit Index. */
export function findBeats(doc: PMDoc): { index: number; id: string; text: string }[] {
  const out: { index: number; id: string; text: string }[] = [];
  doc.content.forEach((n, i) => {
    if (n.type === BEAT_NODE) out.push({ index: i, id: String(n.attrs?.id ?? ''), text: inlineText(n) });
  });
  return out;
}

export function nodeText(node: PMNode): string {
  return inlineText(node);
}
