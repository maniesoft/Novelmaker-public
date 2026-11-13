// Import von Manuskripten.
//
// Einfaches Format (Standard):
//  - Word (docx), Markdown (.md) oder Text (.txt): alles ist Prosa. Überschriften gliedern in Akte/Kapitel/Szenen,
//    "* * *" und ähnliche Trenner beginnen eine neue Szene.
//  - Zip: Manuskript-Dateien (docx/md/txt; mehrere Dateien = je ein Kapitel), Ordner "Kontext" (je Datei ein
//    Kodex-Eintrag, Unterordner wie "Figuren" oder "Orte" setzen den Typ) und "Snippets"/"Notizen" (je Datei ein Snippet).
//
// Novelcrafter-Export (Format "novelcrafter"):
//  - docx: Absatz mit Formatvorlage "Title" = Romantitel, Heading1/2/3 = Akt/Kapitel/Szene ("Act 1", "Chapter 1", "Scene 1").
//    Ohne Szenen-Überschriften werden Szenen durch "* * *" getrennt. Sind Zusammenfassungen mit exportiert, steht pro
//    Szene erst die Zusammenfassung, dann ein leerer Absatz mit Unterrand (sieht aus wie "____"), dann die Prosa.
//    Szenen ohne Prosa haben keine Linie.
//  - Zip: novel.docx + Kodex-Ordner (characters/…/entry.md + metadata.json) + snippets/ + chats/.
import JSZip from 'jszip';
import mammoth from 'mammoth';
import {
  t,
  type CodexField,
  type CodexInclusion,
  type CodexType,
  type ImportFormat,
  type ImportOptions,
  type ImportPreview,
  type ImportResult,
  type PMNode,
  type UnseparatedMode,
} from '@novelmaker/shared';
import { HttpError, newId, type DB } from '../db';
import { createCodex, createRelation, rowToCodex, sameCodexContent } from '../repo/codex';
import { createAct, createChapter, createNovel, createScene } from '../repo/novels';
import { findPromptByKey } from '../repo/prompts';

// ---------------------------------------------------------------- HTML-Hilfen

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function htmlInline(html: string): PMNode[] {
  const out: PMNode[] = [];
  const marks: string[] = [];
  const re = /<(\/?)(strong|b|em|i|s|del|br)\b[^>]*>|<[^>]+>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[3] != null) {
      const text = decodeEntities(m[3]);
      if (text) out.push({ type: 'text', text, ...(marks.length ? { marks: [...new Set(marks)].map((t) => ({ type: t })) } : {}) });
      continue;
    }
    const tag = (m[2] ?? '').toLowerCase();
    if (!tag) continue;
    if (tag === 'br') {
      out.push({ type: 'hardBreak' });
      continue;
    }
    const mark = tag === 'strong' || tag === 'b' ? 'bold' : tag === 'em' || tag === 'i' ? 'italic' : 'strike';
    if (m[1]) {
      const i = marks.lastIndexOf(mark);
      if (i >= 0) marks.splice(i, 1);
    } else marks.push(mark);
  }
  return out;
}

function htmlPlain(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// ---------------------------------------------------------------- Blöcke

const SEP_MARK = '⟦NM-SUMMARY-SEPARATOR⟧';
const SCENE_BREAK = /^\s*(\*\s*){3,}\s*$|^\s*#\s*$|^\s*(~\s*){3,}\s*$|^\s*-{3,}\s*$/;
const UNDERSCORE_LINE = /^\s*_{3,}\s*$/;

interface DocBlock {
  kind: 'title' | 'heading' | 'para' | 'break' | 'sep';
  level: number;
  listItem: boolean;
  html: string;
  plain: string;
  /** Eintrag eines Word-Inhaltsverzeichnisses */
  toc?: boolean;
}

interface DocContent {
  blocks: DocBlock[];
  title: string;
  author: string;
  separatorLines: number;
  warnings: string[];
}

// ---------------------------------------------------------------- docx lesen

function xmlText(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`).exec(xml);
  return m ? decodeEntities(m[1]).trim() : '';
}

// Eigene Formatvorlagen mit Gliederungsebene (z. B. „Kapiteltitel“) und Absätze mit direkt eingestellter
// Gliederungsebene kennt mammoth nicht als Überschrift, Verzeichnis-Einträge nicht als solche. Diese Absätze
// bekommen vor dem Umwandeln eine dieser Formatvorlagen, die die Style-Map auf h1–h6 bzw. p.nm-toc abbildet.
const OUTLINE_STYLE = 'NMOutline';
const TOC_STYLE = 'NMToc';
const DOCX_STYLE_MAP = [
  "p[style-name='Title'] => h1.nm-title:fresh",
  "p[style-name='Titel'] => h1.nm-title:fresh",
  ...[1, 2, 3, 4, 5, 6].map((l) => `p.${OUTLINE_STYLE}${l} => h${l}:fresh`),
  `p.${TOC_STYLE} => p.nm-toc:fresh`,
];

interface DocxStyles {
  /** Style-ID → Name und Gliederungsebene (0 = Ebene 1 … 8, 9 = Textkörper; über basedOn geerbt) */
  byId: Map<string, { name: string; outline: number | null }>;
  /** Formatvorlage für Absätze ohne eigene (meist „Normal“) */
  defaultId: string;
}

function readDocxStyles(xml: string): DocxStyles {
  const raw = new Map<string, { name: string; basedOn: string; outline: number | null }>();
  let defaultId = '';
  for (const m of xml.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
    const attr = (name: string) => new RegExp(`\\bw:${name}="([^"]*)"`).exec(m[1])?.[1] ?? '';
    if (m[1].endsWith('/') || attr('type') !== 'paragraph') continue;
    const val = (tag: string) => new RegExp(`<w:${tag}\\b[^>]*\\bw:val="([^"]*)"`).exec(m[2])?.[1];
    const id = attr('styleId');
    const outline = val('outlineLvl');
    raw.set(id, { name: decodeEntities(val('name') ?? id), basedOn: val('basedOn') ?? '', outline: outline == null ? null : Number(outline) });
    if (/^(1|true|on)$/i.test(attr('default'))) defaultId = id;
  }
  const outlineOf = (id: string, seen: Set<string>): number | null => {
    const s = raw.get(id);
    if (!s || seen.has(id)) return null;
    seen.add(id);
    return s.outline ?? (s.basedOn ? outlineOf(s.basedOn, seen) : null);
  };
  const byId = new Map([...raw].map(([id, s]) => [id, { name: s.name, outline: outlineOf(id, new Set()) }] as const));
  return { byId, defaultId };
}

/** Teilt einen Absatz (<w:p>…</w:p>) in Start-Tag, eigene Absatzeigenschaften (ohne frühere Fassung aus der
 *  Änderungsverfolgung) und den Rest. */
function splitParagraph(p: string): { open: string; pPr: string | null; rest: string } {
  const open = /^<w:p\b[^>]*>\s*/.exec(p)?.[0] ?? '';
  const rest = p.slice(open.length);
  if (/^<w:pPr\s*\/>/.test(rest)) return { open, pPr: '', rest };
  const m = /^<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(rest);
  return { open, pPr: m ? m[1].split('<w:pPrChange')[0] : null, rest };
}

function setParagraphStyle(p: string, styleId: string): string {
  const tag = `<w:pStyle w:val="${styleId}"/>`;
  const { open, pPr, rest } = splitParagraph(p);
  if (pPr == null) return `${open}<w:pPr>${tag}</w:pPr>${rest}`;
  if (/^<w:pPr\s*\/>/.test(rest)) return open + rest.replace(/^<w:pPr\s*\/>/, `<w:pPr>${tag}</w:pPr>`);
  // pStyle steht immer als erstes in den Absatzeigenschaften
  if (/<w:pStyle\b/.test(pPr)) return open + rest.replace(/<w:pStyle\b[^>]*\/>/, tag);
  return open + rest.replace(/^<w:pPr>/, `<w:pPr>${tag}`);
}

