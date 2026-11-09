import { describe, expect, it } from 'vitest';
import { decodeClipboard, encodeClipboard, parseNcModels, parseNcPrompt, removeIncludes, stripCopySuffix, toNcPrompt } from '../src/codec';
import { sample } from './fixtures';

const NAMES = ['beat-prompt', 'chat-scene-beats-from-summary', 'component-codex', 'models-collection'];

describe('Novelcrafter-Zwischenablage', () => {
  for (const name of NAMES) {
    it(`entpackt ${name} identisch zum JSON`, async () => {
      const decoded = await decodeClipboard(sample(`${name}.clipboard.txt`));
      expect(decoded).toEqual(JSON.parse(sample(`${name}.json`)));
    });
  }

  it('Round-Trip: kodieren und wieder dekodieren', async () => {
    const data = JSON.parse(sample('beat-prompt.json'));
    const enc = await encodeClipboard(data);
    expect(enc).not.toMatch(/=$/);
    expect(await decodeClipboard(enc)).toEqual(data);
  });

  it('akzeptiert auch rohes JSON', async () => {
    expect(await decodeClipboard('{"a":1}')).toEqual({ a: 1 });
  });

  it('entfernt „ (Copy)“ beim Import', () => {
    const { prompt } = parseNcPrompt(JSON.parse(sample('component-codex.json')));
    // Novelcrafters Komponenten heißen in Novelmaker „Novelmaker/…“
    expect(prompt.name).toBe('Novelmaker/Codex');
    expect(prompt.type).toBe('component');
    expect(stripCopySuffix('X (Copy) (Copy)')).toBe('X');
  });

  it('schreibt include("Novelcrafter/…") beim Import um und beim Export zurück', () => {
    const { prompt } = parseNcPrompt(JSON.parse(sample('beat-prompt.json')));
    const all = prompt.messages.map((m) => m.text).join(' ');
    expect(all).toContain('include("Novelmaker/Codex")');
    expect(all).not.toContain('Novelcrafter/');
    const back = toNcPrompt(prompt).messages.map((m) => m.text).join(' ');
    expect(back).toContain('include("Novelcrafter/Codex")');
    expect(toNcPrompt({ ...prompt, name: 'Novelmaker/Codex' }).name).toBe('Novelcrafter/Codex');
  });

  it('lässt include("Novelcrafter/Personas") beim Import weg (Personas gibt es nicht)', () => {
    const { prompt } = parseNcPrompt(JSON.parse(sample('beat-prompt.json')));
    const user = prompt.messages[1].text;
    expect(user).not.toMatch(/Personas/);
    expect(user.startsWith('{! Codex entries that matter')).toBe(true);
    expect(removeIncludes('a {include("X/Y")} b\n  {include( \'x/y\' )}  \n\n\n  c', 'X/Y')).toBe('a  b\n  c');
  });

  it('liest den Beat-Prompt mit Eingaben', () => {
    const { prompt, warnings } = parseNcPrompt(JSON.parse(sample('beat-prompt.json')));
    expect(warnings).toEqual([]);
    expect(prompt.messages.map((m) => m.type)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(prompt.inputs[0].name).toBe('Words');
    const back = toNcPrompt(prompt);
    expect(back.$schema).toBe('nc:prompt:1');
    expect(back.messages.length).toBe(4);
  });

  it('liest Modellsammlungen', () => {
    const m = parseNcModels(JSON.parse(sample('models-collection.json')));
    expect(m.name).toBe('Fiction');
    expect(m.models).toHaveLength(4);
    expect(m.models.find((x) => x.id === '~z-ai/glm-latest')?.name).toBe('');
  });

  it('verwechselt Prompt und Sammlung nicht', () => {
    expect(() => parseNcModels(JSON.parse(sample('beat-prompt.json')))).toThrow(/Prompt/);
    expect(() => parseNcPrompt(JSON.parse(sample('models-collection.json')))).toThrow(/Modellsammlung/);
  });
});
