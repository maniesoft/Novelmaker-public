import { describe, expect, it } from 'vitest';
import { parseNcPrompt } from '../src/codec';
import { renderPrompt, collectPromptInputs } from '../src/template/engine';
import { parseTemplate } from '../src/template/parser';
import { lintTemplate } from '../src/lint';
import type { RenderablePrompt } from '../src/template/data';
import { sample, testData, builtinComponents } from './fixtures';
import { builtinPrompts } from '../src/builtin';
import { LANGS } from '../src/i18n';

function tpl(text: string, data = testData(), type = 'scene-beat-completion') {
  const prompt: RenderablePrompt = { type, messages: [{ type: 'user', text }], inputs: [] };
  return renderPrompt(prompt, data);
}
const out = (text: string, data = testData(), type?: string) => tpl(text, data, type).messages[0]?.content ?? '';

describe('Parser', () => {
  it('parst mehrzeilige Ausdrücke und Bedingungen', () => {
    const { issues } = parseTemplate('{#if and(\n  isStartOfText,\n  pov.character is pov.character(scene.previous)\n)}\nA\n{#else}\nB\n{#endif}');
    expect(issues).toEqual([]);
  });
  it('meldet Fehler statt abzustürzen', () => {
    const { issues } = parseTemplate('Hallo {novel.title');
    expect(issues.length).toBe(1);
    const { issues: i2 } = parseTemplate('{#if x}offen');
    expect(i2[0].message).toMatch(/endif/);
  });
  it('erkennt Kommentare und Escapes', () => {
    expect(out('A{! weg !}B \\{literal\\}')).toBe('AB {literal}');
  });
});

describe('Auswertung', () => {
  it('Roman-Felder', () => {
    expect(out('{novel.title} – {novel.tense} – {novel.language}')).toBe('Testroman – past tense – German');
  });
  it('Funktionsnamen ignorieren Groß-/Kleinschreibung', () => {
    expect(out('{NOVEL.TITLE}')).toBe('Testroman');
  });
  it('Strings, Zahlen, Verkettung', () => {
    expect(out(`{"a" + 'b' + 3}`)).toBe('ab3');
  });
  it('Wahrheitswerte in #if', () => {
    expect(out('{#if codex.aliases("Maria")}ja{#else}nein{#endif}')).toBe('nein');
    expect(out('{#if codex.aliases("AI-isms")}ja{#else}nein{#endif}')).toBe('ja');
    expect(out('{#if ""}ja{#elseif "x"}elseif{#else}nein{#endif}')).toBe('elseif');
  });
  it('is / in / not', () => {
    expect(out('{#if "a" is "a"}1{#endif}{#if "a" is not "b"}2{#endif}{#if "Han" in "Hannes"}3{#endif}{#if not ""}4{#endif}')).toBe('1234');
  });
  it('Listen werden mit Komma verbunden', () => {
    expect(out('{codex.aliases("AI-isms")}')).toBe('irgendwie, Gänsehaut, ein Schauer lief');
  });
  it('pov erzeugt Satz in Romansprache', () => {
    expect(out('{pov}')).toBe('Schreibe in der Ich-Perspektive aus Sicht von Carla.');
    const en = testData({ novel: { ...testData().novel, language: 'English (US)', povType: 'third-limited' } });
    expect(out('{pov}', en)).toBe('Write in third person limited from the perspective of Carla.');
  });
  it('pov.character und scene.previous', () => {
    expect(out('{#if pov.character is pov.character(scene.previous)}gleich{#endif}')).toBe('gleich');
    expect(out('{lastWords(scene.fullText(scene.previous), 3)}')).toBe('winkte mir zu.');
  });
  it('Eigenschaftszugriff über Punkt', () => {
    expect(out('{scene.previous.summary}')).toBe('Carla kommt in Berlin an und trifft Hannes am Bahnhof.');
    expect(out('{pov.character.name}')).toBe('Carla');
  });
  it('storySoFar enthält nur Szenen davor', () => {
    const s = out('{storySoFar}');
    expect(s).toContain('trifft Hannes am Bahnhof');
    expect(s).not.toContain('Café Luna');
    expect(s).toContain('## Kapitel 1: Ankunft');
  });
  it('isStartOfText', () => {
    expect(out('{#if isStartOfText}start{#else}mitten{#endif}')).toBe('mitten');
    expect(out('{#if isStartOfText}start{#endif}', testData({ textBefore: '' }))).toBe('start');
  });
  it('unbekannte Funktion → Warnung, kein Absturz', () => {
    const r = tpl('A{gibtsNicht(1)}B');
    expect(r.messages[0].content).toBe('AB');
    expect(r.warnings[0].message).toMatch(/Unbekannte Funktion/);
  });
  it('Funktion im falschen Prompt-Typ → Warnung', () => {
    const r = tpl('{textBefore}', testData(), 'workshop-chat');
    expect(r.warnings.some((w) => /nicht verfügbar/.test(w.message))).toBe(true);
  });
  it('Zeilen nur mit Tags verschwinden, Einrückung wird entfernt', () => {
    expect(out('A\n{#if "x"}\n  B\n{#endif}\nC')).toBe('A\nB\nC');
    expect(out('A\n\n{! k !}\n\n\n\nC')).toBe('A\n\nC');
  });
  it('codex.context: immer, POV, erwähnt (Marias → Maria, Café Luna), ohne „nie“', () => {
    const r = tpl('{codex.context}');
    const ids = r.codex.filter((c) => c.included).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['style', 'carla', 'maria', 'luna']));
    expect(ids).not.toContain('ai');
    expect(ids).not.toContain('hannes');
    expect(r.messages[0].content).toContain('<character name="Maria">');
    expect(r.messages[0].content).toContain('<location name="Café Luna">');
  });
  it('local, without, asXml (AdditionalContext ohne Dubletten)', () => {
    const data = testData({
      inputs: {
        'Additional Context': [
          { type: 'codex', id: 'maria' },
          { type: 'codex', id: 'hannes' },
          { type: 'snippet', id: 'sn1' },
        ],
      },
    });
    const s = out('{include("Novelmaker/AdditionalContext")}', data);
    expect(s).toContain('<additionalContext>');
    expect(s).toContain('<character name="Hannes" aliases="Hannes Berger">');
    expect(s).toContain('<snippet title="Recherche">');
    expect(s).not.toContain('name="Maria"'); // steckt schon in codex.context
  });
  it('input(): Dropdown-Standardwert und Groß-/Kleinschreibung', () => {
    const prompt: RenderablePrompt = {
      type: 'workshop-chat',
      messages: [{ type: 'system', text: '{input("amount")}|{input("Scene")}' }],
      inputs: JSON.parse(sample('chat-scene-beats-from-summary.json')).inputs,
    };
    const r = renderPrompt(prompt, testData({ inputs: { Scene: [{ type: 'scene', id: 's1' }] } }));
    expect(r.messages[0].content).toBe(
      '12|<scene title="Kapitel 1: Ankunft, Szene 1" type="summary">\nCarla kommt in Berlin an und trifft Hannes am Bahnhof.\n</scene>',
    );
  });
});

