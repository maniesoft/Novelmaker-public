import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import JSZip from 'jszip';
import { BorderStyle, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ImportOptions, ImportPreview, ImportResult, Outline, Scene } from '@novelmaker/shared';
import { buildApp } from '../src/app';
import { openDb, ROOT_DIR, type DB } from '../src/db';
import { seedBuiltins } from '../src/repo/prompts';
import { updateAppSettings } from '../src/repo/settings';
import { cleanHeading, looksLikeSummary, mdInlineToHtml, parseChatMarkdown, parseFrontmatter, readTextContent } from '../src/services/importers';

let db: DB;
let app: FastifyInstance;
const NC_FORMAT: ImportOptions = { format: 'novelcrafter' };

async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await app.inject({ method: method as any, url, payload: body as any });
  if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`);
  return res.json() as T;
}

const line = () => new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: 'auto' } } });
const p = (text: string) => new Paragraph({ children: [new TextRun(text)] });
const LONG_SUMMARY =
  'Carla kommt nach der Schicht nach Hause und findet die Wohnung leer vor. Sie ruft Hannes an, der nicht abnimmt, und beschließt, ihn im Café zu suchen. Dort trifft sie stattdessen auf Maria, die ihr von dem Streit erzählt.';

/** Nachbau eines Novelcrafter-docx: Titel, Act/Chapter/Scene-Überschriften, Linie zwischen Zusammenfassung und Prosa. */
async function ncDocx(): Promise<Buffer> {
  const doc = new Document({
    creator: 'Jane Doe',
    title: 'Testroman',
    sections: [
      {
        children: [
          new Paragraph({ text: 'Testroman', heading: HeadingLevel.TITLE }),
          new Paragraph({ text: 'Act 1', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Chapter 1', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Scene 1', heading: HeadingLevel.HEADING_3 }),
          p('Carla trifft Hannes im Café.'),
          line(),
          p('Das Café war voll.'),
          new Paragraph({ children: [new TextRun('»Hallo«, sagte Carla '), new TextRun({ text: 'leise', italics: true }), new TextRun('.')] }),
          new Paragraph({ text: 'Scene 2', heading: HeadingLevel.HEADING_3 }),
          p(LONG_SUMMARY),
          p(LONG_SUMMARY),
          new Paragraph({ text: 'Chapter 2: Der Streit', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Scene 1', heading: HeadingLevel.HEADING_3 }),
          p('»Wo warst du?«'),
          p('»Weg.«'),
          p('Sie schwiegen.'),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

async function ncZip(prefix = ''): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(`${prefix}novel.docx`, await ncDocx());
  const entry = (front: string, body: string) => `---\n${front}\n---\n${body}`;
  zip.file(
    `${prefix}characters/carla-3AAAAAAAAAAAAAAAAAAAAAAAAAA/metadata.json`,
    JSON.stringify({
      id: '3AAAAAAAAAAAAAAAAAAAAAAAAAA',
      attributes: { type: 'character', name: 'Carla Lindner', color: 'pink', aliases: ['Carla', 'Carla Lindner'], tags: ['Protagonist'], alwaysIncludeInContext: false, doNotTrack: false, noAutoInclude: false },
      relationships: { nestedEntries: ['3BBBBBBBBBBBBBBBBBBBBBBBBBB'] },
      links: { externalReferences: [] },
    }),
  );
  zip.file(
    `${prefix}characters/carla-3AAAAAAAAAAAAAAAAAAAAAAAAAA/entry.md`,
    entry('type: character\nname: Carla Lindner\naliases:\n  - Carla\nfields:\n  Alter: "23"\n  Beruf: Studentin', '**Alter:** 23\n\nStudiert Geschichte.'),
  );
  zip.file(
    `${prefix}locations/cafe-3BBBBBBBBBBBBBBBBBBBBBBBBBB/metadata.json`,
    JSON.stringify({ id: '3BBBBBBBBBBBBBBBBBBBBBBBBBB', attributes: { type: 'location', name: 'Café Luna', aliases: [], tags: [], alwaysIncludeInContext: false } }),
  );
  zip.file(`${prefix}locations/cafe-3BBBBBBBBBBBBBBBBBBBBBBBBBB/entry.md`, entry('type: location\nname: Café Luna\nfields: {}', 'Kleines Café.'));
  zip.file(
    `${prefix}other/genre-3CCCCCCCCCCCCCCCCCCCCCCCCCC/metadata.json`,
    JSON.stringify({ id: '3CCCCCCCCCCCCCCCCCCCCCCCCCC', attributes: { type: 'other', name: 'Genre', alwaysIncludeInContext: true, doNotTrack: true } }),
  );
  zip.file(`${prefix}other/genre-3CCCCCCCCCCCCCCCCCCCCCCCCCC/entry.md`, entry('type: other\nname: Genre', 'Liebesroman.'));
  zip.file(
    `${prefix}other/ai-isms-3DDDDDDDDDDDDDDDDDDDDDDDDDD/metadata.json`,
    JSON.stringify({ id: '3DDDDDDDDDDDDDDDDDDDDDDDDDD', attributes: { type: 'other', name: 'AI-isms', aliases: ['irgendwie'], doNotTrack: true } }),
  );
  zip.file(`${prefix}snippets/2026-03-02 1 - 3Xk8pQ2a.md`, entry('title: "1"\nfavourite: false', '**Scene 1 – Beats**\n\n1. Carla kommt.'));
  zip.file(`${prefix}snippets/2026-03-05 3Lm4nR7t.md`, entry('title: ""\nfavourite: false', '*Carla:*\n\n*Hannes:*'));
  zip.file(`${prefix}chats/2026-03-04 3Gh6vW9c.md`, entry('title: ""\nfavourite: false', '## User\nErstelle mir die Beats\n\n## AI\n1. Erster Beat\n2. Zweiter Beat\n\n## User\nDanke'));
  zip.file(`${prefix}codex.html`, '<html></html>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

beforeAll(async () => {
  db = openDb(':memory:');
  // Meldungen auf Deutsch prüfen (Standard beim ersten Start wäre Englisch)
  updateAppSettings(db, { language: 'de' });
  seedBuiltins(db);
  app = await buildApp(db, { serveWeb: false });
});

afterAll(async () => {
  await app.close();
  db.close();
});

describe('Hilfsfunktionen', () => {
  it('Frontmatter', () => {
    const { data, body } = parseFrontmatter('---\ntitle: "12"\nfavourite: false\naliases:\n  - A\n  - B\ncolor: null\nfields: {}\ntags: []\n---\nText\n');
    expect(data).toEqual({ title: '12', favourite: false, aliases: ['A', 'B'], color: null, fields: {}, tags: [] });
    expect(body).toBe('Text');
    expect(parseFrontmatter('Nur Text').body).toBe('Nur Text');
  });

  it('Chat-Markdown', () => {
    expect(parseChatMarkdown('## User\nHallo\n\n## AI\nAntwort\nzweite Zeile\n')).toEqual([
      { role: 'user', content: 'Hallo' },
      { role: 'assistant', content: 'Antwort\nzweite Zeile' },
    ]);
  });

  it('Überschriften und Heuristik', () => {
    expect(cleanHeading('Chapter 3')).toBe('');
    expect(cleanHeading('Kapitel 2: Der Streit')).toBe('Der Streit');
    expect(cleanHeading('Ein Anfang')).toBe('Ein Anfang');
    expect(looksLikeSummary([{ plain: LONG_SUMMARY }])).toBe(true);
    expect(looksLikeSummary([{ plain: '»Hallo«' }, { plain: '»Wer da?«' }, { plain: 'Sie ging.' }])).toBe(false);
  });
});

describe('Import', () => {
  it('Novelcrafter-docx: Zusammenfassung über der Linie, Prosa darunter', async () => {
    const data = (await ncDocx()).toString('base64');
    const pv = await api<ImportPreview>('POST', '/api/import/analyze', { filename: 'x.docx', data, options: NC_FORMAT });
    expect(pv).toMatchObject({ kind: 'docx', format: 'novelcrafter', detected: 'novelcrafter', title: 'Testroman', author: 'Jane Doe', acts: 1, chapters: 2, scenes: 3, separatorLines: 1, separated: 1, unseparated: { summary: 1, prose: 1 } });

    const r = await api<ImportResult>('POST', '/api/import', { filename: 'x.docx', data, options: NC_FORMAT });
    expect(r).toMatchObject({ chapters: 2, scenes: 3, summaries: 2, proseScenes: 2, volumeNumber: null });
    const o = await api<Outline>('GET', `/api/novels/${r.novelId}/outline`);
    expect(o.novel.title).toBe('Testroman');
    expect(o.novel.author).toBe('Jane Doe');
    const [ch1, ch2] = o.acts[0].chapters;
    expect(o.acts[0].title).toBe('');
    expect(ch1.title).toBe('');
    expect(ch2.title).toBe('Der Streit');
    expect(ch1.scenes.map((s) => s.title)).toEqual(['', '']);

    const s1 = await api<Scene>('GET', `/api/scenes/${ch1.scenes[0].id}`);
    expect(s1.summary).toBe('Carla trifft Hannes im Café.');
    expect(s1.text).toContain('Das Café war voll.');
    expect(s1.text).not.toContain('Carla trifft Hannes');
    expect(JSON.stringify(s1.content)).toContain('"italic"');

    // Szene ohne Linie mit langen Absätzen → nur Zusammenfassung, keine Prosa
    const s2 = await api<Scene>('GET', `/api/scenes/${ch1.scenes[1].id}`);
    expect(s2.summary).toBe(`${LONG_SUMMARY}\n\n${LONG_SUMMARY}`);
    expect(s2.wordCount).toBe(0);

    // Szene ohne Linie mit Dialog → Prosa
    const s3 = await api<Scene>('GET', `/api/scenes/${ch2.scenes[0].id}`);
    expect(s3.summary).toBe('');
    expect(s3.text).toContain('Wo warst du?');
  });

  it('Optionen: Text ohne Linie erzwingen, Linie als Szenenumbruch', async () => {
    const data = (await ncDocx()).toString('base64');
    const asProse = await api<ImportResult>('POST', '/api/import', { filename: 'x.docx', data, options: { ...NC_FORMAT, unseparated: 'prose' } });
    expect(asProse).toMatchObject({ summaries: 1, proseScenes: 3 });
    const asSummary = await api<ImportResult>('POST', '/api/import', { filename: 'x.docx', data, options: { ...NC_FORMAT, unseparated: 'summary', title: 'Eigener Titel' } });
    expect(asSummary).toMatchObject({ summaries: 3, proseScenes: 1 });
    expect((await api('GET', `/api/novels/${asSummary.novelId}`)).title).toBe('Eigener Titel');
    const breaks = await api<ImportPreview>('POST', '/api/import/analyze', { filename: 'x.docx', data, options: { ...NC_FORMAT, separator: 'scene-break' } });
    expect(breaks).toMatchObject({ scenes: 4, separatorLines: 1, separated: 0 });
  });

  it('komplettes Novelcrafter-Zip mit Kodex, Snippets und Chats', async () => {
    const data = (await ncZip('export-ordner/')).toString('base64');
    const pv = await api<ImportPreview>('POST', '/api/import/analyze', { filename: '2026-11-06 13-29-48 testroman - full.zip', data });
    expect(pv).toMatchObject({ kind: 'novelcrafter-zip', format: 'novelcrafter', detected: 'novelcrafter', title: 'Testroman', scenes: 3, snippets: 2, chats: 1, codex: { total: 4, byType: { character: 1, location: 1, other: 2 } } });

    const r = await api<ImportResult>('POST', '/api/import', { filename: 'testroman.zip', data });
    expect(r).toMatchObject({ codex: 4, snippets: 2, chats: 1 });

    const codex = await api<{ entries: any[]; relations: any[] }>('GET', `/api/novels/${r.novelId}/codex`);
    const carla = codex.entries.find((e) => e.name === 'Carla Lindner');
    expect(carla).toMatchObject({ type: 'character', aliases: ['Carla'], tags: ['Protagonist'], color: 'pink', inclusion: 'auto', description: '**Alter:** 23\n\nStudiert Geschichte.' });
    expect(carla.fields).toEqual([
      { key: 'Alter', value: '23' },
      { key: 'Beruf', value: 'Studentin' },
    ]);
    expect(codex.entries.find((e) => e.name === 'Genre').inclusion).toBe('always');
    expect(codex.entries.find((e) => e.name === 'AI-isms')).toMatchObject({ inclusion: 'never', aliases: ['irgendwie'], description: '' });
    const cafe = codex.entries.find((e) => e.name === 'Café Luna');
    expect(codex.relations.some((x) => (x.aId === carla.id && x.bId === cafe.id) || (x.aId === cafe.id && x.bId === carla.id))).toBe(true);

    const snippets = await api<any[]>('GET', `/api/novels/${r.novelId}/snippets`);
    expect(snippets.map((s) => s.title).sort()).toEqual(['1', 'Carla:']);
    expect(snippets.every((s) => s.pinned === false)).toBe(true);

    const chats = await api<any[]>('GET', `/api/novels/${r.novelId}/chats`);
    expect(chats).toHaveLength(1);
    expect(chats[0].title).toBe('Erstelle mir die Beats');
    expect(chats[0].promptId).toBeTruthy();
    const chat = await api('GET', `/api/chats/${chats[0].id}`);
    expect(chat.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(chat.messages[1].content).toBe('1. Erster Beat\n2. Zweiter Beat');
  });

  it('Zip-Teile lassen sich abwählen', async () => {
    const data = (await ncZip()).toString('base64');
    const r = await api<ImportResult>('POST', '/api/import', { filename: 't.zip', data, options: { codex: false, snippets: false, chats: false } });
    expect(r).toMatchObject({ codex: 0, snippets: 0, chats: 0, scenes: 3 });
  });

  it('Fehler bei Unsinn und leerem Zip', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/import/analyze', payload: { filename: 'x.docx', data: Buffer.from('hallo').toString('base64') } });
    expect(bad.statusCode).toBe(400);
    const unknown = await app.inject({ method: 'POST', url: '/api/import/analyze', payload: { filename: 'x.pdf', data: Buffer.from('hallo').toString('base64') } });
    expect(unknown.statusCode).toBe(400);
    const empty = new JSZip();
    empty.file('readme.txt', 'x');
    const zipData = (await empty.generateAsync({ type: 'nodebuffer' })).toString('base64');
    const res = await app.inject({ method: 'POST', url: '/api/import', payload: { filename: 'x.zip', data: zipData } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Manuskript');
    const nc = await app.inject({ method: 'POST', url: '/api/import', payload: { filename: 'x.zip', data: zipData, options: NC_FORMAT } });
    expect(nc.statusCode).toBe(400);
    expect(nc.json().error).toContain('novel.docx');
  });
});

/** Zip im einfachen Format: zwei Manuskript-Dateien, Kontext-Ordner mit Unterordnern, Snippets, Systemmüll. */
async function simpleZip(): Promise<Buffer> {
  const zip = new JSZip();
  const root = 'Mein Roman/';
  zip.file(`${root}10 - Ende.md`, 'Das Ende kommt.');
  zip.file(`${root}2 - Anfang.txt`, 'Der Anfang.\nNoch ein Absatz.');
  zip.file(`${root}Kontext/Figuren/Anna.md`, '---\naliases: Anni, Frau Berg\nimmer: true\nAlter: 31\n---\nAnna ist **Ärztin**.');
  zip.file(`${root}Kontext/Lore.txt`, 'Die Stadt liegt am Meer.');
  zip.file(`${root}kontext/Orte/Hafen.md`, 'Der Hafen.');
  zip.file(`${root}Snippets/Idee.md`, 'Eine Idee.');
  zip.file(`${root}.DS_Store`, 'x');
  zip.file('__MACOSX/Mein Roman/._Anna.md', 'x');
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('Einfacher Import', () => {
  it('Markdown-Inline und Text-Absätze', () => {
    expect(mdInlineToHtml('**a** *b* _c_ snake_case 2*3*4 \\*x\\* <tag>')).toBe('<strong>a</strong> <em>b</em> <em>c</em> snake_case 2*3*4 *x* &lt;tag&gt;');
    // ohne Leerzeilen: jede Zeile ein Absatz; "Kapitel …" wird Überschrift
    const lines = readTextContent('Kapitel 1\nErster Absatz.\nZweiter Absatz.\nKapitel 2: Heimkehr\nDritter.', 'text');
    expect(lines.blocks.map((b) => [b.kind, b.plain])).toEqual([
      ['heading', 'Kapitel 1'],
      ['para', 'Erster Absatz.'],
      ['para', 'Zweiter Absatz.'],
      ['heading', 'Kapitel 2: Heimkehr'],
      ['para', 'Dritter.'],
    ]);
    // mit Leerzeilen: umbrochene Zeilen gehören zum selben Absatz
    const groups = readTextContent('Ein langer\numbrochener Absatz.\n\nZweiter.\n', 'text');
    expect(groups.blocks.map((b) => b.plain)).toEqual(['Ein langer umbrochener Absatz.', 'Zweiter.']);
  });

  it('docx: alles ist Prosa, Linien trennen Szenen', async () => {
    const data = (await ncDocx()).toString('base64');
    const pv = await api<ImportPreview>('POST', '/api/import/analyze', { filename: 'x.docx', data });
    expect(pv).toMatchObject({ kind: 'docx', format: 'simple', detected: 'novelcrafter', chapters: 2, scenes: 4, separated: 0, unseparated: { summary: 0, prose: 0 }, emptyScenes: 0 });
    const r = await api<ImportResult>('POST', '/api/import', { filename: 'x.docx', data });
    expect(r).toMatchObject({ scenes: 4, summaries: 0, proseScenes: 4 });
    const o = await api<Outline>('GET', `/api/novels/${r.novelId}/outline`);
    const [a, b, c] = o.acts[0].chapters[0].scenes;
    expect((await api<Scene>('GET', `/api/scenes/${a.id}`)).text).toBe('Carla trifft Hannes im Café.');
    const s2 = await api<Scene>('GET', `/api/scenes/${b.id}`);
    expect(s2.summary).toBe('');
    expect(s2.text).toContain('Das Café war voll.');
    // lange Absätze ohne Dialog bleiben im einfachen Format Prosa
    expect((await api<Scene>('GET', `/api/scenes/${c.id}`)).text).toContain('Carla kommt nach der Schicht');
  });

  it('Markdown-Datei mit Frontmatter, Kapiteln, Szenentrenner und Hervorhebungen', async () => {
    const md =
      '---\ntitle: Mein Roman\nauthor: Anna Autorin\n---\n# Kapitel 1: Aufbruch\n\nEs war **sehr** kalt und *still*.\nZweite Zeile desselben Absatzes.\n\n»Los«, sagte sie.\n\n* * *\n\nAm nächsten Morgen.\n\n# Kapitel 2\n\nEnde_mit_unterstrich bleibt.\n';
    const data = Buffer.from(md).toString('base64');
    const pv = await api<ImportPreview>('POST', '/api/import/analyze', { filename: 'roman.md', data });
    expect(pv).toMatchObject({ kind: 'markdown', format: 'simple', detected: 'simple', title: 'Mein Roman', author: 'Anna Autorin', chapters: 2, scenes: 3, files: 1 });
    const r = await api<ImportResult>('POST', '/api/import', { filename: 'roman.md', data });
    const o = await api<Outline>('GET', `/api/novels/${r.novelId}/outline`);
    expect(o.novel.author).toBe('Anna Autorin');
    const [ch1, ch2] = o.acts[0].chapters;
    expect([ch1.title, ch2.title]).toEqual(['Aufbruch', '']);
    expect(ch1.scenes).toHaveLength(2);
    const s1 = await api<Scene>('GET', `/api/scenes/${ch1.scenes[0].id}`);
    expect(s1.text).toContain('Es war sehr kalt und still. Zweite Zeile desselben Absatzes.');
    expect(JSON.stringify(s1.content)).toContain('"bold"');
    expect(JSON.stringify(s1.content)).toContain('"italic"');
    expect((await api<Scene>('GET', `/api/scenes/${ch2.scenes[0].id}`)).text).toBe('Ende_mit_unterstrich bleibt.');
  });

  it('Text-Datei: Teil/Kapitel-Zeilen, Windows-1252', async () => {
    const txt = 'Teil 1\n\nKapitel 1\n\nGrüße aus Köln.\n\nKapitel 2: Heimkehr\n\nZurück.\n';
    const data = Buffer.from(txt, 'latin1').toString('base64');
    const r = await api<ImportResult>('POST', '/api/import', { filename: 'Mein Buch.txt', data });
    const o = await api<Outline>('GET', `/api/novels/${r.novelId}/outline`);
    expect(o.novel.title).toBe('Mein Buch');
    expect(o.acts).toHaveLength(1);
    expect(o.acts[0].chapters.map((c) => c.title)).toEqual(['', 'Heimkehr']);
    expect((await api<Scene>('GET', `/api/scenes/${o.acts[0].chapters[0].scenes[0].id}`)).text).toBe('Grüße aus Köln.');
  });

  it('Zip: Manuskript-Dateien als Kapitel, Kontext-Ordner als Kodex, Snippets', async () => {
    const data = (await simpleZip()).toString('base64');
    const pv = await api<ImportPreview>('POST', '/api/import/analyze', { filename: 'x.zip', data });
    expect(pv).toMatchObject({
      kind: 'zip',
      format: 'simple',
      detected: 'simple',
      title: 'Mein Roman',
      files: 2,
      chapters: 2,
      scenes: 2,
      snippets: 1,
      chats: 0,
      codex: { total: 3, byType: { character: 1, location: 1, other: 1 } },
    });
    const r = await api<ImportResult>('POST', '/api/import', { filename: 'x.zip', data });
    expect(r).toMatchObject({ chapters: 2, codex: 3, snippets: 1 });
    const o = await api<Outline>('GET', `/api/novels/${r.novelId}/outline`);
    expect(o.acts[0].chapters.map((c) => c.title)).toEqual(['Anfang', 'Ende']);
    expect((await api<Scene>('GET', `/api/scenes/${o.acts[0].chapters[0].scenes[0].id}`)).text).toBe('Der Anfang.\n\nNoch ein Absatz.');

    const codex = await api<{ entries: any[] }>('GET', `/api/novels/${r.novelId}/codex`);
    expect(codex.entries.find((e) => e.name === 'Anna')).toMatchObject({
      type: 'character',
      aliases: ['Anni', 'Frau Berg'],
      inclusion: 'always',
      fields: [{ key: 'Alter', value: '31' }],
      description: 'Anna ist **Ärztin**.',
    });
    expect(codex.entries.find((e) => e.name === 'Lore')).toMatchObject({ type: 'other', inclusion: 'auto', description: 'Die Stadt liegt am Meer.' });
    expect(codex.entries.find((e) => e.name === 'Hafen')).toMatchObject({ type: 'location' });
    const snippets = await api<any[]>('GET', `/api/novels/${r.novelId}/snippets`);
    expect(snippets.map((s) => [s.title, s.text])).toEqual([['Idee', 'Eine Idee.']]);
  });

  it('Zip mit Backslash-Pfaden (Windows PowerShell 5.1) wird wie mit „/“ gelesen', async () => {
    const zip = new JSZip();
    zip.file('Manuskript.md', '# Kapitel 1\n\nDer Anfang.');
    zip.file('Kontext\\Figuren\\Anna.md', 'aliases: Anni\n\nAnna ist Ärztin.');
    zip.file('Kontext\\Orte\\Hafen.md', 'Der Hafen.');
    zip.file('Snippets\\Idee.md', 'Eine Idee.');
    const data = (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64');
    const pv = await api<ImportPreview>('POST', '/api/import/analyze', { filename: 'x.zip', data });
    expect(pv).toMatchObject({ files: 1, chapters: 1, snippets: 1, codex: { total: 2, byType: { character: 1, location: 1 } } });
  });

  it('Novelcrafter-Zip lässt sich auch einfach importieren (nur Manuskript und Snippets)', async () => {
    const data = (await ncZip()).toString('base64');
    const pv = await api<ImportPreview>('POST', '/api/import/analyze', { filename: 'x.zip', data, options: { format: 'simple' } });
    expect(pv).toMatchObject({ kind: 'zip', format: 'simple', detected: 'novelcrafter', files: 1, scenes: 4, codex: { total: 0 }, snippets: 2, chats: 0 });
  });

  it('Import als nächster Band einer bestehenden Serie', async () => {
    const n = await api('POST', '/api/novels', { title: 'Band eins', author: 'A. Autor', language: 'English (US)', tense: 'present' });
    db.prepare("INSERT INTO series (id, title, description, created_at, updated_at) VALUES ('serie-1', 'Saga', '', 'x', 'x')").run();
    db.prepare("UPDATE novels SET series_id = 'serie-1', volume_number = 1 WHERE id = ?").run(n.id);
    const data = Buffer.from('Kapitel 1\nWeiter geht es.').toString('base64');
    const r = await api<ImportResult>('POST', '/api/import', { filename: 'band2.txt', data, options: { seriesId: 'serie-1' } });
    expect(r.volumeNumber).toBe(2);
    const v2 = await api('GET', `/api/novels/${r.novelId}`);
    expect(v2).toMatchObject({ seriesId: 'serie-1', volumeNumber: 2, language: 'English (US)', tense: 'present', author: 'A. Autor' });
    const bad = await app.inject({ method: 'POST', url: '/api/import', payload: { filename: 'b.txt', data, options: { seriesId: 'gibt-es-nicht' } } });
    expect(bad.statusCode).toBe(400);
  });
});

describe('Snippets anheften', () => {
  it('pinned umschalten ändert nicht das Änderungsdatum', async () => {
    const n = await api('POST', '/api/novels', { title: 'Pin' });
    const s = await api('POST', `/api/novels/${n.id}/snippets`, { title: 'Notiz', text: 'x' });
    expect(s.pinned).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    const pinned = await api('PATCH', `/api/snippets/${s.id}`, { pinned: true });
    expect(pinned.pinned).toBe(true);
    expect(pinned.updatedAt).toBe(s.updatedAt);
    const edited = await api('PATCH', `/api/snippets/${s.id}`, { text: 'y' });
    expect(edited.pinned).toBe(true);
    expect(edited.updatedAt).not.toBe(s.updatedAt);
  });

  it('alte Datenbank bekommt die Spalte nachgerüstet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nm-migrate-'));
    const file = join(dir, 'old.db');
    const old = new Database(file);
    old.exec("CREATE TABLE snippets (id TEXT PRIMARY KEY, novel_id TEXT, series_id TEXT, title TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
    old.exec("INSERT INTO snippets (id, title, created_at, updated_at) VALUES ('a', 'Alt', 'x', 'x')");
    old.close();
    const migrated = openDb(file);
    expect((migrated.prepare('SELECT pinned FROM snippets WHERE id = ?').get('a') as { pinned: number }).pinned).toBe(0);
    migrated.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

// Eigene Novelcrafter-Exporte (nie im Repo): alle Zips aus NOVELMAKER_NC_EXPORTS bzw. NC-Data/ (in .gitignore).
const NC_DIR = process.env.NOVELMAKER_NC_EXPORTS ?? join(ROOT_DIR, 'NC-Data');
const ncZips = existsSync(NC_DIR) ? readdirSync(NC_DIR).filter((f) => f.toLowerCase().endsWith('.zip')) : [];
describe.skipIf(!ncZips.length)('eigene Novelcrafter-Exporte (lokal)', () => {
  it.each(ncZips)('%s: Vorschau und Import stimmen überein', async (name) => {
    const data = readFileSync(join(NC_DIR, name)).toString('base64');
    const pv = await api<ImportPreview>('POST', '/api/import/analyze', { filename: name, data });
    expect(pv.detected).toBe('novelcrafter');
    expect(pv.scenes).toBeGreaterThan(0);
    const r = await api<ImportResult>('POST', '/api/import', { filename: name, data });
    expect(r).toMatchObject({ scenes: pv.scenes, codex: pv.codex.total, snippets: pv.snippets, chats: pv.chats });
  });
});
