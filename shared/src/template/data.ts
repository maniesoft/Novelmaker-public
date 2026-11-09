// Daten, gegen die ein Prompt gerendert wird. Der Server baut sie aus der Datenbank.
import type {
  ChatMessageData,
  CodexEntry,
  InputValues,
  Novel,
  PovType,
  PromptInput,
  PromptMessage,
  PromptType,
  Series,
  Snippet,
} from '../types';

export interface PromptSceneData {
  id: string;
  title: string;
  summary: string;
  text: string;
  povCharacterId: string | null;
  povType: PovType | null;
  labels: string[];
  hideFromAI: boolean;
}

export interface PromptChapterData {
  id: string;
  title: string;
  summary: string;
  scenes: PromptSceneData[];
}

export interface PromptActData {
  id: string;
  title: string;
  summary: string;
  chapters: PromptChapterData[];
}

export interface PromptComponentData {
  name: string;
  messages: PromptMessage[];
  inputs: PromptInput[];
}

export interface PromptData {
  novel: Novel;
  series: Series | null;
  acts: PromptActData[];
  codex: CodexEntry[];
  snippets: Snippet[];
  components: PromptComponentData[];
  currentSceneId: string | null;
  /** Für Kapitel-Zusammenfassungen u. Ä. ohne aktuelle Szene */
  currentChapterId?: string | null;
  /** Beat-Text, Anweisung oder Chatnachricht */
  message: string;
  /** null = keine Editor-Position (Chat usw.) */
  textBefore: string | null;
  textAfter: string | null;
  selection: string;
  inputs: InputValues;
  pinnedCodexIds: string[];
  chat?: { history: ChatMessageData[]; message: string };
}

export interface RenderablePrompt {
  type: PromptType;
  name?: string;
  messages: PromptMessage[];
  inputs: PromptInput[];
}