describe('Novelcrafter-Beispiele (Abnahmetest Phase 3)', () => {
  it('Beat-Prompt rendert ohne Warnung', () => {
    const { prompt } = parseNcPrompt(JSON.parse(sample('beat-prompt.json')));
    const r = renderPrompt(prompt, testData({ inputs: { Words: '400' } }));
    expect(r.warnings).toEqual([]);
    const roles = r.messages.map((m) => m.role);
    expect(roles).toEqual(['system', 'user', 'assistant', 'user']);
    const [system, user1, assistant, user2] = r.messages.map((m) => m.content);
    expect(system).toContain('Write in past tense and use German spelling');
    expect(system).toContain('AVOID the following words and style: irgendwie, Gänsehaut, ein Schauer lief.');
    expect(system).not.toContain('{');
    expect(user1).toContain('<codex>');
    expect(user1).toContain('The story so far:');
    expect(assistant).toBe('Das Café Luna war voll. Marias Jacke hing über dem Stuhl.');
    expect(user2).toContain('Write 400 words');
    expect(user2).toContain('Schreibe in der Ich-Perspektive aus Sicht von Carla.');
    expect(user2).toContain('Carla bestellt einen Kaffee');
  });

  it('Beat-Prompt am Szenenanfang nimmt Text der vorherigen Szene (gleicher POV)', () => {
    const { prompt } = parseNcPrompt(JSON.parse(sample('beat-prompt.json')));
    const r = renderPrompt(prompt, testData({ textBefore: '', inputs: { Words: '200' } }));
    const assistant = r.messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toBe('Der Zug war zu spät. Hannes wartete am Gleis und winkte mir zu.');
  });

  it('Standard-Wörterzahl aus Dropdown (id = Index)', () => {
    const { prompt } = parseNcPrompt(JSON.parse(sample('beat-prompt.json')));
    const r = renderPrompt(prompt, testData());
    expect(r.messages[r.messages.length - 1].content).toContain('Write 400 words');
  });

  it('Chat-Prompt „Scene Beats from Summary“ rendert mit Mitgelieferten Chat-Komponenten', () => {
    const { prompt } = parseNcPrompt(JSON.parse(sample('chat-scene-beats-from-summary.json')));
    const data = testData({
      currentSceneId: null,
      textBefore: null,
      textAfter: null,
      message: '',
      inputs: { Amount: '8', Scene: [{ type: 'scene', id: 's2' }] },
      chat: { history: [], message: 'Bitte die Beats.' },
    });
    const r = renderPrompt(prompt, data);
    expect(r.warnings).toEqual([]);
    expect(r.messages.map((m) => m.role)).toEqual(['system', 'user']);
    const sys = r.messages[0].content;
    expect(sys).toContain('exactly 8 scene beats');
    expect(sys).toContain('Carla und Hannes trinken Kaffee im Café Luna.');
    expect(sys).toContain('<novelInfo>');
    expect(sys).toContain('Always answer in German');
  });

  it('Eingabefelder inkl. eingebundener Komponenten', () => {
    const { prompt } = parseNcPrompt(JSON.parse(sample('beat-prompt.json')));
    const inputs = collectPromptInputs(prompt, builtinComponents());
    expect(inputs.map((i) => i.name)).toEqual(['Words', 'Additional Context']);
  });

  it('alle mitgelieferten Prompts rendern in jeder Sprache ohne Fehler', () => {
    for (const p of LANGS.flatMap((l) => builtinPrompts(l))) {
      if (p.type === 'component') continue;
      const chat = p.type === 'workshop-chat' ? { history: [], message: 'Hallo' } : undefined;
      const r = renderPrompt(p, testData({ selection: 'Ein Satz.', chat, inputs: {} }));
      const bad = r.warnings.filter((w) => w.level !== 'info');
      expect(bad, p.name).toEqual([]);
      expect(r.messages.length, p.name).toBeGreaterThan(0);
    }
  });

  it('Lint findet unbekannte Funktionen und Komponenten', () => {
    const issues = lintTemplate('{foo.bar} {include("Gibt/Es/Nicht")} {novel.title}', { componentNames: ['Novelmaker/Codex'] });
    expect(issues.map((i) => i.message)).toEqual(['Unbekannte Funktion „foo.bar“', 'Komponente „Gibt/Es/Nicht“ existiert nicht']);
  });
});
