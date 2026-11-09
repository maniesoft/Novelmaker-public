import { describe, expect, it } from 'vitest';
import { countWords, docToHtml, docToMarkdown, docToPlainText, frameNode, type PMDoc } from '../src';

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('Rahmen', () => {
  const doc = (excluded: boolean, collapsed = false): PMDoc => ({
    type: 'doc',
    content: [
      para('Carla öffnete die Tür.'),
      { type: 'frame', attrs: { title: 'Variante 1', excluded, collapsed }, content: [para('Ein Brief lag auf dem Boden.'), para('Er war nass.')] },
      para('Dann ging sie hinein.'),
    ],
  });

  it('ausgeblendete Rahmen fehlen in Klartext, Wortzahl und Markdown', () => {
    const text = docToPlainText(doc(true));
    expect(text).toBe('Carla öffnete die Tür.\n\nDann ging sie hinein.');
    expect(countWords(text)).toBe(8);
    expect(docToMarkdown(doc(true))).not.toContain('Brief');
    expect(docToPlainText(doc(true), { includeExcludedFrames: true })).toContain('Ein Brief lag auf dem Boden.\n\nEr war nass.');
  });

  it('eingeblendete Rahmen zählen wie normaler Text', () => {
    expect(docToPlainText(doc(false))).toBe('Carla öffnete die Tür.\n\nEin Brief lag auf dem Boden.\n\nEr war nass.\n\nDann ging sie hinein.');
    expect(docToMarkdown(doc(false))).toContain('Er war nass.');
  });

  it('ohne Angabe gilt ein Rahmen als ausgeblendet', () => {
    const d: PMDoc = { type: 'doc', content: [{ type: 'frame', content: [para('Geheim.')] }] };
    expect(docToPlainText(d)).toBe('');
  });

  it('statisches HTML zeigt Titel, eingeklappt ohne Inhalt', () => {
    expect(docToHtml(doc(true))).toContain('<div class="frame-static frame-static-excluded"><div class="frame-static-title">Variante 1</div><p>Ein Brief');
    expect(docToHtml(doc(true, true))).not.toContain('Ein Brief');
  });

  it('frameNode baut Absätze aus Klartext', () => {
    const f = frameNode('Eins.\n\nZwei.', 'Variante 2');
    expect(f.attrs).toEqual({ title: 'Variante 2', excluded: true, collapsed: false });
    expect(f.content).toHaveLength(2);
  });
});
