import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { CodexEntry, Novel } from '../src/types';
import type { PromptData, PromptComponentData } from '../src/template/data';
import { builtinPrompts } from '../src/builtin';

const here = dirname(fileURLToPath(import.meta.url));
/**
 * Ausgedachte Prompts und eine Modellsammlung im Novelcrafter-Format: jeweils entpackt (*.json)
 * und als Zwischenablage-String (*.clipboard.txt = gzip + Base64 ohne „=“, wie Novelcrafter kopiert).
 */
export const SAMPLES = join(here, 'novelcrafter');

export function sample(name: string): string {
  return readFileSync(join(SAMPLES, name), 'utf8');
}

let n = 0;
export function codex(partial: Partial<CodexEntry> & { name: string }): CodexEntry {
  n++;
  return {
    id: partial.id ?? `c${n}`,
    seriesId: null,
    novelId: 'n1',
    type: 'character',
    aliases: [],
    description: '',
    notes: '',
    tags: [],
    fields: [],
    inclusion: 'auto',
    caseSensitive: false,
    color: null,
    linkedNovelId: null,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

export function novel(partial: Partial<Novel> = {}): Novel {
  return {
    id: 'n1',
    seriesId: null,
    volumeNumber: null,
    title: 'Testroman',
    author: 'Ich',
    description: '',
    language: 'German',
    tense: 'past',
    povType: 'first',
    povCharacterId: 'carla',
    additionalInstructions: '',
    summary: '',
    settings: {},
    coverVersion: null,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

export function builtinComponents(): PromptComponentData[] {
  return builtinPrompts('en').filter((p) => p.type === 'component').map((p) => ({ name: p.name, messages: p.messages, inputs: p.inputs }));
}

export function testData(over: Partial<PromptData> = {}): PromptData {
  return {
    novel: novel(),
    series: null,
    acts: [
      {
        id: 'a1',
        title: '',
        summary: '',
        chapters: [
          {
            id: 'ch1',
            title: 'Ankunft',
            summary: '',
            scenes: [
              {
                id: 's1',
                title: '',
                summary: 'Carla kommt in Berlin an und trifft Hannes am Bahnhof.',
                text: 'Der Zug war zu spät. Hannes wartete am Gleis und winkte mir zu.',
                povCharacterId: null,
                povType: null,
                labels: [],
                hideFromAI: false,
              },
              {
                id: 's2',
                title: 'Im Café',
                summary: 'Carla und Hannes trinken Kaffee im Café Luna.',
                text: 'Das Café Luna war voll. Marias Jacke hing über dem Stuhl.',
                povCharacterId: null,
                povType: null,
                labels: [],
                hideFromAI: false,
              },
            ],
          },
        ],
      },
    ],
    codex: [
      codex({ id: 'carla', name: 'Carla', description: 'Studentin, 22, Ich-Erzählerin.' }),
      codex({ id: 'hannes', name: 'Hannes', aliases: ['Hannes Berger'], description: 'Carlas Mitbewohner.' }),
      codex({ id: 'maria', name: 'Maria', description: 'Carlas beste Freundin.' }),
      codex({ id: 'luna', name: 'Café Luna', type: 'location', description: 'Kleines Café in Kreuzberg.' }),
      codex({ id: 'style', name: 'Stil', type: 'other', inclusion: 'always', description: 'Locker, humorvoll.' }),
      codex({ id: 'ai', name: 'AI-isms', type: 'other', inclusion: 'never', aliases: ['irgendwie', 'Gänsehaut', 'ein Schauer lief'] }),
    ],
    snippets: [{ id: 'sn1', novelId: 'n1', seriesId: null, title: 'Recherche', text: 'Berlin im Winter.', pinned: false, createdAt: '', updatedAt: '' }],
    components: builtinComponents(),
    currentSceneId: 's2',
    message: 'Carla bestellt einen Kaffee und denkt an Maria.',
    textBefore: 'Das Café Luna war voll. Marias Jacke hing über dem Stuhl.',
    textAfter: '',
    selection: '',
    inputs: {},
    pinnedCodexIds: [],
    ...over,
  };
}
