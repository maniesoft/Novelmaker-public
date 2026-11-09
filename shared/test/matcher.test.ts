import { describe, expect, it } from 'vitest';
import { CodexMatcher } from '../src/codex/matcher';
import { selectCodexEntries } from '../src/codex/context';
import { codex } from './fixtures';

const entries = [
  codex({ id: 'maria', name: 'Maria' }),
  codex({ id: 'jorg', name: 'Jörg', aliases: ['Jörgi'] }),
  codex({ id: 'luna', name: 'Café Luna', type: 'location' }),
  codex({ id: 'ai', name: 'AI-isms', inclusion: 'never', aliases: ['irgendwie'] }),
  codex({ id: 'ring', name: 'Ring', type: 'object', caseSensitive: true }),
  codex({ id: 'hannes', name: 'Hannes' }),
];
const m = new CodexMatcher(entries);

describe('Kodex-Erkennung', () => {
  it('findet Genitiv: Marias → Maria', () => {
    expect([...m.mentionedIds('Marias Jacke hing da.')]).toEqual(['maria']);
  });
  it('respektiert Wortgrenzen mit Umlauten', () => {
    expect(m.mentionedIds('Mariannes Hund').size).toBe(0);
    expect([...m.mentionedIds('Jörg kam.')]).toEqual(['jorg']);
    expect(m.mentionedIds('Jörgens Auto').size).toBe(0);
    expect(m.mentionedIds('ÜberJörg').size).toBe(0);
    expect([...m.mentionedIds('Das war Jörgis Idee.')]).toEqual(['jorg']);
  });
  it('findet mehrteilige Namen und Endungen', () => {
    expect([...m.mentionedIds('Im Café   Luna war es laut.')]).toEqual(['luna']);
    expect([...m.mentionedIds('Hannes’ Zimmer')]).toEqual(['hannes']);
  });
  it('ignoriert Einträge mit Einbindung „nie“', () => {
    expect(m.mentionedIds('Das war irgendwie seltsam.').size).toBe(0);
  });
  it('beachtet Groß-/Kleinschreibung pro Eintrag', () => {
    expect(m.mentionedIds('Sie trug einen ring.').size).toBe(0);
    expect([...m.mentionedIds('Der Ring glänzte.')]).toEqual(['ring']);
    expect([...m.mentionedIds('MARIA!')]).toEqual(['maria']);
  });
  it('liefert Positionen', () => {
    const ms = m.findMentions('Hallo Maria, hallo Jörg.');
    expect(ms.map((x) => x.text)).toEqual(['Maria', 'Jörg']);
    expect(ms[0].start).toBe(6);
  });
});

describe('Kodex-Auswahl', () => {
  const all = [
    codex({ id: 'style', name: 'Stil', inclusion: 'always', description: 'x'.repeat(100) }),
    codex({ id: 'pov', name: 'Carla', description: 'Erzählerin' }),
    codex({ id: 'maria', name: 'Maria', description: 'Freundin von Jörg' }),
    codex({ id: 'jorg', name: 'Jörg', description: 'y'.repeat(400) }),
  ];
  it('Priorität und Rekursion', () => {
    const sel = selectCodexEntries({
      entries: all,
      currentTexts: ['Maria lacht.'],
      povCharacterId: 'pov',
      recursive: true,
      formatEntry: (e) => e.description,
    });
    expect(sel.items.map((i) => [i.id, i.reason])).toEqual([
      ['style', 'always'],
      ['pov', 'pov'],
      ['maria', 'mentioned'],
      ['jorg', 'recursive'],
    ]);
  });
  it('Token-Budget streicht niedrige Prioritäten', () => {
    const sel = selectCodexEntries({
      entries: all,
      currentTexts: ['Maria lacht.'],
      povCharacterId: 'pov',
      recursive: true,
      budget: 60,
      formatEntry: (e) => e.description,
    });
    expect(sel.included.map((e) => e.id)).toEqual(['style', 'pov', 'maria']);
    expect(sel.items.find((i) => i.id === 'jorg')?.included).toBe(false);
  });
});
