import { describe, expect, it } from 'vitest';
import { BLOCK_DEFS, chipStatus, compileBlockPrompt, convertToBlocks, newBlockSpec, retypeSpec, type BlockPromptSpec } from '../src/blocks';
import { builtinPrompts } from '../src/builtin';
import { LANGS, setLang } from '../src/i18n';

// Die Tests prüfen die deutschen Rahmentexte
setLang('de');
import { parseNcPrompt } from '../src/codec';
import { renderPrompt } from '../src/template/engine';
import type { PromptType } from '../src/types';
import { sample, testData } from './fixtures';

const render = (spec: BlockPromptSpec, type: PromptType, over: Parameters<typeof testData>[0] = {}) => {
  const c = compileBlockPrompt(spec, type);
  return { compiled: c, result: renderPrompt({ type, messages: c.messages, inputs: c.inputs }, testData(over)) };
};

describe('Baustein-Prompts', () => {
  it('ein neuer Prompt enthält alle Bausteine (passende mit Standardwerten)', () => {
    const spec = newBlockSpec('scene-beat-completion');
    expect(Object.keys(spec.blocks).sort()).toEqual(BLOCK_DEFS.map((d) => d.kind).sort());
    expect(spec.blocks.textBefore).toMatchObject({ on: true, words: 2500, asExample: true });
    expect(spec.blocks.textAfter).toMatchObject({ on: true, words: 250 });
    expect(spec.blocks.context?.on).toBe(true);
    expect(spec.blocks.selection?.on).toBe(false); // passt nicht zu Beats
    expect(spec.options[0]).toMatchObject({ name: 'Wörter', default: '400' });
  });

  it('Beat: Rolle → System, Kontext → User, Text davor als Stilvorlage → Assistant, Aufgabe zuletzt', () => {
    const { compiled, result } = render(newBlockSpec('scene-beat-completion'), 'scene-beat-completion');
    expect(compiled.warnings).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    const [system, context, example, task] = result.messages.map((m) => m.content);
    expect(system).toContain('Sprache: German, Zeitform: past tense.');
    expect(context).toContain('<kodex>');
    expect(context).toContain('Die bisherige Handlung:');
    expect(example).toBe('Das Café Luna war voll. Marias Jacke hing über dem Stuhl.');
    expect(task).toContain('Schreibe etwa 400 Wörter');
    expect(task).toContain('Schreibe in der Ich-Perspektive aus Sicht von Carla.');
    expect(task).toContain('Carla bestellt einen Kaffee');
    expect(compiled.inputs.map((i) => i.name)).toEqual(['Wörter', 'Kontext']);
  });

  it('abgehakte Bausteine fehlen, Text davor ohne Stilvorlage landet im Kontext', () => {
    const spec = newBlockSpec('scene-beat-completion');
    spec.blocks.codex = { on: false };
    spec.blocks.storySoFar = { on: false };
    spec.blocks.textBefore = { on: true, words: 3, asExample: false };
    const { result } = render(spec, 'scene-beat-completion');
    expect(result.messages.map((m) => m.role)).toEqual(['system', 'user']);
    const all = result.messages.map((m) => m.content).join('\n');
    expect(all).not.toContain('<kodex>');
    expect(all).toContain('<textDavor>\nüber dem Stuhl.\n</textDavor>');
  });

  it('am Szenenanfang kommt das Ende der vorigen Szene (gleiche POV-Figur)', () => {
    const { result } = render(newBlockSpec('scene-beat-completion'), 'scene-beat-completion', { textBefore: '' });
    expect(result.messages.find((m) => m.role === 'assistant')?.content).toBe('Der Zug war zu spät. Hannes wartete am Gleis und winkte mir zu.');
  });

  it('Platzhalter: Auswahlfelder, eingebaute, unbekannte; geschweifte Klammern im Text bleiben Text', () => {
    const spec: BlockPromptSpec = { ...newBlockSpec('workshop-chat'), role: 'Du bist {{Ton}} – {Code} bleibt {{Romantitel}} {{Gibtsnicht}}', options: [{ name: 'Ton', choices: ['ehrlich', 'nett'], default: 'ehrlich' }] };
    expect(chipStatus('ton', spec.options)).toBe('option');
    expect(chipStatus('Romantitel', spec.options)).toBe('builtin');
    expect(chipStatus('Gibtsnicht', spec.options)).toBe('unknown');
    const { compiled, result } = render(spec, 'workshop-chat', { message: 'Wie findest du Kapitel 1?' });
    expect(compiled.warnings.join()).toContain('{{Gibtsnicht}}');
    expect(result.messages[0].content).toContain(`Du bist ehrlich – {Code} bleibt ${testData().novel.title} {{Gibtsnicht}}`);
  });

  it('Chat: alles in die Systemnachricht, Kontextauswahl geht ins Eingabefeld „Kontext“', () => {
    const { compiled, result } = render(newBlockSpec('workshop-chat'), 'workshop-chat', { inputs: { Kontext: [{ type: 'snippet', id: 'sn1' }] } });
    expect(compiled.messages.map((m) => m.type)).toEqual(['system']);
    expect(compiled.inputs.find((i) => i.name === 'Kontext')?.addToContext).toBe(true);
    expect(result.messages[0].content).toContain('<roman>');
    expect(result.messages[0].content).toContain('<zusatzkontext>');
    expect(result.messages[0].content).toContain('Recherche');
  });

  it('Zusammenfassung: der zu zusammenfassende Text richtet sich nach der Ebene', () => {
    const spec = newBlockSpec('summary');
    const scene = render(spec, 'summary').result.messages.map((m) => m.content).join('\n');
    expect(scene).toContain('<szene>');
    expect(scene).toContain('höchstens 150 Wörtern');
    const chapter = render(spec, 'summary', { currentSceneId: null, currentChapterId: 'ch1' }).result.messages.map((m) => m.content).join('\n');
    expect(chapter).toContain('<szenen>');
    const novel = render(spec, 'summary', { currentSceneId: null, currentChapterId: null }).result.messages.map((m) => m.content).join('\n');
    expect(novel).toContain('<kapitel>');
  });

  it('Typwechsel: neu passende Bausteine bekommen Standardwerte', () => {
    const spec = retypeSpec(newBlockSpec('workshop-chat'), 'workshop-chat', 'text-replacement');
    expect(spec.blocks.selection?.on).toBe(true);
    expect(spec.blocks.textBefore).toMatchObject({ on: true, words: 300, asExample: false });
  });

  it('alle mitgelieferten Baustein-Prompts lassen sich in jeder Sprache ohne Warnung übersetzen', () => {
    for (const lang of LANGS)
      for (const b of builtinPrompts(lang).filter((x) => x.blocks)) expect(compileBlockPrompt(b.blocks!, b.type, lang).warnings, `${b.key} (${lang})`).toEqual([]);
  });

  it('Chips anderer Sprachen werden erkannt; Rahmentexte folgen der Prompt-Sprache', () => {
    expect(chipStatus('Novel language', [])).toBe('builtin');
    expect(chipStatus('Мова роману', [])).toBe('builtin');
    const en = compileBlockPrompt(newBlockSpec('scene-beat-completion', 'en'), 'scene-beat-completion', 'en');
    expect(en.warnings).toEqual([]);
    expect(en.messages.map((m) => m.text).join(' ')).toContain('The story so far:');
    expect(en.messages.map((m) => m.text).join(' ')).not.toContain('Die bisherige Handlung');
    expect(en.inputs.find((i) => i.name === 'Kontext')?.displayName).toBe('Context');
  });
});

