// Export (Word, Markdown, Zwischenablage) – ganzer Roman oder ein Akt, Kapitel bzw. eine Szene. Import: siehe importers.ts.
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { countWords, docToMarkdown, docToPlainText, FRAME_NODE, isExcludedFrame, nodesToHtml, t, type Novel, type PMDoc, type PMNode } from '@novelmaker/shared';
import { notFound, type DB } from '../db';
import { getFullScenes, getOutline } from '../repo/novels';

export type ExportScope = 'novel' | 'act' | 'chapter' | 'scene';

export interface ExportOptions {
  /** Szenen als Überschriften (Gliederung, z. B. im Word-Navigationsbereich) statt mit „* * *“ getrennt */
  sceneHeadings: boolean;
}

type Block =
  | { kind: 'heading'; level: number; text: string; part: 'act' | 'chapter' | 'scene' }
  | { kind: 'separator' }
  | { kind: 'text'; content: PMDoc };

export interface ExportPlan {
  novel: Novel;
  /** Name des exportierten Teils (Romantitel, „Akt 2: …“, Kapitel- oder Szenenname) */
  label: string;
  scope: ExportScope;
  blocks: Block[];
}

const actLabel = (title: string, n: number) => (title.trim() ? t('Act {n}: {title}', { n, title: title.trim() }) : t('Act {n}', { n }));
const chapterLabel = (title: string, n: number) => title.trim() || t('Chapter {n}', { n });
const sceneLabel = (title: string, n: number) => title.trim() || t('Scene {n}', { n });

/**
 * Was in welcher Reihenfolge exportiert wird. Überschriften-Ebenen beginnen beim exportierten Teil mit 1
 * (ganzer Roman: Akte nur, wenn es mehrere gibt). Eine einzelne Szene bekommt keine Überschrift.
 */
export function planExport(db: DB, novelId: string, scope: ExportScope, itemId: string | null, opts: ExportOptions): ExportPlan {
  const outline = getOutline(db, novelId);
  const scenes = new Map(getFullScenes(db, novelId).map((s) => [s.id, s]));
  const blocks: Block[] = [];
  let label = outline.novel.title;
  let found = scope === 'novel';
  const multiAct = outline.acts.length > 1;

  const addScenes = (ch: (typeof outline.acts)[number]['chapters'][number], level: number) => {
    let first = true;
    ch.scenes.forEach((s, i) => {
      const content = scenes.get(s.id)?.content;
      if (opts.sceneHeadings) {
        blocks.push({ kind: 'heading', level, text: sceneLabel(s.title, i + 1), part: 'scene' });
        if (content) blocks.push({ kind: 'text', content });
        return;
      }
      if (!content || !docToPlainText(content).trim()) return;
      if (!first) blocks.push({ kind: 'separator' });
      blocks.push({ kind: 'text', content });
      first = false;
    });
  };

  let chNo = 0;
  outline.acts.forEach((act, ai) => {
    const wholeAct = scope === 'novel' || (scope === 'act' && act.id === itemId);
    if (scope === 'act' && act.id === itemId) {
      found = true;
      label = actLabel(act.title, ai + 1);
      blocks.push({ kind: 'heading', level: 1, text: label, part: 'act' });
    } else if (scope === 'novel' && multiAct) blocks.push({ kind: 'heading', level: 1, text: actLabel(act.title, ai + 1), part: 'act' });
    const chapterLevel = scope === 'act' || (scope === 'novel' && multiAct) ? 2 : 1;
    for (const ch of act.chapters) {
      chNo++;
      if (wholeAct || (scope === 'chapter' && ch.id === itemId)) {
        const text = chapterLabel(ch.title, chNo);
        if (scope === 'chapter') {
          found = true;
          label = text;
        }
        blocks.push({ kind: 'heading', level: chapterLevel, text, part: 'chapter' });
        addScenes(ch, chapterLevel + 1);
        continue;
      }
      if (scope !== 'scene') continue;
      ch.scenes.forEach((s, i) => {
        if (s.id !== itemId) return;
        found = true;
        label = sceneLabel(s.title, i + 1);
        const content = scenes.get(s.id)?.content;
        if (content) blocks.push({ kind: 'text', content });
      });
    }
  });
  if (!found) notFound(scope === 'act' ? t('Act not found') : scope === 'chapter' ? t('Chapter not found') : t('Scene not found'));
  return { novel: outline.novel, label, scope, blocks };
}