/** Formatvorlage, die mammoth für diesen Absatz sehen soll – oder null, wenn er bleibt, wie er ist. */
function docxParagraphStyle(p: string, styles: DocxStyles): string | null {
  const { pPr } = splitParagraph(p);
  const styleId = (pPr && /<w:pStyle\b[^>]*\bw:val="([^"]*)"/.exec(pPr)?.[1]) || styles.defaultId;
  const style = styles.byId.get(styleId);
  const name = (style?.name ?? '').trim().toLowerCase();
  if (/^toc \d$/.test(name)) return TOC_STYLE;
  // Überschrift 1–6 und Titel bildet mammoth bzw. die Style-Map schon ab
  if (/^(heading [1-6]|title|titel)$/.test(name)) return null;
  const direct = pPr ? /<w:outlineLvl\b[^>]*\bw:val="(\d+)"/.exec(pPr)?.[1] : undefined;
  const level = direct != null ? Number(direct) : (style?.outline ?? null);
  return level != null && level >= 0 && level <= 5 ? `${OUTLINE_STYLE}${level + 1}` : null;
}

/**
 * Word-Dokumente ganz ohne Überschriften: allein stehende Zeilen wie „Chapter 28: April Third“ oder „Teil 2“
 * gliedern wie in Text-Dateien (oft sind Kapiteltitel nur von Hand groß und fett gesetzt). Eine solche Zeile zählt
 * nur, wenn Text folgt, bevor die nächste gleichrangige oder höhere kommt – sonst ist sie Teil eines Inhaltsverzeichnisses.
 */
function chapterLinesAsHeadings(blocks: DocBlock[]): DocBlock[] {
  if (blocks.some((b) => b.kind === 'heading')) return blocks;
  const levels = blocks.map((b) => (b.kind === 'para' && !b.listItem && !b.toc ? txtHeadingLevel(b.plain) : 0));
  return blocks.map((b, i) => {
    const level = levels[i];
    if (!level) return b;
    for (let j = i + 1; j < blocks.length; j++) {
      if (levels[j]) {
        if (levels[j] <= level) return b;
        continue;
      }
      if (blocks[j].kind === 'para' && blocks[j].plain && !blocks[j].toc) return { ...b, kind: 'heading', level };
    }
    return b;
  });
}

async function readDocx(zip: JSZip): Promise<DocContent> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new HttpError(400, t('This isn’t a valid docx file (word/document.xml is missing).'));
  let xml = await docFile.async('string');
  const styles = readDocxStyles((await zip.file('word/styles.xml')?.async('string')) ?? '');
  // Leere Absätze mit Unterrand (waagerechte Linie; bei Novelcrafter die Grenze zwischen Zusammenfassung und Prosa)
  // lässt mammoth fallen – vorher durch einen Marker ersetzen.
  let separatorLines = 0;
  xml = xml.replace(/<w:p(?:\s[^>]*)?(?<!\/)>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, (p) => {
    if (/<w:pBdr>(?:(?!<\/w:pBdr>)[\s\S])*?<w:bottom\b/.test(p) && !/<w:t[\s>]/.test(p)) {
      separatorLines++;
      return `<w:p><w:r><w:t>${SEP_MARK}</w:t></w:r></w:p>`;
    }
    const style = docxParagraphStyle(p, styles);
    return style ? setParagraphStyle(p, style) : p;
  });
  zip.file('word/document.xml', xml);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const { value: html, messages } = await mammoth.convertToHtml({ buffer }, { styleMap: DOCX_STYLE_MAP });
  const warnings = [...new Set(messages.filter((x) => x.type === 'warning').map((x) => x.message))];

  const core = (await zip.file('docProps/core.xml')?.async('string')) ?? '';
  const metaTitle = xmlText(core, 'dc:title');
  const creator = xmlText(core, 'dc:creator');
  const author = /^(un-?named|unknown|novelmaker|author|autor|microsoft office user|python-docx)$/i.test(creator) ? '' : creator;

  const blocks: DocBlock[] = [];
  const re = /<(h[1-6]|p|li|blockquote)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    const inner = m[3];
    const plain = htmlPlain(inner);
    const level = tag.startsWith('h') ? Number(tag[1]) : 0;
    let kind: DocBlock['kind'] = level ? 'heading' : 'para';
    if (level && /class="[^"]*nm-title/.test(m[2])) kind = 'title';
    else if (plain === SEP_MARK || (!level && UNDERSCORE_LINE.test(plain))) kind = 'sep';
    else if (!level && SCENE_BREAK.test(plain)) kind = 'break';
    if (kind === 'para' && !plain && !/<br/i.test(inner)) continue;
    // Word-Verzeichnisse: Formatvorlage „Verzeichnis 1…9“ oder Links auf die Textmarken der Überschriften
    const toc = /class="[^"]*nm-toc/.test(m[2]) || /href="#_Toc/i.test(inner);
    blocks.push({ kind, level, listItem: tag === 'li', html: inner, plain: kind === 'sep' ? '' : plain, ...(toc ? { toc } : {}) });
  }
  const docTitle = blocks.find((b) => b.kind === 'title')?.plain ?? '';
  return { blocks: chapterLinesAsHeadings(blocks), title: docTitle || metaTitle, author, separatorLines, warnings };
}

/** Manuskript ohne jede Überschrift: alles landet in einem Kapitel (Hinweis im Import-Dialog). */
function lacksHeadings(doc: DocContent): boolean {
  return !doc.blocks.some((b) => b.kind === 'heading') && doc.blocks.some((b) => b.kind === 'para' && b.plain);
}

/** Sieht ein docx wie ein Novelcrafter-Export aus? (Linien unter Zusammenfassungen oder Titel + "Act/Chapter/Scene N") */
function docxLooksLikeNovelcrafter(doc: DocContent): boolean {
  if (doc.separatorLines > 0) return true;
  return doc.blocks.some((b) => b.kind === 'title') && doc.blocks.some((b) => b.kind === 'heading' && /^(act|chapter|scene)\s+\d+\b/i.test(b.plain));
}

// ---------------------------------------------------------------- Markdown und Text lesen

/** Text-Datei dekodieren: UTF-8, sonst Windows-1252 (ältere deutsche txt-Dateien). */
function decodeText(buf: Uint8Array): string {
  let s: string;
  try {
    s = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      s = new TextDecoder('latin1').decode(buf);
    } catch {
      s = Buffer.from(buf).toString('latin1');
    }
  }
  return s.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/** Inline-Markdown (**fett**, *kursiv*, _kursiv_, ~~durch~~) → HTML für htmlInline. */
export function mdInlineToHtml(src: string): string {
  const escaped: string[] = [];
  let s = src.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, (_m, c: string) => {
    escaped.push(c);
    return `${escaped.length - 1}`;
  });
  s = escapeHtml(s);
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__/g, (_m, a?: string, b?: string) => `<strong>${a ?? b}</strong>`);
  s = s.replace(/(^|[^*\p{L}\p{N}])\*(?=\S)([^*]*?\S)\*(?![*\p{L}\p{N}])/gu, '$1<em>$2</em>');
  s = s.replace(/(^|[^_\p{L}\p{N}])_(?=\S)([^_]*?\S)_(?![_\p{L}\p{N}])/gu, '$1<em>$2</em>');
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
  return s.replace(/(\d+)/g, (_m, i: string) => escapeHtml(escaped[Number(i)]));
}