describe('Importierte Prompts in Bausteine umwandeln', () => {
  it('der Novelcrafter-Beat-Prompt wird vollständig erkannt', () => {
    const { prompt } = parseNcPrompt(JSON.parse(sample('beat-prompt.json')));
    const r = convertToBlocks(prompt);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    const { spec } = r;
    expect(spec.blocks.novelInstructions?.on).toBe(true);
    expect(spec.blocks.codex?.on).toBe(true);
    expect(spec.blocks.storySoFar?.on).toBe(true);
    expect(spec.blocks.context?.on).toBe(true);
    expect(spec.blocks.bannedWords).toMatchObject({ on: true, entry: 'AI-isms' });
    expect(spec.blocks.previousSceneEnd).toMatchObject({ on: true, words: 650, samePov: true });
    expect(spec.blocks.textBefore).toMatchObject({ on: true, asExample: true });
    expect(spec.role).toContain('{{Zeitform}}');
    expect(spec.role).not.toContain('codex.aliases');
    expect(spec.task).toContain('{{Words}}');
    expect(spec.task).toContain('{{Perspektive}}');
    expect(spec.task).toContain('{{Beat}}');
    expect(spec.options).toEqual([{ name: 'Words', choices: ['200', '400', '600'], default: '400' }]);
    // umgewandelt rendert er gleichwertig
    const { compiled, result } = render(spec, 'scene-beat-completion', { inputs: { Words: '400' } });
    expect(compiled.warnings).toEqual([]);
    expect(result.warnings).toEqual([]);
    const all = result.messages.map((m) => m.content).join('\n');
    expect(all).toContain('Write in past tense and use German spelling');
    expect(all).toContain('irgendwie, Gänsehaut, ein Schauer lief');
    expect(all).toContain('Write 400 words');
    expect(result.messages.find((m) => m.role === 'assistant')?.content).toBe('Das Café Luna war voll. Marias Jacke hing über dem Stuhl.');
  });

  it('nennt die Gründe, wenn ein Prompt nicht umwandelbar ist', () => {
    const { prompt } = parseNcPrompt(JSON.parse(sample('chat-scene-beats-from-summary.json')));
    const r = convertToBlocks(prompt);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/Scene|Nachricht/);
    const odd = convertToBlocks({ type: 'scene-beat-completion', inputs: [], messages: [{ type: 'user', text: 'X {scene.labels} Y' }] });
    expect(odd.ok).toBe(false);
  });
});