// ---------------------------------------------------------------- Markdown

export function renderMarkdown(plan: ExportPlan): string {
  const parts: string[] = [];
  const novel = plan.scope === 'novel';
  if (novel) {
    parts.push(`# ${plan.novel.title}`);
    if (plan.novel.author) parts.push(`*${plan.novel.author}*`);
  }
  for (const b of plan.blocks) {
    if (b.kind === 'heading') parts.push(`${'#'.repeat(Math.min(6, b.level + (novel ? 1 : 0)))} ${b.text}`);
    else if (b.kind === 'separator') parts.push('* * *');
    else parts.push(docToMarkdown(b.content));
  }
  return parts.filter((p) => p.trim()).join('\n\n') + '\n';
}

// ---------------------------------------------------------------- Zwischenablage (formatiert + Klartext)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderClipboard(plan: ExportPlan): { html: string; text: string; words: number } {
  const html: string[] = [];
  const text: string[] = [];
  let words = 0;
  for (const b of plan.blocks) {
    if (b.kind === 'heading') {
      const l = Math.min(6, b.level);
      html.push(`<h${l}>${esc(b.text)}</h${l}>`);
      text.push(b.text);
    } else if (b.kind === 'separator') {
      html.push('<p style="text-align:center">* * *</p>');
      text.push('* * *');
    } else {
      html.push(nodesToHtml(b.content.content, { manuscript: true }));
      const plain = docToPlainText(b.content);
      words += countWords(plain);
      if (plain) text.push(plain);
    }
  }
  return { html: html.join('\n'), text: text.join('\n\n'), words };
}

// ---------------------------------------------------------------- Word

function runsFrom(nodes: PMNode[] | undefined, bold = false): TextRun[] {
  const runs: TextRun[] = [];
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') runs.push(new TextRun({ text: '', break: 1 }));
    else if (n.type === 'text') {
      const marks = (n.marks ?? []).map((m) => m.type);
      runs.push(new TextRun({ text: n.text ?? '', bold: bold || marks.includes('bold'), italics: marks.includes('italic'), strike: marks.includes('strike') }));
    } else runs.push(...runsFrom(n.content, bold));
  }
  return runs;
}

function docParagraphs(doc: PMDoc | undefined): Paragraph[] {
  const out: Paragraph[] = [];
  const visit = (nodes: PMNode[] | undefined) => {
    for (const n of nodes ?? []) {
      switch (n.type) {
        case 'paragraph':
          out.push(new Paragraph({ children: runsFrom(n.content), spacing: { after: 120 }, indent: { firstLine: 0 } }));
          break;
        case 'heading':
          // Überschriften im Szenentext nicht in die Gliederung mischen
          out.push(new Paragraph({ children: runsFrom(n.content, true), spacing: { before: 120, after: 120 } }));
          break;
        case 'horizontalRule':
          out.push(new Paragraph({ children: [new TextRun('* * *')], alignment: AlignmentType.CENTER }));
          break;
        case 'beat':
        case 'hiddenNote':
          break;
        case FRAME_NODE:
          if (!isExcludedFrame(n)) visit(n.content);
          break;
        default:
          visit(n.content);
      }
    }
  };
  visit(doc?.content);
  return out;
}

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

export async function renderDocx(plan: ExportPlan): Promise<Buffer> {
  const n = plan.novel;
  const children: Paragraph[] = [];
  if (plan.scope === 'novel') {
    children.push(new Paragraph({ text: n.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }));
    if (n.author) children.push(new Paragraph({ children: [new TextRun({ text: n.author, italics: true })], alignment: AlignmentType.CENTER }));
  }
  for (const b of plan.blocks) {
    if (b.kind === 'heading') {
      // Akte und Kapitel beginnen auf einer neuen Seite (außer ganz am Anfang)
      children.push(new Paragraph({ text: b.text, heading: HEADINGS[Math.min(3, b.level - 1)], pageBreakBefore: b.part !== 'scene' && children.length > 0 }));
    } else if (b.kind === 'separator') {
      children.push(new Paragraph({ children: [new TextRun('* * *')], alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 } }));
    } else children.push(...docParagraphs(b.content));
  }
  const doc = new Document({
    creator: n.author || 'Novelmaker',
    title: plan.scope === 'novel' ? n.title : `${n.title} – ${plan.label}`,
    styles: { default: { document: { run: { font: 'Times New Roman', size: 24 } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