const MD_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const MD_LIST = /^\s*(?:[-*+]|\d+[.)])\s+/;
// Gliederungswörter in allen Sprachen der App (de, en, fr, es, it, uk). So beschriftet auch Novelmakers eigener
// Export Akte, Kapitel und Szenen ohne Titel („Kapitel 3“, „Chapitre 3“, „Розділ 3“ …).
const ACT_WORD = '(?:akt|act|acte|acto|atto|акт|teil|part|partie|parte|частина|buch|book|livre|libro|книга)';
const CHAPTER_WORD = '(?:kapitel|chapter|chapitre|cap[ií]tulo|capitolo|розділ|глава)';
const SCENE_WORD = '(?:szene|sc[eè]ne|escena|scena|сцена)';
/** Kapitel ohne Nummer: Prolog, Epilog, Vor- und Nachwort */
const FRAME_WORD =
  '(?:prolog|prologue|pr[oó]logo|пролог|epilog|[eé]pilogue|ep[ií]logo|епілог|vorwort|nachwort|foreword|afterword|pr[eé]face|avant-propos|postface|prefacio|prefazione|postfazione|передмова|післямова)';
/** Nummer als Ziffer, römisch oder ausgeschrieben: 3, XII, drei, premier, перший */
const HEADING_NO = '(?:\\d+|\\p{L}+)';
const HEADING_REST = '(?:\\s*[:.\\-–—]\\s*.*)?$';
/** Einzeln stehende Zeilen wie "Teil 2" (Akt) bzw. "Kapitel 3: Titel", "Prolog" (Kapitel) in Text-Dateien. */
const TXT_ACT_LINE = new RegExp(`^${ACT_WORD}\\s+${HEADING_NO}\\.?${HEADING_REST}`, 'iu');
const TXT_CHAPTER_LINE = new RegExp(`^(?:${CHAPTER_WORD}\\s+${HEADING_NO}\\.?|${FRAME_WORD})${HEADING_REST}`, 'iu');
/** Überschriften, die nur eine Nummer sind ("Act 1", "Chapitre 3 : Titre") */
const NUMBERED_HEADING = new RegExp(`^(?:${ACT_WORD}|${CHAPTER_WORD}|${SCENE_WORD})\\s+\\d+\\s*(?:[:.\\-–—]\\s*(.*))?$`, 'iu');
const NUMBERED_ACT = new RegExp(`^${ACT_WORD}\\s+\\d+`, 'iu');
const NUMBERED_CHAPTER = new RegExp(`^${CHAPTER_WORD}\\s+\\d+`, 'iu');
const NUMBERED_SCENE = new RegExp(`^${SCENE_WORD}\\s+\\d+`, 'iu');

function txtHeadingLevel(line: string): number {
  const t = line.trim();
  if (t.length > 80) return 0;
  if (TXT_ACT_LINE.test(t)) return 1;
  if (TXT_CHAPTER_LINE.test(t)) return 2;
  return 0;
}

/** Markdown oder Text in Blöcke zerlegen (gleiche Struktur wie beim docx). */
export function readTextContent(src: string, kind: 'markdown' | 'text'): DocContent {
  let text = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  let title = '';
  let author = '';
  if (kind === 'markdown' && /^---\n/.test(text)) {
    const { data, body } = parseFrontmatter(text);
    title = typeof data.title === 'string' || typeof data.title === 'number' ? String(data.title).trim() : '';
    author = typeof data.author === 'string' ? data.author.trim() : typeof data.autor === 'string' ? data.autor.trim() : '';
    text = body;
  }
  const md = kind === 'markdown';
  const lines = text.split('\n');
  const nonBlank = lines.filter((l) => l.trim()).length;
  const blank = lines.length - nonBlank;
  // Absätze durch Leerzeilen getrennt – oder (kaum Leerzeilen) jede Zeile ein Absatz
  const blankMode = nonBlank > 0 && blank >= nonBlank * 0.15;
  const inline = (s: string) => (md ? mdInlineToHtml(s) : escapeHtml(s));
  const blocks: DocBlock[] = [];
  const para = (s: string, listItem = false) => {
    const html = inline(s.trim());
    const plain = htmlPlain(html);
    if (plain) blocks.push({ kind: 'para', level: 0, listItem, html, plain });
  };
  let group: string[] = [];
  const flush = () => {
    if (!group.length) return;
    const g = group;
    group = [];
    if (!md && g.length === 1) {
      const level = txtHeadingLevel(g[0]);
      if (level) {
        blocks.push({ kind: 'heading', level, listItem: false, html: escapeHtml(g[0].trim()), plain: g[0].trim() });
        return;
      }
    }
    if (md && g.every((l) => MD_LIST.test(l))) {
      for (const l of g) para(l.replace(MD_LIST, ''), true);
      return;
    }
    para(g.map((l) => l.trim()).join(' '));
  };
  for (const raw of lines) {
    let line = raw;
    if (md) line = line.replace(/^\s{0,3}>\s?/, '');
    if (!line.trim()) {
      flush();
      continue;
    }
    if (SCENE_BREAK.test(line) || UNDERSCORE_LINE.test(line)) {
      flush();
      blocks.push({ kind: 'break', level: 0, listItem: false, html: '', plain: line.trim() });
      continue;
    }
    const h = md ? MD_HEADING.exec(line) : null;
    if (h) {
      flush();
      const html = mdInlineToHtml(h[2]);
      blocks.push({ kind: 'heading', level: h[1].length, listItem: false, html, plain: htmlPlain(html) });
      continue;
    }
    if (blankMode) group.push(line);
    else {
      group = [line];
      flush();
    }
  }
  flush();
  // Markdown: eine einzelne H1 ganz oben über weiteren Überschriften ist der Romantitel
  const h1 = blocks.filter((b) => b.kind === 'heading' && b.level === 1);
  if (md && h1.length === 1 && blocks[0] === h1[0] && blocks.some((b) => b.kind === 'heading' && b.level > 1)) {
    blocks[0] = { ...blocks[0], kind: 'title' };
    title ||= blocks[0].plain;
  }
  return { blocks, title, author, separatorLines: 0, warnings: [] };
}

// ---------------------------------------------------------------- Gliederung bilden

interface ParsedScene {
  title: string;
  summary: DocBlock[];
  prose: DocBlock[];
  separated: boolean;
  /** automatische Einordnung bei Szenen ohne Trennlinie (nur Novelcrafter-Format) */
  guess: 'summary' | 'prose' | null;
}
interface ParsedChapter {
  title: string;
  scenes: ParsedScene[];
}
interface ParsedAct {
  title: string;
  chapters: ParsedChapter[];
}

interface StructureConfig {
  /** Einfaches Format: alles ist Prosa, Linien sind Szenenumbrüche. */
  simple: boolean;
  separator?: 'summary' | 'scene-break';
  unseparated?: UnseparatedMode;
}

const structureConfig = (format: ImportFormat, opts: ImportOptions): StructureConfig =>
  format === 'simple' ? { simple: true } : { simple: false, separator: opts.separator, unseparated: opts.unseparated };

/** "Act 1", "Chapitre 3", "Szene 2" sind nur Nummern – der eigentliche Titel bleibt leer bzw. steht nach dem Doppelpunkt. */
export function cleanHeading(s: string): string {
  const t = s.trim();
  const m = NUMBERED_HEADING.exec(t);
  return m ? (m[1] ?? '').trim() : t;
}

