import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { openDb, ROOT_DIR, type DB } from '../src/db';
import { seedBuiltins } from '../src/repo/prompts';
import { updateAppSettings } from '../src/repo/settings';
import { docToPlainText, newBlockSpec, type Outline, type PMDoc, type Prompt } from '@novelmaker/shared';

const sample = (n: string) => readFileSync(join(ROOT_DIR, 'shared', 'test', 'novelcrafter', n), 'utf8');

let db: DB;
let app: FastifyInstance;
let llm: Server;
let llmUrl = '';
let lastLlmBody: any = null;

async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await app.inject({ method: method as any, url, payload: body as any });
  if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`);
  return res.json() as T;
}

function sseEvents(raw: string) {
  return raw
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const ev = /event: (.*)/.exec(block)?.[1];
      const data = /data: (.*)/.exec(block)?.[1];
      return { event: ev, data: data ? JSON.parse(data) : null };
    });
}

beforeAll(async () => {
  // Mock eines OpenAI-kompatiblen Servers
  llm = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url?.endsWith('/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'test/model', name: 'Test', context_length: 8000, pricing: { prompt: '0.000001', completion: '0.000002' } }] }));
        return;
      }
      lastLlmBody = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const chunks = ['Hallo ', 'Welt. ', '1. Erster Beat\n2. Zweiter Beat'];
      for (const c of chunks) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20 } })}\n\n`);
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise<void>((r) => llm.listen(0, '127.0.0.1', () => r()));
  const addr = llm.address() as { port: number };
  llmUrl = `http://127.0.0.1:${addr.port}/v1`;

  db = openDb(':memory:');
  // Die Tests prüfen deutsche Prompts und Meldungen (Standard beim ersten Start wäre Englisch)
  updateAppSettings(db, { language: 'de' });
  seedBuiltins(db);
  app = await buildApp(db, { serveWeb: false });
});

afterAll(async () => {
  await app.close();
  llm.close();
  db.close();
});