/** Heuristik für Szenen ohne Linie: wenige, lange Absätze ohne wörtliche Rede = Zusammenfassung. */
export function looksLikeSummary(paras: { plain: string }[]): boolean {
  const ps = paras.filter((p) => p.plain.trim());
  if (!ps.length || ps.length > 30) return false;
  const avg = ps.reduce((n, p) => n + p.plain.length, 0) / ps.length;
  const dialog = ps.filter((p) => /^\s*[»«"„“”‚‘'›‹]/.test(p.plain) || /^\s*[–—-]\s/.test(p.plain)).length / ps.length;
  return avg >= 200 && dialog < 0.1;
}

function structure(blocks: DocBlock[], cfg: StructureConfig): ParsedAct[] {
  const sepIsBreak = cfg.simple || cfg.separator === 'scene-break';
  const levels = [...new Set(blocks.filter((b) => b.kind === 'heading').map((b) => b.level))].sort((a, b) => a - b);
  let actLevel: number | null = null;
  let chapterLevel: number | null = null;
  let sceneLevel: number | null = null;
  if (levels.length >= 3) [actLevel, chapterLevel, sceneLevel] = levels;
  else if (levels.length === 2) {
    // Zwei Ebenen sind meist Akt/Kapitel – aber Kapitel/Szene, wenn die Überschriften danach aussehen
    // (so exportiert Novelmaker einen Roman mit nur einem Akt)
    const at = (l: number) => blocks.filter((b) => b.kind === 'heading' && b.level === l).map((b) => b.plain.trim());
    const upper = at(levels[0]);
    const lower = at(levels[1]);
    const chapterScene =
      !upper.some((t) => NUMBERED_ACT.test(t)) && (lower.some((t) => NUMBERED_SCENE.test(t)) || upper.some((t) => NUMBERED_CHAPTER.test(t)));
    if (chapterScene) [chapterLevel, sceneLevel] = levels;
    else [actLevel, chapterLevel] = levels;
  } else if (levels.length === 1) chapterLevel = levels[0];

  const acts: ParsedAct[] = [];
  let act: ParsedAct | null = null;
  let chapter: ParsedChapter | null = null;
  let cur: { title: string; blocks: DocBlock[]; titled: boolean } | null = null;
  const ensureAct = () => {
    if (!act) {
      act = { title: '', chapters: [] };
      acts.push(act);
    }
    return act;
  };
  const ensureChapter = () => {
    if (!chapter) {
      chapter = { title: '', scenes: [] };
      ensureAct().chapters.push(chapter);
    }
    return chapter;
  };
  const finishScene = () => {
    if (cur && (cur.blocks.length || cur.titled)) ensureChapter().scenes.push(toScene(cur.title, cur.blocks));
    cur = null;
  };

  for (const b of blocks) {
    if (b.kind === 'title') continue;
    if (b.kind === 'heading' && b.level === actLevel) {
      finishScene();
      chapter = null;
      const title = cleanHeading(b.plain);
      if (act && !act.chapters.length) act.title = title;
      else {
        act = { title, chapters: [] };
        acts.push(act);
      }
      continue;
    }
    if (b.kind === 'heading' && b.level === chapterLevel) {
      finishScene();
      chapter = { title: cleanHeading(b.plain), scenes: [] };
      ensureAct().chapters.push(chapter);
      continue;
    }
    if (b.kind === 'heading' && b.level === sceneLevel) {
      finishScene();
      cur = { title: cleanHeading(b.plain), blocks: [], titled: true };
      continue;
    }
    if (b.kind === 'break' || (b.kind === 'sep' && sepIsBreak)) {
      finishScene();
      continue;
    }
    cur ??= { title: '', blocks: [], titled: false };
    cur.blocks.push(b);
  }
  finishScene();
  return acts;

  function toScene(title: string, sceneBlocks: DocBlock[]): ParsedScene {
    if (cfg.simple) return { title, summary: [], prose: sceneBlocks.filter((b) => b.kind !== 'sep'), separated: false, guess: null };
    const i = sceneBlocks.findIndex((b) => b.kind === 'sep');
    if (i >= 0) {
      // weitere Linien in derselben Szene sind nur Deko
      return { title, summary: sceneBlocks.slice(0, i), prose: sceneBlocks.slice(i + 1).filter((b) => b.kind !== 'sep'), separated: true, guess: null };
    }
    if (!sceneBlocks.length) return { title, summary: [], prose: [], separated: false, guess: null };
    const guess = looksLikeSummary(sceneBlocks) ? 'summary' : 'prose';
    const mode = cfg.unseparated ?? 'auto';
    const asSummary = mode === 'summary' || (mode === 'auto' && guess === 'summary');
    return { title, summary: asSummary ? sceneBlocks : [], prose: asSummary ? [] : sceneBlocks, separated: false, guess };
  }
}

/** Mehrere Manuskript-Dateien: jede Datei wird (mindestens) ein Kapitel. */
function mergeFiles(parts: { path: string; acts: ParsedAct[] }[]): ParsedAct[] {
  const out: ParsedAct[] = [];
  for (const part of parts) {
    const acts = part.acts;
    if (!acts.length) continue;
    const chapters = acts.flatMap((a) => a.chapters);
    if (chapters.length === 1 && !chapters[0].title) chapters[0].title = fileTitle(part.path);
    if (acts.length === 1 && !acts[0].title) {
      let last = out[out.length - 1];
      if (!last) {
        last = { title: '', chapters: [] };
        out.push(last);
      }
      last.chapters.push(...acts[0].chapters);
    } else out.push(...acts);
  }
  return out;
}

function blocksToSummary(blocks: DocBlock[]): string {
  let out = '';
  blocks.forEach((b, i) => {
    const line = (b.listItem ? '- ' : '') + b.plain;
    if (i > 0) out += b.listItem && blocks[i - 1].listItem ? '\n' : '\n\n';
    out += line;
  });
  return out.trim();
}

function blocksToDoc(blocks: DocBlock[]): PMNode[] {
  const nodes: PMNode[] = [];
  for (const b of blocks) {
    if (b.kind === 'sep' || b.kind === 'title') continue;
    const content = htmlInline(b.html);
    if (!b.plain && !content.length) continue;
    nodes.push(b.kind === 'heading' ? { type: 'heading', attrs: { level: Math.min(3, Math.max(1, b.level)) }, content } : { type: 'paragraph', content });
  }
  return nodes;
}

// ---------------------------------------------------------------- Frontmatter

/** Kleiner YAML-Leser für Frontmatter (Skalare, Listen, eine Ebene Maps). */
export function parseFrontmatter(src: string): { data: Record<string, unknown>; body: string } {
  const text = src.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n?---[ \t]*(?:\n|$)/.exec(text);
  if (!m) return { data: {}, body: text.trim() };
  const data: Record<string, unknown> = {};
  const lines = m[1].split('\n');
  const scalar = (v: string): unknown => {
    const t = v.trim();
    if (t === '' || t === 'null' || t === '~') return null;
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === '[]') return [];
    if (t === '{}') return {};
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (t.startsWith('"')) {
      try {
        return JSON.parse(t);
      } catch {
        return t.slice(1, -1);
      }
    }
    if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
    if (t.startsWith('[') && t.endsWith(']'))
      return t
        .slice(1, -1)
        .split(',')
        .map((x) => scalar(x))
        .filter((x) => x !== null);
    return t;
  };
  for (let i = 0; i < lines.length; i++) {
    const km = /^([^\s:#][^:]*):(?:\s+(.*))?$/.exec(lines[i]);
    if (!km) continue;
    const key = km[1].trim();
    const rest = (km[2] ?? '').trim();
    if (rest) {
      data[key] = scalar(rest);
      continue;
    }
    // Block: Liste oder Map, eingerückt
    const list: unknown[] = [];
    const map: Record<string, unknown> = {};
    let isList = false;
    let j = i + 1;
    for (; j < lines.length && /^\s+\S/.test(lines[j]); j++) {
      const li = /^\s+-\s*(.*)$/.exec(lines[j]);
      if (li) {
        isList = true;
        list.push(scalar(li[1]));
        continue;
      }
      const mi = /^\s+([^:]+):\s*(.*)$/.exec(lines[j]);
      if (mi) map[mi[1].trim()] = scalar(mi[2]);
    }
    data[key] = isList ? list : Object.keys(map).length ? map : null;
    i = j - 1;
  }
  return { data, body: text.slice(m[0].length).trim() };
}

// ---------------------------------------------------------------- Kodex, Snippets, Chats

interface ImportCodex {
  /** Schlüssel für Verknüpfungen (Novelcrafter-ID bzw. Dateipfad) */
  key: string;
  type: CodexType;
  name: string;
  aliases: string[];
  tags: string[];
  description: string;
  notes: string;
  fields: CodexField[];
  inclusion: CodexInclusion;
  color: string | null;
  nested: string[];
}
interface ImportSnippet {
  title: string;
  text: string;
  date: string;
}
interface ImportChat {
  title: string;
  date: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

const CODEX_TYPE_MAP: Record<string, CodexType> = {
  character: 'character',
  characters: 'character',
  location: 'location',
  locations: 'location',
  object: 'object',
  objects: 'object',
  item: 'object',
  lore: 'lore',
  subplot: 'subplot',
  subplots: 'subplot',
  other: 'other',
};

/** Typ-Wörter in Frontmatter (deutsch oder englisch). */
const TYPE_WORDS: Record<string, CodexType> = {
  ...CODEX_TYPE_MAP,
  items: 'object',
  figur: 'character',
  figuren: 'character',
  charakter: 'character',
  charaktere: 'character',
  person: 'character',
  personen: 'character',
  ort: 'location',
  orte: 'location',
  schauplatz: 'location',
  schauplätze: 'location',
  schauplaetze: 'location',
  objekt: 'object',
  objekte: 'object',
  gegenstand: 'object',
  gegenstände: 'object',
  gegenstaende: 'object',
  welt: 'lore',
  worldbuilding: 'lore',
  handlungsstrang: 'subplot',
  handlungsstränge: 'subplot',
  handlungsstraenge: 'subplot',
  sonstiges: 'other',
  sonstige: 'other',
};

/** Unterordner im Kontext-Ordner, die den Typ festlegen. */
const TYPE_DIRS: [RegExp, CodexType][] = [
  [/^(figuren|charaktere|personen|characters?)$/i, 'character'],
  [/^(orte|schauplätze|schauplaetze|locations?)$/i, 'location'],
  [/^(objekte|gegenstände|gegenstaende|objects?|items?)$/i, 'object'],
  [/^(lore|welt|worldbuilding)$/i, 'lore'],
  [/^(subplots?|handlungsstränge|handlungsstraenge)$/i, 'subplot'],
];

const CONTEXT_DIR = /^(kontext|context|kodex|codex)$/i;
const SNIPPET_DIR = /^(snippets|notizen)$/i;
const TEXT_FILE = /\.(docx|md|markdown|txt)$/i;

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => x != null && x !== '').map((x) => String(x)) : []);
/** Liste aus YAML-Liste oder kommagetrenntem Text. */
const listOrComma = (v: unknown): string[] =>
  typeof v === 'string'
    ? v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : strList(v);

function fileDate(name: string, date: Date | undefined): string {
  if (date && !Number.isNaN(date.getTime()) && date.getFullYear() > 1990) return date.toISOString();
  const m = /(\d{4}-\d{2}-\d{2})/.exec(name);
  return m ? new Date(`${m[1]}T12:00:00`).toISOString() : new Date().toISOString();
}

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const dirName = (p: string) => p.slice(0, p.lastIndexOf('/') + 1);
const withoutExt = (name: string) => name.replace(/\.[^.]+$/, '');
const naturalCompare = (a: string, b: string) => a.localeCompare(b, 'de', { numeric: true, sensitivity: 'base' });

/** Nummer am Anfang eines Dateinamens, auch mit Gliederungswort: "01 - ", "Kapitel 3_", "Chapitre 12 - " */
const FILE_NUMBER = new RegExp(`^\\s*(?:(?:${CHAPTER_WORD}|${ACT_WORD})[\\s_-]*)?\\d+(?:\\.\\d+)*\\s*[-_.:)–—]*\\s*`, 'iu');

/** Kapiteltitel aus einem Dateinamen: "01 - Der Anfang.md" → "Der Anfang". */
function fileTitle(path: string): string {
  return withoutExt(baseName(path))
    .replace(FILE_NUMBER, '')
    .replace(/_/g, ' ')
    .trim();
}

function firstLine(text: string, max = 60): string {
  const line = text
    .split('\n')
    .map((l) => l.replace(/^[#>*\-\s\d.)]+/, '').replace(/[*_`]+/g, '').trim())
    .find(Boolean);
  if (!line) return '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

async function readNcCodex(zip: JSZip, prefix: string): Promise<ImportCodex[]> {
  const dirs = new Set<string>();
  for (const f of Object.values(zip.files)) {
    if (f.dir || !f.name.startsWith(prefix) || f.name.includes('__MACOSX')) continue;
    const rel = f.name.slice(prefix.length);
    if (/^(snippets|chats)\//.test(rel)) continue;
    if (/\/(entry\.md|metadata\.json)$/.test(rel)) dirs.add(f.name.slice(0, f.name.lastIndexOf('/') + 1));
  }
  const out: ImportCodex[] = [];
  for (const dir of [...dirs].sort()) {
    let attrs: Record<string, unknown> = {};
    let ncId = '';
    let nested: string[] = [];
    let links: string[] = [];
    const metaFile = zip.file(`${dir}metadata.json`);
    if (metaFile) {
      try {
        const meta = JSON.parse(await metaFile.async('string'));
        attrs = meta.attributes ?? {};
        ncId = String(meta.id ?? '');
        nested = (meta.relationships?.nestedEntries ?? []).map((x: unknown) => (typeof x === 'string' ? x : String((x as { id?: string })?.id ?? ''))).filter(Boolean);
        links = (meta.links?.externalReferences ?? []).map((x: unknown) => (typeof x === 'string' ? x : String((x as { url?: string; href?: string })?.url ?? (x as { href?: string })?.href ?? ''))).filter(Boolean);
      } catch {
        /* kaputtes JSON: nur entry.md verwenden */
      }
    }
    const entryFile = zip.file(`${dir}entry.md`);
    const { data: front, body }: { data: Record<string, unknown>; body: string } = entryFile ? parseFrontmatter(await entryFile.async('string')) : { data: {}, body: '' };
    const a = { ...front, ...attrs } as Record<string, unknown>;
    const name = String(a.name ?? '').trim();
    if (!name) continue;
    const folder = dir.slice(prefix.length).split('/')[0] ?? '';
    const type = CODEX_TYPE_MAP[String(a.type ?? '').toLowerCase()] ?? CODEX_TYPE_MAP[folder.toLowerCase()] ?? 'other';
    const fieldsRaw = (front.fields ?? a.fields) as unknown;
    const fields: CodexField[] =
      fieldsRaw && typeof fieldsRaw === 'object' && !Array.isArray(fieldsRaw)
        ? Object.entries(fieldsRaw as Record<string, unknown>)
            .filter(([, v]) => v != null && v !== '')
            .map(([key, v]) => ({ key, value: typeof v === 'object' ? JSON.stringify(v) : String(v) }))
        : [];
    const inclusion: CodexInclusion = a.alwaysIncludeInContext ? 'always' : a.doNotTrack || a.noAutoInclude ? 'never' : 'auto';
    if (!ncId) ncId = /-([A-Za-z0-9]{20,})\/$/.exec(dir)?.[1] ?? dir;
    out.push({
      key: ncId,
      type,
      name,
      aliases: strList(a.aliases).filter((x) => x.toLowerCase() !== name.toLowerCase()),
      tags: strList(a.tags),
      description: body,
      notes: links.length ? `Links:\n${links.map((l) => `- ${l}`).join('\n')}` : '',
      fields,
      inclusion,
      color: typeof a.color === 'string' && a.color ? a.color : null,
      nested,
    });
  }
  return out;
}

async function readNcSnippets(zip: JSZip, prefix: string): Promise<ImportSnippet[]> {
  const files = zip.file(new RegExp(`^${escapeRe(prefix)}snippets/[^/]+\\.md$`, 'i'));
  const out: ImportSnippet[] = [];
  for (const f of files.sort((x, y) => x.name.localeCompare(y.name))) {
    const { data, body } = parseFrontmatter(await f.async('string'));
    const date = fileDate(baseName(f.name), f.date);
    const title = String(data.title ?? '').trim() || firstLine(body) || t('Snippet from {date}', { date: date.slice(0, 10) });
    out.push({ title, text: body, date });
  }
  return out;
}

export function parseChatMarkdown(body: string): ImportChat['messages'] {
  const msgs: ImportChat['messages'] = [];
  let cur: { role: 'user' | 'assistant'; lines: string[] } | null = null;
  const flush = () => {
    if (cur) {
      const content = cur.lines.join('\n').trim();
      if (content) msgs.push({ role: cur.role, content });
    }
  };
  for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^##\s+(User|Benutzer|Ich|AI|KI|Assistant|Assistent)\s*$/i.exec(line);
    if (m) {
      flush();
      cur = { role: /^(user|benutzer|ich)$/i.test(m[1]) ? 'user' : 'assistant', lines: [] };
      continue;
    }
    cur?.lines.push(line);
  }
  flush();
  return msgs;
}

async function readNcChats(zip: JSZip, prefix: string): Promise<ImportChat[]> {
  const files = zip.file(new RegExp(`^${escapeRe(prefix)}chats/[^/]+\\.md$`, 'i'));
  const out: ImportChat[] = [];
  for (const f of files.sort((x, y) => x.name.localeCompare(y.name))) {
    const { data, body } = parseFrontmatter(await f.async('string'));
    const messages = parseChatMarkdown(body);
    if (!messages.length) continue;
    const date = fileDate(baseName(f.name), f.date);
    const firstUser = messages.find((x) => x.role === 'user')?.content ?? '';
    const title = String(data.title ?? '').trim() || firstLine(firstUser, 50) || t('Chat from {date}', { date: date.slice(0, 10) });
    out.push({ title, date, messages });
  }
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------- Einfaches Zip

interface ZipEntry {
  /** Pfad relativ zum Wurzelordner des Zips */
  rel: string;
  file: JSZip.JSZipObject;
}

/** Dateien im Zip ohne Systemdateien; ein gemeinsamer Wurzelordner wird abgeschnitten. */
function zipEntries(zip: JSZip): { entries: ZipEntry[]; rootName: string } {
  let files = Object.values(zip.files).filter(
    (f) => !f.dir && !f.name.split('/').some((seg) => seg === '__MACOSX' || seg.startsWith('.') || seg.startsWith('~$')) && !/^(thumbs\.db|desktop\.ini)$/i.test(baseName(f.name)),
  );
  let prefix = '';
  let rootName = '';
  for (;;) {
    const rels = files.map((f) => f.name.slice(prefix.length));
    const firsts = new Set(rels.map((r) => r.split('/')[0]));
    if (!rels.length || firsts.size !== 1 || !rels.every((r) => r.includes('/'))) break;
    rootName = [...firsts][0];
    prefix += `${rootName}/`;
  }
  files = files.sort((a, b) => naturalCompare(a.name, b.name));
  return { entries: files.map((f) => ({ rel: f.name.slice(prefix.length), file: f })), rootName };
}

async function entryContent(e: ZipEntry): Promise<DocContent> {
  if (/\.docx$/i.test(e.rel)) {
    let z: JSZip;
    try {
      z = await JSZip.loadAsync(await e.file.async('uint8array'));
    } catch {
      throw new HttpError(400, t('{file} is not a valid docx file.', { file: e.rel }));
    }
    return readDocx(z);
  }
  return readTextContent(decodeText(await e.file.async('uint8array')), /\.(md|markdown)$/i.test(e.rel) ? 'markdown' : 'text');
}

/** Text einer Kontext-/Snippet-Datei: Markdown bleibt wie geschrieben, docx wird zu Klartext. */
async function entryText(e: ZipEntry): Promise<string> {
  if (/\.docx$/i.test(e.rel)) {
    const c = await entryContent(e);
    return blocksToSummary(c.blocks.filter((b) => b.kind !== 'sep'));
  }
  return decodeText(await e.file.async('uint8array'));
}

const truthy = (v: unknown) => v === true || (typeof v === 'string' && /^(ja|yes|true|1)$/i.test(v.trim())) || v === 1;

function inclusionFrom(data: Record<string, unknown>): CodexInclusion {
  const get = (...keys: string[]) => {
    for (const [k, v] of Object.entries(data)) if (keys.includes(k.toLowerCase())) return v;
    return undefined;
  };
  if (truthy(get('immer', 'always'))) return 'always';
  if (truthy(get('nie', 'never'))) return 'never';
  const mode = String(get('einbindung', 'inclusion') ?? '').trim().toLowerCase();
  if (/^(immer|always)$/.test(mode)) return 'always';
  if (/^(nie|never)$/.test(mode)) return 'never';
  return 'auto';
}

const RESERVED_KEYS = new Set(['name', 'type', 'typ', 'aliases', 'alias', 'aliase', 'tags', 'tag', 'immer', 'always', 'nie', 'never', 'einbindung', 'inclusion', 'title', 'titel']);

async function readContextEntries(entries: ZipEntry[], warnings: string[]): Promise<ImportCodex[]> {
  const out: ImportCodex[] = [];
  for (const e of entries) {
    const dirs = e.rel.split('/').slice(1, -1);
    let type: CodexType = 'other';
    for (let i = dirs.length - 1; i >= 0; i--) {
      const hit = TYPE_DIRS.find(([re]) => re.test(dirs[i]));
      if (hit) {
        type = hit[1];
        break;
      }
    }
    let text: string;
    try {
      text = await entryText(e);
    } catch (err) {
      warnings.push(`${e.rel}: ${(err as Error).message}`);
      continue;
    }
    const { data, body } = /\.(md|markdown)$/i.test(e.rel) ? parseFrontmatter(text) : { data: {} as Record<string, unknown>, body: text.trim() };
    const get = (...keys: string[]) => {
      for (const [k, v] of Object.entries(data)) if (keys.includes(k.toLowerCase())) return v;
      return undefined;
    };
    const name = String(get('name', 'title', 'titel') ?? '').trim() || withoutExt(baseName(e.rel)).trim();
    if (!name) continue;
    const typeWord = String(get('type', 'typ') ?? '').trim().toLowerCase();
    if (typeWord && TYPE_WORDS[typeWord]) type = TYPE_WORDS[typeWord];
    const fields: CodexField[] = Object.entries(data)
      .filter(([k, v]) => !RESERVED_KEYS.has(k.toLowerCase()) && v != null && v !== '' && typeof v !== 'object')
      .map(([key, v]) => ({ key, value: String(v) }));
    out.push({
      key: e.rel,
      type,
      name,
      aliases: listOrComma(get('aliases', 'alias', 'aliase')).filter((x) => x.toLowerCase() !== name.toLowerCase()),
      tags: listOrComma(get('tags', 'tag')),
      description: body,
      notes: '',
      fields,
      inclusion: inclusionFrom(data),
      color: null,
      nested: [],
    });
  }
  return out;
}

async function readSimpleSnippets(entries: ZipEntry[], warnings: string[]): Promise<ImportSnippet[]> {
  const out: ImportSnippet[] = [];
  for (const e of entries) {
    let text: string;
    try {
      text = await entryText(e);
    } catch (err) {
      warnings.push(`${e.rel}: ${(err as Error).message}`);
      continue;
    }
    const { data, body } = /\.(md|markdown)$/i.test(e.rel) ? parseFrontmatter(text) : { data: {} as Record<string, unknown>, body: text.trim() };
    const title = (typeof data.title === 'string' || typeof data.title === 'number' ? String(data.title).trim() : '') || withoutExt(baseName(e.rel)).trim();
    out.push({ title, text: body, date: fileDate(baseName(e.rel), e.file.date) });
  }
  return out;
}

// ---------------------------------------------------------------- Einstieg

interface ParsedImport {
  kind: ImportPreview['kind'];
  format: ImportFormat;
  detected: ImportFormat;
  title: string;
  author: string;
  acts: ParsedAct[];
  separatorLines: number;
  warnings: string[];
  files: number;
  missingHeadings: ImportPreview['missingHeadings'];
  codex: ImportCodex[];
  snippets: ImportSnippet[];
  chats: ImportChat[];
}

function titleFromFilename(filename: string): string {
  return (
    filename
      .replace(/^.*[\\/]/, '')
      .replace(/\.(docx|zip|md|markdown|txt)$/i, '')
      .replace(/^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2} /, '')
      .replace(/ - (full|novel|manuscript)$/i, '')
      .trim() || t('Imported novel')
  );
}

/** Novelcrafter-Export: novel.docx plus Kodex-Ordner, Snippets oder Chats. */
function zipLooksLikeNovelcrafter(zip: JSZip): boolean {
  const names = Object.keys(zip.files).filter((n) => !n.includes('__MACOSX'));
  const hasNovel = names.some((n) => baseName(n).toLowerCase() === 'novel.docx');
  const hasParts = names.some((n) => /(^|\/)(metadata\.json|entry\.md)$/i.test(n) || /(^|\/)(snippets|chats)\/[^/]+\.md$/.test(n));
  return hasNovel && hasParts;
}

const emptyExtras = { codex: [] as ImportCodex[], snippets: [] as ImportSnippet[], chats: [] as ImportChat[] };

/**
 * Manche Packprogramme (z. B. Compress-Archive aus Windows PowerShell 5.1) speichern Pfade mit „\“ statt „/“.
 * Ohne Umbau würden Ordner wie „Kontext\Figuren\…“ nicht erkannt und ihre Dateien als Manuskript gelesen.
 */
async function withSlashPaths(zip: JSZip): Promise<JSZip> {
  const files = Object.values(zip.files);
  if (!files.some((f) => f.name.includes('\\'))) return zip;
  const out = new JSZip();
  for (const f of files) {
    const name = f.name.replace(/\\/g, '/');
    if (f.dir) out.folder(name);
    else out.file(name, await f.async('uint8array'), { date: f.date });
  }
  return out;
}

async function parseImport(data: Buffer, filename: string, opts: ImportOptions): Promise<ParsedImport> {
  const isZipData = data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b;
  if (!isZipData) {
    const ext = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase() ?? '';
    if (ext !== 'md' && ext !== 'markdown' && ext !== 'txt') throw new HttpError(400, t('The file is neither a Word document (docx) nor Markdown, plain text, or a zip archive.'));
    const kind = ext === 'txt' ? 'text' : 'markdown';
    const doc = readTextContent(decodeText(data), kind);
    return {
      kind,
      format: 'simple',
      detected: 'simple',
      title: doc.title || titleFromFilename(filename),
      author: doc.author,
      acts: structure(doc.blocks, { simple: true }),
      separatorLines: 0,
      warnings: [],
      files: 1,
      missingHeadings: lacksHeadings(doc) ? kind : null,
      ...emptyExtras,
    };
  }
  let zip: JSZip;
  try {
    zip = await withSlashPaths(await JSZip.loadAsync(data));
  } catch {
    throw new HttpError(400, t('The file couldn’t be extracted.'));
  }
  if (zip.file('word/document.xml')) {
    const doc = await readDocx(zip);
    const format = opts.format ?? 'simple';
    return {
      kind: 'docx',
      format,
      detected: docxLooksLikeNovelcrafter(doc) ? 'novelcrafter' : 'simple',
      title: doc.title || titleFromFilename(filename),
      author: doc.author,
      acts: structure(doc.blocks, structureConfig(format, opts)),
      separatorLines: doc.separatorLines,
      warnings: doc.warnings,
      files: 1,
      missingHeadings: lacksHeadings(doc) ? 'docx' : null,
      ...emptyExtras,
    };
  }
  const detected: ImportFormat = zipLooksLikeNovelcrafter(zip) ? 'novelcrafter' : 'simple';
  const format = opts.format ?? detected;
  return format === 'novelcrafter' ? parseNovelcrafterZip(zip, filename, opts, detected) : parseSimpleZip(zip, filename, detected);
}

async function parseNovelcrafterZip(zip: JSZip, filename: string, opts: ImportOptions, detected: ImportFormat): Promise<ParsedImport> {
  // novel.docx (evtl. in einem Unterordner, wenn selbst gezippt)
  const docs = zip.file(/\.docx$/i).filter((f) => !f.name.includes('__MACOSX') && !baseName(f.name).startsWith('~$'));
  docs.sort((a, b) => Number(baseName(b.name).toLowerCase() === 'novel.docx') - Number(baseName(a.name).toLowerCase() === 'novel.docx') || a.name.split('/').length - b.name.split('/').length);
  const docFile = docs[0];
  if (!docFile) throw new HttpError(400, t('No novel.docx found in the zip.'));
  const prefix = docFile.name.slice(0, docFile.name.length - baseName(docFile.name).length);
  let docZip: JSZip;
  try {
    docZip = await JSZip.loadAsync(await docFile.async('nodebuffer'));
  } catch {
    throw new HttpError(400, t('{file} is not a valid docx file.', { file: docFile.name }));
  }
  const doc = await readDocx(docZip);
  const [codex, snippets, chats] = await Promise.all([readNcCodex(zip, prefix), readNcSnippets(zip, prefix), readNcChats(zip, prefix)]);
  return {
    kind: 'novelcrafter-zip',
    format: 'novelcrafter',
    detected,
    title: doc.title || titleFromFilename(prefix.replace(/\/$/, '') || filename),
    author: doc.author,
    acts: structure(doc.blocks, structureConfig('novelcrafter', opts)),
    separatorLines: doc.separatorLines,
    warnings: doc.warnings,
    files: 1,
    missingHeadings: lacksHeadings(doc) ? 'docx' : null,
    codex,
    snippets,
    chats,
  };
}

async function parseSimpleZip(zip: JSZip, filename: string, detected: ImportFormat): Promise<ParsedImport> {
  const { entries, rootName } = zipEntries(zip);
  // Ordner mit metadata.json sind Novelcrafter-Kodex-Einträge – nicht als Manuskript lesen
  const ncCodexDirs = new Set(entries.filter((e) => baseName(e.rel).toLowerCase() === 'metadata.json').map((e) => dirName(e.rel)));
  const prose: ZipEntry[] = [];
  const context: ZipEntry[] = [];
  const snippetFiles: ZipEntry[] = [];
  for (const e of entries) {
    if (!TEXT_FILE.test(e.rel)) continue;
    const segs = e.rel.split('/');
    const top = segs.length > 1 ? segs[0] : '';
    if (top && CONTEXT_DIR.test(top)) context.push(e);
    else if (top && SNIPPET_DIR.test(top)) snippetFiles.push(e);
    else if (top && /^chats$/i.test(top)) continue;
    else if (ncCodexDirs.has(dirName(e.rel))) continue;
    else if (/^(readme|liesmich|license|lizenz)$/i.test(withoutExt(baseName(e.rel)))) continue;
    else prose.push(e);
  }
  if (!prose.length && !context.length && !snippetFiles.length)
    throw new HttpError(400, t('The zip contains neither a manuscript (.docx, .md, .txt) nor a “Context” or “Snippets” folder.'));

  const warnings: string[] = [];
  const parts: { path: string; acts: ParsedAct[] }[] = [];
  let title = '';
  let author = '';
  let separatorLines = 0;
  let missingHeadings: ImportPreview['missingHeadings'] = null;
  for (const e of prose) {
    let c: DocContent;
    try {
      c = await entryContent(e);
    } catch (err) {
      warnings.push(`${e.rel}: ${(err as Error).message}`);
      continue;
    }
    warnings.push(...c.warnings);
    separatorLines += c.separatorLines;
    parts.push({ path: e.rel, acts: structure(c.blocks, { simple: true }) });
    if (prose.length === 1) {
      title = c.title;
      author = c.author;
      if (lacksHeadings(c)) missingHeadings = /\.docx$/i.test(e.rel) ? 'docx' : /\.txt$/i.test(e.rel) ? 'text' : 'markdown';
    }
  }
  const acts = parts.length === 1 ? parts[0].acts : mergeFiles(parts);
  const [codex, snippets] = [await readContextEntries(context, warnings), await readSimpleSnippets(snippetFiles, warnings)];
  return {
    kind: 'zip',
    format: 'simple',
    detected,
    title: title || titleFromFilename(rootName || filename),
    author,
    acts,
    separatorLines,
    warnings: [...new Set(warnings)],
    files: prose.length,
    missingHeadings,
    codex,
    snippets,
    chats: [],
  };
}

function previewOf(p: ParsedImport): ImportPreview {
  const scenes = p.acts.flatMap((a) => a.chapters.flatMap((c) => c.scenes));
  const byType: Record<string, number> = {};
  for (const c of p.codex) byType[c.type] = (byType[c.type] ?? 0) + 1;
  return {
    kind: p.kind,
    format: p.format,
    detected: p.detected,
    title: p.title,
    author: p.author,
    acts: p.acts.length,
    chapters: p.acts.reduce((n, a) => n + a.chapters.length, 0),
    scenes: scenes.length,
    files: p.files,
    separatorLines: p.separatorLines,
    separated: scenes.filter((s) => s.separated).length,
    unseparated: {
      summary: scenes.filter((s) => s.guess === 'summary').length,
      prose: scenes.filter((s) => s.guess === 'prose').length,
    },
    emptyScenes: scenes.filter((s) => !s.summary.length && !s.prose.length).length,
    codex: { total: p.codex.length, byType },
    snippets: p.snippets.length,
    chats: p.chats.length,
    warnings: p.warnings,
    missingHeadings: p.missingHeadings,
  };
}

export async function analyzeImport(data: Buffer, filename: string, opts: ImportOptions = {}): Promise<ImportPreview> {
  return previewOf(await parseImport(data, filename, opts));
}

export async function runImport(db: DB, data: Buffer, filename: string, opts: ImportOptions = {}): Promise<ImportResult> {
  const p = await parseImport(data, filename, opts);
  const acts = p.acts;
  const withCodex = opts.codex !== false;
  const withSnippets = opts.snippets !== false;
  const withChats = opts.chats !== false;

  return db.transaction((): ImportResult => {
    const novel = createNovel(db, { title: opts.title?.trim() || p.title, author: p.author, skeleton: false });

    // Als nächsten Band an eine Serie anhängen (Sprache, Zeitform, Perspektive wie der letzte Band)
    let volumeNumber: number | null = null;
    if (opts.seriesId) {
      if (!db.prepare('SELECT id FROM series WHERE id = ?').get(opts.seriesId)) throw new HttpError(400, t('The selected series doesn’t exist (anymore).'));
      const last = db.prepare('SELECT * FROM novels WHERE series_id = ? ORDER BY volume_number DESC LIMIT 1').get(opts.seriesId) as Record<string, any> | undefined;
      volumeNumber = ((last?.volume_number as number | null) ?? 0) + 1;
      db.prepare('UPDATE novels SET series_id = ?, volume_number = ? WHERE id = ?').run(opts.seriesId, volumeNumber, novel.id);
      if (last)
        db.prepare('UPDATE novels SET language = ?, tense = ?, pov_type = ?, author = CASE WHEN author = \'\' THEN ? ELSE author END WHERE id = ?').run(
          last.language,
          last.tense,
          last.pov_type,
          last.author ?? '',
          novel.id,
        );
    }

    let chapters = 0;
    let scenes = 0;
    let summaries = 0;
    let proseScenes = 0;
    if (!acts.length) acts.push({ title: '', chapters: [] });
    for (const a of acts) {
      const act = createAct(db, novel.id, { title: a.title });
      if (!a.chapters.length) a.chapters.push({ title: '', scenes: [] });
      for (const c of a.chapters) {
        const ch = createChapter(db, act.id, { title: c.title });
        chapters++;
        if (!c.scenes.length) {
          createScene(db, ch.id, {});
          scenes++;
        }
        for (const s of c.scenes) {
          const nodes = blocksToDoc(s.prose);
          const summary = blocksToSummary(s.summary);
          createScene(db, ch.id, { title: s.title, summary, content: nodes.length ? { type: 'doc', content: nodes } : undefined });
          scenes++;
          if (summary) summaries++;
          if (nodes.length) proseScenes++;
        }
      }
    }

    // Kodex
    let codexCount = 0;
    let codexExisting = 0;
    if (withCodex && p.codex.length) {
      const idMap = new Map<string, string>();
      // Beim Import in eine Serie: Einträge, die die Serie schon gleich hat, nicht noch einmal als Band-Eintrag anlegen
      // (ein Novelcrafter-Export enthält bei jedem Band den ganzen Serien-Kodex)
      const seriesEntries = opts.seriesId
        ? (db.prepare('SELECT * FROM codex_entries WHERE series_id = ? AND novel_id IS NULL').all(opts.seriesId) as Record<string, any>[]).map(rowToCodex)
        : [];
      for (const c of p.codex) {
        const existing = seriesEntries.find((s) => sameCodexContent(c, s));
        if (existing) {
          idMap.set(c.key, existing.id);
          codexExisting++;
          continue;
        }
        const e = createCodex(db, novel.id, {
          type: c.type,
          name: c.name,
          aliases: c.aliases,
          tags: c.tags,
          description: c.description,
          notes: c.notes,
          fields: c.fields,
          inclusion: c.inclusion,
          color: c.color,
        });
        idMap.set(c.key, e.id);
        codexCount++;
      }
      for (const c of p.codex)
        for (const child of c.nested) {
          const a = idMap.get(c.key);
          const b = idMap.get(child);
          if (a && b && a !== b && !db.prepare('SELECT 1 FROM codex_relations WHERE (a_id = ? AND b_id = ?) OR (a_id = ? AND b_id = ?)').get(a, b, b, a))
            createRelation(db, a, b, '');
        }
    }

    // Snippets
    let snippetCount = 0;
    if (withSnippets) {
      const ins = db.prepare('INSERT INTO snippets (id, novel_id, title, text, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)');
      for (const s of p.snippets) {
        ins.run(newId(), novel.id, s.title, s.text, s.date, s.date);
        snippetCount++;
      }
    }

    // Chats
    let chatCount = 0;
    if (withChats && p.chats.length) {
      const promptId = findPromptByKey(db, 'chat')?.id ?? null;
      const insThread = db.prepare(
        "INSERT INTO chat_threads (id, novel_id, title, prompt_id, model, context, inputs, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, '[]', '{}', ?, ?)",
      );
      const insMsg = db.prepare('INSERT INTO chat_messages (id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)');
      for (const c of p.chats) {
        const threadId = newId();
        insThread.run(threadId, novel.id, c.title, promptId, c.date, c.date);
        const t0 = new Date(c.date).getTime();
        c.messages.forEach((m, i) => insMsg.run(newId(), threadId, m.role, m.content, new Date(t0 + i * 1000).toISOString()));
        chatCount++;
      }
    }

    return {
      novelId: novel.id,
      chapters,
      scenes,
      summaries,
      proseScenes,
      codex: codexCount,
      codexExisting,
      snippets: snippetCount,
      chats: chatCount,
      volumeNumber,
      warnings: p.warnings,
    };
  })();
}