describe('API', () => {
  let novelId = '';
  let outline: Outline;

  it('legt einen Roman mit Grundgerüst an', async () => {
    const n = await api('POST', '/api/novels', { title: 'Test' });
    novelId = n.id;
    outline = await api('GET', `/api/novels/${novelId}/outline`);
    expect(outline.acts).toHaveLength(1);
    expect(outline.acts[0].chapters).toHaveLength(1);
    expect(outline.acts[0].chapters[0].scenes).toHaveLength(1);
  });

  it('speichert Szenen, zählt Wörter, teilt und verschiebt', async () => {
    const sceneId = outline.acts[0].chapters[0].scenes[0].id;
    const content: PMDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Carla traf Marias Bruder.' }] },
        { type: 'beat', attrs: { id: 'b1' }, content: [{ type: 'text', text: 'Beat-Text zählt nicht' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Zweiter Absatz hier.' }] },
      ],
    };
    const meta = await api('PATCH', `/api/scenes/${sceneId}`, { content, summary: 'Carla trifft Marias Bruder.' });
    expect(meta.wordCount).toBe(7);
    const split = await api('POST', `/api/scenes/${sceneId}/split`, {
      before: { type: 'doc', content: content.content.slice(0, 2) },
      after: { type: 'doc', content: content.content.slice(2) },
      mode: 'chapter',
      title: 'Zweites Kapitel',
    });
    outline = await api('GET', `/api/novels/${novelId}/outline`);
    expect(outline.acts[0].chapters.map((c) => c.title)).toEqual(['', 'Zweites Kapitel']);
    expect(outline.acts[0].chapters[1].scenes[0].id).toBe(split.sceneId);
    // Szene zurück ins erste Kapitel an Position 0
    await api('POST', `/api/scenes/${split.sceneId}/move`, { chapterId: outline.acts[0].chapters[0].id, index: 0 });
    outline = await api('GET', `/api/novels/${novelId}/outline`);
    expect(outline.acts[0].chapters[0].scenes.map((s) => s.id)).toEqual([split.sceneId, sceneId]);
    const snaps = await api('GET', `/api/scenes/${sceneId}/snapshots`);
    expect(snaps.length).toBe(1);
  });

  it('Kodex, Serienumwandlung und neuer Band', async () => {
    const maria = await api('POST', `/api/novels/${novelId}/codex`, { name: 'Maria', description: 'Freundin' });
    await api('POST', `/api/novels/${novelId}/codex`, { name: 'AI-isms', type: 'other', inclusion: 'never', aliases: ['irgendwie'] });
    const carla = await api('POST', `/api/novels/${novelId}/codex`, { name: 'Carla', description: 'Erzählerin' });
    await api('PATCH', `/api/novels/${novelId}`, { povCharacterId: carla.id, povType: 'first' });
    const series = await api('POST', `/api/novels/${novelId}/convert-to-series`, { title: 'Serie', codexIds: [maria.id, carla.id] });
    const v2 = await api('POST', `/api/series/${series.id}/volumes`, {});
    expect(v2.volumeNumber).toBe(2);
    expect(v2.povCharacterId).toBe(carla.id);
    const c2 = await api('GET', `/api/novels/${v2.id}/codex`);
    expect(c2.entries.map((e: any) => e.name).sort()).toEqual(['Carla', 'Maria']);
  });

  it('importiert Novelcrafter-Prompts und rendert den Beat-Prompt ohne Warnung', async () => {
    const r = await api('POST', '/api/prompts/import', { text: sample('beat-prompt.clipboard.txt') });
    expect(r.warnings).toEqual([]);
    const comp = await api('POST', '/api/prompts/import', { text: sample('component-codex.clipboard.txt') });
    expect(comp.replaced).toBe(true);
    // „Novelcrafter/Codex“ ersetzt die mitgelieferte „Novelmaker/Codex“
    expect(comp.prompt.name).toBe('Novelmaker/Codex');
    const sceneId = outline.acts[0].chapters[0].scenes[1].id;
    const preview = await api('POST', '/api/preview', {
      kind: 'beat',
      promptId: r.prompt.id,
      novelId,
      sceneId,
      message: 'Carla geht nach Hause.',
      textBefore: 'Carla traf Marias Bruder.',
      textAfter: '',
      inputs: { Words: '200' },
    });
    expect(preview.warnings).toEqual([]);
    expect(preview.messages.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(preview.messages[0].content).toContain('AVOID the following words and style: irgendwie.');
    expect(preview.messages[1].content).toContain('<character name="Maria">');
    expect(preview.messages[3].content).toContain('Schreibe in der Ich-Perspektive aus Sicht von Carla.');
    const exp = await api('GET', `/api/prompts/${r.prompt.id}/export`);
    expect(exp.text.length).toBeGreaterThan(100);
  });

  it('stellt alte Komponentennamen „Novelcrafter/…“ auf „Novelmaker/…“ um', async () => {
    const t = new Date().toISOString();
    db.prepare("INSERT INTO prompts (id, type, name, messages, inputs, origin, created_at, updated_at) VALUES ('old-comp', 'component', 'Novelcrafter/Eigene', '[]', '[]', 'imported', ?, ?)").run(t, t);
    db.prepare(
      "INSERT INTO prompts (id, type, name, messages, inputs, origin, created_at, updated_at) VALUES ('old-user', 'scene-beat-completion', 'Alt', ?, '[]', 'imported', ?, ?)",
    ).run(JSON.stringify([{ type: 'user', text: '{include("Novelcrafter/Eigene")} {include("Novelcrafter/Codex")}' }]), t, t);
    seedBuiltins(db);
    expect((db.prepare("SELECT name FROM prompts WHERE id = 'old-comp'").get() as { name: string }).name).toBe('Novelmaker/Eigene');
    const text = JSON.parse((db.prepare("SELECT messages FROM prompts WHERE id = 'old-user'").get() as { messages: string }).messages)[0].text;
    expect(text).toBe('{include("Novelmaker/Eigene")} {include("Novelmaker/Codex")}');
  });

  it('entfernt die frühere Platzhalter-Komponente „Novelmaker/Personas“ samt include()', async () => {
    const t = new Date().toISOString();
    const empty = JSON.stringify([{ type: 'system', text: '{! Personas sind nicht vorgesehen. !}' }]);
    db.prepare(
      "INSERT INTO prompts (id, type, name, messages, inputs, origin, builtin_key, lang, created_at, updated_at) VALUES ('personas', 'component', 'Novelmaker/Personas', ?, '[]', 'builtin', 'component:personas', 'de', ?, ?)",
    ).run(empty, t, t);
    db.prepare("INSERT INTO prompt_texts (prompt_id, lang, name, description, messages, inputs, updated_at) VALUES ('personas', 'de', 'Novelmaker/Personas', '', ?, '[]', ?)").run(empty, t);
    db.prepare(
      "INSERT INTO prompts (id, type, name, messages, inputs, origin, created_at, updated_at) VALUES ('uses-personas', 'scene-beat-completion', 'Mit Personas', ?, '[]', 'imported', ?, ?)",
    ).run(JSON.stringify([{ type: 'user', text: '{include("Novelcrafter/Personas")}\n\n{include("Novelmaker/Codex")}' }]), t, t);
    seedBuiltins(db);
    expect(db.prepare("SELECT id FROM prompts WHERE id = 'personas'").get()).toBeUndefined();
    expect(db.prepare("SELECT prompt_id FROM prompt_texts WHERE prompt_id = 'personas'").get()).toBeUndefined();
    const text = JSON.parse((db.prepare("SELECT messages FROM prompts WHERE id = 'uses-personas'").get() as { messages: string }).messages)[0].text;
    expect(text).toBe('{include("Novelmaker/Codex")}');

    // selbst befüllt: bleibt als eigene Komponente, include() bleibt
    db.prepare(
      "INSERT INTO prompts (id, type, name, messages, inputs, origin, builtin_key, lang, created_at, updated_at) VALUES ('personas-own', 'component', 'Novelmaker/Personas', ?, '[]', 'builtin', 'component:personas', 'de', ?, ?)",
    ).run(JSON.stringify([{ type: 'system', text: 'Du bist Carla.' }]), t, t);
    seedBuiltins(db);
    expect(db.prepare("SELECT builtin_key, origin FROM prompts WHERE id = 'personas-own'").get()).toEqual({ builtin_key: null, origin: 'custom' });
  });

  it('Kodex: Band-Kopien von Serien-Einträgen – Band-Fassung gilt, Doppel zusammenführen', async () => {
    const n1 = await api('POST', '/api/novels', { title: 'Serie-Doppel 1' });
    const anna = await api('POST', `/api/novels/${n1.id}/codex`, { name: 'Anna', description: 'Lehrerin', aliases: ['Annie'] });
    const ben = await api('POST', `/api/novels/${n1.id}/codex`, { name: 'Ben', description: 'Bruder' });
    const series = await api('POST', `/api/novels/${n1.id}/convert-to-series`, { title: 'Doppel-Serie', codexIds: [anna.id, ben.id] });
    await api('POST', `/api/codex/${anna.id}/relations`, { otherId: ben.id, label: 'Geschwister' });
    const v2 = await api('POST', `/api/series/${series.id}/volumes`, {});
    // wie nach dem Import eines Bandes: Anna identisch kopiert, Ben mit eigener Fassung
    const annaCopy = await api('POST', `/api/novels/${v2.id}/codex`, { name: 'Anna', description: 'Lehrerin', aliases: ['Annie'] });
    await api('POST', `/api/novels/${v2.id}/codex`, { name: 'ben', description: 'Bruder, inzwischen Polizist' });
    await api('POST', `/api/codex/${annaCopy.id}/relations`, { otherId: ben.id, label: 'Geschwister' });
    await api('PATCH', `/api/novels/${v2.id}`, { povCharacterId: annaCopy.id });

    const v2Outline: Outline = await api('GET', `/api/novels/${v2.id}/outline`);
    const sceneId = v2Outline.acts[0].chapters[0].scenes[0].id;
    await api('PATCH', `/api/scenes/${sceneId}`, { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Annie traf Ben.' }] }] } });
    const beat = (await api<Prompt[]>('GET', '/api/prompts')).find((p) => p.builtinKey === 'beat')!;
    const render = () => api('POST', '/api/preview', { kind: 'beat', promptId: beat.id, novelId: v2.id, sceneId, message: 'Weiter.', textBefore: 'Annie traf Ben.' });

    // jeder Name nur einmal; bei Ben die Band-Fassung
    let r = await render();
    const names = r.codex.map((c: any) => c.name.toLowerCase()).sort();
    expect(names).toEqual(['anna', 'ben']);
    const all = r.messages.map((m: any) => m.content).join('\n');
    expect(all).toContain('inzwischen Polizist');
    expect(all.match(/Lehrerin/g)).toHaveLength(1);

    const dup = await api('GET', `/api/novels/${v2.id}/codex/duplicates`);
    expect(dup.identical.map((d: any) => d.name)).toEqual(['Anna']);
    expect(dup.variants.map((d: any) => d.name)).toEqual(['ben']);

    const merged = await api('POST', `/api/novels/${v2.id}/codex/merge-duplicates`);
    expect(merged).toEqual({ merged: 1, variants: 1 });
    const after = await api('GET', `/api/novels/${v2.id}/codex`);
    expect(after.entries.filter((e: any) => e.name === 'Anna').map((e: any) => e.id)).toEqual([anna.id]);
    expect((await api('GET', `/api/novels/${v2.id}`)).povCharacterId).toBe(anna.id); // POV umgehängt
    // Beziehung Anna–Ben gab es auf Serienebene schon: kein Doppel, Beschriftung bleibt
    const rels = after.relations.filter((x: any) => [x.aId, x.bId].includes(anna.id) && [x.aId, x.bId].includes(ben.id));
    expect(rels).toHaveLength(1);
    expect(rels[0].label).toBe('Geschwister');
    r = await render();
    expect(r.codex.find((c: any) => c.name === 'Anna').reason).toBe('pov');
    // Band 1 sieht weiter die Serien-Fassung von Ben
    expect((await api('GET', `/api/novels/${n1.id}/codex/duplicates`)).identical).toEqual([]);
  });

  it('POV: Szene weicht vom Roman ab, sonst gilt der Roman', async () => {
    const prompts: Prompt[] = await api('GET', '/api/prompts');
    const beat = prompts.find((p) => p.builtinKey === 'beat')!;
    const hannes = await api('POST', `/api/novels/${novelId}/codex`, { name: 'Hannes', type: 'character', description: 'Fischer' });
    const sceneId = outline.acts[0].chapters[0].scenes[0].id;
    const render = async () => {
      const r = await api('POST', '/api/preview', { kind: 'beat', promptId: beat.id, novelId, sceneId, message: 'Weiter.', textBefore: '' });
      return { text: r.messages.map((m: any) => m.content).join('\n'), pov: r.codex.find((c: any) => c.reason === 'pov')?.name };
    };
    // Roman: Carla, Ich-Perspektive (aus dem Serien-Test)
    let r = await render();
    expect(r.pov).toBe('Carla');
    expect(r.text).toMatch(/Ich-Perspektive[^\n]*Carla/);
    // Szene: Hannes, dritte Person
    await api('PATCH', `/api/scenes/${sceneId}`, { povCharacterId: hannes.id, povType: 'third-limited' });
    r = await render();
    expect(r.pov).toBe('Hannes');
    expect(r.text).toContain('Hannes');
    expect(r.text).not.toMatch(/Ich-Perspektive/);
    // zurück auf „wie Roman“
    await api('PATCH', `/api/scenes/${sceneId}`, { povCharacterId: null, povType: null });
    r = await render();
    expect(r.pov).toBe('Carla');
    await api('DELETE', `/api/codex/${hannes.id}`).catch(() => undefined);
  });

  it('Ehrliches Review: mitgelieferter Chat-Prompt mit Szene als Kontext', async () => {
    const prompts: Prompt[] = await api('GET', '/api/prompts');
    const review = prompts.find((p) => p.builtinKey === 'chat-review')!;
    expect(review.type).toBe('workshop-chat');
    expect(review.name).toBe('Ehrliches Review');
    const sceneId = outline.acts[0].chapters[0].scenes[0].id;
    const preview = await api('POST', '/api/preview', {
      kind: 'chat',
      promptId: review.id,
      novelId,
      message: 'Review bitte.',
      chatHistory: [],
      context: [{ type: 'scene', id: sceneId, mode: 'full', label: 'Szene 1' }],
    });
    expect(preview.warnings.filter((w: any) => w.level !== 'info')).toEqual([]);
    const sys = preview.messages[0].content as string;
    expect(preview.messages[0].role).toBe('system');
    expect(sys.startsWith('You are an avid reader.')).toBe(true);
    expect(sys).toContain('Use german language and grammar.');
    const scene = await api('GET', `/api/scenes/${sceneId}`);
    const sceneText = docToPlainText(scene.content);
    expect(sceneText.length).toBeGreaterThan(5);
    expect(sys).toContain(sceneText); // Szenentext als Kontext
    expect(sys).not.toContain('Antworte knapp'); // widerspräche den 2000 Wörtern
    expect(preview.messages.at(-1)).toEqual({ role: 'user', content: 'Review bitte.' });
  });

  it('Baustein-Prompts: Server erzeugt die Nachrichten, Typwechsel und Rendering', async () => {
    const builtins = await api('GET', '/api/prompts');
    // alle mitgelieferten außer den Komponenten sind Baustein-Prompts
    expect(builtins.filter((p: Prompt) => p.type !== 'component' && p.origin === 'builtin' && !p.blocks)).toEqual([]);
    const spec = newBlockSpec('workshop-chat');
    spec.role = 'Du bist eine ehrliche Lektorin. Bewerte nach {{Kriterium}}.';
    spec.options = [{ name: 'Kriterium', choices: ['Spannung', 'Dialoge'], default: 'Dialoge' }];
    const p = await api<Prompt>('POST', '/api/prompts', { type: 'workshop-chat', name: 'Review', blocks: spec });
    expect(p.blocks?.role).toContain('{{Kriterium}}');
    expect(p.messages[0].text).toContain('{input("Kriterium")}');
    expect(p.inputs.map((i) => i.name)).toEqual(['Kriterium', 'Kontext']);
    const preview = await api('POST', '/api/preview', { kind: 'chat', promptId: p.id, novelId, message: 'Wie ist Kapitel 1?', chatHistory: [] });
    expect(preview.warnings).toEqual([]);
    expect(preview.messages[0].content).toContain('Bewerte nach Dialoge.');
    // Typwechsel: Nachrichten werden aus den gespeicherten Bausteinen neu erzeugt
    const beat = await api<Prompt>('PATCH', `/api/prompts/${p.id}`, { type: 'scene-beat-completion' });
    expect(beat.messages.map((m) => m.type)).toContain('system');
    expect(beat.blocks).not.toBeNull();
    const dup = await api<Prompt>('POST', `/api/prompts/${p.id}/duplicate`);
    expect(dup.blocks?.role).toBe(spec.role);
  });

  it('Modellsammlung aus nc:models:1 importieren', async () => {
    const prov = await api('POST', '/api/providers', { name: 'Mock', kind: 'openrouter', baseUrl: llmUrl, apiKey: 'sk-test-1234' });
    expect(prov.apiKey).toBe('••••1234');
    const r = await api('POST', '/api/collections/import', { text: sample('models-collection.clipboard.txt'), providerId: prov.id });
    expect(r.collection.models).toHaveLength(4);
    expect(r.collection.models.find((m: any) => m.modelId === '~z-ai/glm-latest').name).toBe('~z-ai/glm-latest');
    expect(r.warnings.length).toBe(4); // Mock kennt nur test/model
  });

  it('generiert mit Streaming, leitet max_tokens aus „Words“ ab und protokolliert', async () => {
    const providers = await api('GET', '/api/providers');
    const prov = providers.find((p: any) => p.name === 'Mock');
    const prompts: Prompt[] = await api('GET', '/api/prompts');
    const beat = prompts.find((p) => p.builtinKey === 'beat')!;
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: {
        kind: 'beat',
        promptId: beat.id,
        model: { providerId: prov.id, modelId: 'test/model' },
        novelId,
        sceneId: outline.acts[0].chapters[0].scenes[0].id,
        message: 'Weiter',
        textBefore: '',
        inputs: { Words: '400' },
      },
    });
    const events = sseEvents(res.body);
    expect(events[0].event).toBe('meta');
    const text = events
      .filter((e) => e.event === 'delta')
      .map((e) => e.data.text)
      .join('');
    expect(text).toBe('Hallo Welt. 1. Erster Beat\n2. Zweiter Beat');
    const done = events.find((e) => e.event === 'done')!;
    expect(done.data.promptTokens).toBe(100);
    expect(done.data.cost).toBeCloseTo(100 * 0.000001 + 20 * 0.000002);
    expect(lastLlmBody.max_tokens).toBe(400 * 2 + 300);
    expect(lastLlmBody.stream).toBe(true);
    const logs = await api('GET', '/api/logs');
    expect(logs[0].status).toBe('ok');
  });

  it('schätzt Tokens und Kosten vor dem Generieren', async () => {
    const providers = await api('GET', '/api/providers');
    const prov = providers.find((p: any) => p.name === 'Mock');
    const model = { providerId: prov.id, modelId: 'test/model' };
    const prompts: Prompt[] = await api('GET', '/api/prompts');
    const beat = prompts.find((p) => p.builtinKey === 'beat')!;
    const req = {
      kind: 'beat',
      promptId: beat.id,
      model,
      novelId,
      sceneId: outline.acts[0].chapters[0].scenes[0].id,
      message: 'Carla geht nach Hause.',
      textBefore: 'Carla traf Marias Bruder.',
      inputs: { Wörter: '400' },
    };
    const est = await api('POST', '/api/estimate', req);
    expect(est.promptTokens).toBeGreaterThan(0);
    expect(est.completionBasis).toBe('words');
    expect(est.completionTokens).toBe(720);
    expect(est.maxCompletionTokens).toBe(400 * 2 + 300);
    expect(est.pricing).toEqual({ prompt: 0.000001, completion: 0.000002 });
    expect(est.cost).toBeCloseTo(est.promptTokens * 0.000001 + 720 * 0.000002);
    expect(est.maxCost).toBeCloseTo(est.promptTokens * 0.000001 + 1100 * 0.000002);
    expect(est.contextLength).toBe(8000);
    expect(est.local).toBe(false);
    expect(Array.isArray(est.warnings)).toBe(true);
    const preview = await api('POST', '/api/preview', req);
    expect(preview.estimate.promptTokens).toBe(est.promptTokens);

    // Kürzen: Antwort kürzer als die Markierung
    const shorten = prompts.find((p) => p.builtinKey === 'shorten')!;
    const est2 = await api('POST', '/api/estimate', { kind: 'rewrite', promptId: shorten.id, model, novelId, selection: 'x'.repeat(350) });
    expect(est2.completionBasis).toBe('selection');
    expect(est2.completionTokens).toBe(60);

    // Lokaler Server ohne Preise gilt als kostenlos, ohne Modell gibt es keinen Preis
    const local = await api('POST', '/api/providers', { name: 'Lokal', kind: 'ollama', baseUrl: 'http://localhost:11434/v1' });
    const est3 = await api('POST', '/api/estimate', { ...req, model: { providerId: local.id, modelId: 'llama' } });
    expect(est3.local).toBe(true);
    expect(est3.cost).toBe(0);
    const est4 = await api('POST', '/api/estimate', { ...req, model: undefined });
    expect(est4.pricing).toBeNull();
    expect(est4.cost).toBeNull();
    await api('DELETE', `/api/providers/${local.id}`);
  });

  it('Chat: Nachricht senden, Antwort speichern, neu erzeugen', async () => {
    const providers = await api('GET', '/api/providers');
    const prov = providers.find((p: any) => p.name === 'Mock');
    const thread = await api('POST', `/api/novels/${novelId}/chats`, { model: { providerId: prov.id, modelId: 'test/model' } });
    const res = await app.inject({
      method: 'POST',
      url: `/api/chats/${thread.id}/send`,
      payload: { content: 'Gib mir Beats', context: [{ type: 'text', text: 'Zusatzinfo XYZ' }] },
    });
    expect(sseEvents(res.body).some((e) => e.event === 'done')).toBe(true);
    const sys = lastLlmBody.messages[0].content as string;
    expect(sys).toContain('<zusatzkontext>');
    expect(sys).toContain('Zusatzinfo XYZ');
    expect(lastLlmBody.messages.at(-1)).toEqual({ role: 'user', content: 'Gib mir Beats' });
    let t = await api('GET', `/api/chats/${thread.id}`);
    expect(t.messages.map((m: any) => m.role)).toEqual(['user', 'assistant']);
    expect(t.thread.title).toBe('Gib mir Beats');
    await app.inject({ method: 'POST', url: `/api/chats/${thread.id}/send`, payload: { regenerate: true } });
    t = await api('GET', `/api/chats/${thread.id}`);
    expect(t.messages.map((m: any) => m.role)).toEqual(['user', 'assistant']);
  });

  it('Zusammenfassungs-Job mit Schätzung und Band-Eintrag', async () => {
    const providers = await api('GET', '/api/providers');
    const prov = providers.find((p: any) => p.name === 'Mock');
    await api('POST', `/api/providers/${prov.id}/refresh`);
    const opts = {
      novelId,
      model: { providerId: prov.id, modelId: 'test/model' },
      steps: { scenes: true, chapters: true, novel: true },
      regenerate: true,
      volumeEntry: { inclusion: 'auto' },
    };
    const est = await api('POST', '/api/jobs/summaries/estimate', opts);
    expect(est.tasks.novel).toBe(1);
    expect(est.pricingKnown).toBe(true);
    const job = await api('POST', '/api/jobs/summaries', opts);
    for (let i = 0; i < 50; i++) {
      const j = await api('GET', `/api/jobs/${job.id}`);
      if (j.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const j = await api('GET', `/api/jobs/${job.id}`);
    expect(j.status).toBe('done');
    const codex = await api('GET', `/api/novels/${novelId}/codex`);
    const vol = codex.entries.find((e: any) => e.type === 'volume');
    expect(vol.name).toBe('Band 1: Test');
    expect(vol.seriesId).toBeTruthy();
  });

  it('Markdown- und docx-Export', async () => {
    const md = await app.inject({ method: 'GET', url: `/api/novels/${novelId}/export/markdown` });
    expect(md.body).toContain('# Test');
    expect(md.body).toContain('Carla traf Marias Bruder.');
    expect(md.body).not.toContain('Beat-Text');
    const docx = await app.inject({ method: 'GET', url: `/api/novels/${novelId}/export/docx` });
    expect(docx.statusCode).toBe(200);
    expect(docx.rawPayload.subarray(0, 2).toString()).toBe('PK');
    // Re-Import: Kapitel und Szenen kommen wieder als Kapitel und Szenen an
    const imp = await api('POST', '/api/import/docx', { filename: 'Re.docx', data: docx.rawPayload.toString('base64') });
    expect(imp.chapters).toBe(2);
    expect(imp.scenes).toBe(3); // das leere zweite Kapitel bekommt eine leere Szene
    const re: Outline = await api('GET', `/api/novels/${imp.novelId}/outline`);
    expect(re.acts).toHaveLength(1);
    expect(re.acts[0].chapters[0].scenes).toHaveLength(2);
  });

  it('Export: Gliederung, Teilbereiche und Zwischenablage', async () => {
    outline = await api('GET', `/api/novels/${novelId}/outline`);
    const ch1 = outline.acts[0].chapters[0];
    // ein Akt: Kapitel = ##, Szenen = ### (Titel ist #)
    const md = (await app.inject({ method: 'GET', url: `/api/novels/${novelId}/export/markdown` })).body;
    expect(md).toContain('## Kapitel 1');
    expect(md).toContain('### Szene 1');
    const flat = (await app.inject({ method: 'GET', url: `/api/novels/${novelId}/export/markdown?sceneHeadings=0` })).body;
    expect(flat).not.toContain('### Szene');
    expect(flat).toContain('Zweiter Absatz hier.\n\n* * *\n\nCarla traf Marias Bruder.');
    // Kapitel für die Zwischenablage
    const clip = await api('GET', `/api/novels/${novelId}/export/clipboard?scope=chapter&item=${ch1.id}`);
    expect(clip.label).toBe('Kapitel 1');
    expect(clip.html).toContain('<h1>Kapitel 1</h1>');
    expect(clip.html).toContain('<h2>Szene 2</h2>');
    expect(clip.html).not.toContain('Beat-Text');
    expect(clip.text).toContain('Carla traf Marias Bruder.');
    expect(clip.words).toBe(7);
    // einzelne Szene: nur der Text, ohne Beat
    const s = await api('GET', `/api/novels/${novelId}/export/clipboard?scope=scene&item=${ch1.scenes[1].id}`);
    expect(s.html).toBe('<p>Carla traf Marias Bruder.</p>');
    expect(s.text).toBe('Carla traf Marias Bruder.');
    // Akt als Word-Datei, Dateiname mit Teil
    const docx = await app.inject({ method: 'GET', url: `/api/novels/${novelId}/export/docx?scope=act&item=${outline.acts[0].id}` });
    expect(docx.statusCode).toBe(200);
    expect(docx.headers['content-disposition']).toContain(encodeURIComponent('Test - Akt 1'));
    const bad = await app.inject({ method: 'GET', url: `/api/novels/${novelId}/export/clipboard?scope=scene&item=gibtsnicht` });
    expect(bad.statusCode).toBe(404);
  });

  it('Prompts je Sprache: Fassungen, Rückfall, Kopie mit Chip-Namen, Generierung in der Fassungssprache', async () => {
    const de = await api<Prompt[]>('GET', '/api/prompts');
    const beatDe = de.find((p) => p.builtinKey === 'beat')!;
    expect(beatDe.lang).toBe('de');
    expect(beatDe.langs).toEqual(['en', 'de', 'es', 'uk', 'it', 'fr']);
    expect(beatDe.name).toBe('Szene aus Beat schreiben');

    await api('PATCH', '/api/settings', { language: 'en' });
    const en = await api<Prompt[]>('GET', '/api/prompts');
    const beatEn = en.find((p) => p.builtinKey === 'beat')!;
    expect(beatEn.id).toBe(beatDe.id);
    expect(beatEn.lang).toBe('en');
    expect(beatEn.name).toBe('Write scene from beat');
    expect(beatEn.blocks!.role).toContain('{{Novel language}}');
    expect((await api<Prompt[]>('GET', '/api/prompts?lang=uk')).find((p) => p.builtinKey === 'beat')!.name).toBe('Написати сцену з біту');

    // neuer Prompt: nur in der eingestellten Sprache, andere Sprachen fallen auf ihn zurück
    const p = await api<Prompt>('POST', '/api/prompts', { type: 'workshop-chat', name: 'Mine', blocks: newBlockSpec('workshop-chat', 'en') });
    expect(p.lang).toBe('en');
    expect(p.langs).toEqual(['en']);
    expect((await api<Prompt>('GET', `/api/prompts/${p.id}?lang=de`)).lang).toBe('en');
    // Speichern in Deutsch legt die deutsche Fassung an, die englische bleibt
    const pDe = await api<Prompt>('PATCH', `/api/prompts/${p.id}`, { lang: 'de', name: 'Meiner' });
    expect(pDe.lang).toBe('de');
    expect(pDe.langs).toEqual(['en', 'de']);
    expect((await api<Prompt>('GET', `/api/prompts/${p.id}?lang=en`)).name).toBe('Mine');
    // Kopie als spanische Fassung: Platzhalter-Chips heißen dann spanisch, Rahmentexte sind spanisch
    const pEs = await api<Prompt>('POST', `/api/prompts/${p.id}/texts/es`, { from: 'en' });
    expect(pEs.lang).toBe('es');
    expect(pEs.blocks!.task).toContain('{{Idioma de la novela}}');
    expect(pEs.messages[0].text).toContain('Información adicional:');
    // Fassung löschen (nicht die letzte)
    const afterDel = await api<Prompt>('DELETE', `/api/prompts/${p.id}/texts/en`);
    expect(afterDel.langs).toEqual(['de', 'es']);
    expect((await api<Prompt>('GET', `/api/prompts/${p.id}?lang=en`)).lang).not.toBe('en');
    await api('DELETE', `/api/prompts/${p.id}/texts/de`);
    const last = await app.inject({ method: 'DELETE', url: `/api/prompts/${p.id}/texts/es` });
    expect(last.statusCode).toBe(400);

    // Vorschau mit dem mitgelieferten Beat-Prompt: englische Fassung, englische Komponenten
    const prev = await api('POST', '/api/preview', { kind: 'preview', promptId: beatDe.id, novelId, sceneId: outline.acts[0].chapters[0].scenes[0].id, message: 'Carla kommt.' });
    const all = prev.messages.map((m: { content: string }) => m.content).join(' ');
    expect(all).toContain('Write about');
    expect(all).not.toContain('Schreibe etwa');
    const prevDe = await api('POST', '/api/preview', { kind: 'preview', promptId: beatDe.id, lang: 'de', novelId, sceneId: outline.acts[0].chapters[0].scenes[0].id, message: 'Carla kommt.' });
    expect(prevDe.messages.map((m: { content: string }) => m.content).join(' ')).toContain('Schreibe etwa');

    // Standard wiederherstellen setzt nur die Fassung der Sprache zurück
    await api('PATCH', `/api/prompts/${beatDe.id}`, { lang: 'en', name: 'Changed' });
    expect((await api<Prompt>('POST', `/api/prompts/${beatDe.id}/reset`, { lang: 'en' })).name).toBe('Write scene from beat');
    expect((await api<Prompt>('GET', `/api/prompts/${beatDe.id}?lang=de`)).name).toBe('Szene aus Beat schreiben');

    await api('PATCH', '/api/settings', { language: 'de' });
    expect((await api('GET', '/api/settings')).language).toBe('de');
    // ungültige Sprache wird ignoriert
    expect((await api('PATCH', '/api/settings', { language: 'xx' })).language).toBe('de');
  });

  it('Suche', async () => {
    const r = await api('GET', `/api/novels/${novelId}/search?q=marias`);
    expect(r.scenes.length).toBe(1);
    expect(r.scenes[0].excerpts[0]).toContain('Marias');
  });
});
