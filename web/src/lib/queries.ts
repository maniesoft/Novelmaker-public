import { QueryClient, useQuery } from '@tanstack/react-query';
import type {
  AppSettings,
  ChatMessage,
  ChatThread,
  CodexEntry,
  CodexRelation,
  GenerationLog,
  JobInfo,
  ModelCollection,
  Novel,
  NovelListItem,
  Outline,
  PMDoc,
  Prompt,
  Provider,
  Scene,
  SceneSnapshot,
  Series,
  Snippet,
} from '@novelmaker/shared';
import { api } from './api';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 10_000 } },
});

export type ProviderInfo = Provider & { hasKey: boolean };

export const keys = {
  novels: ['novels'] as const,
  series: ['series'] as const,
  novel: (id: string) => ['novel', id] as const,
  outline: (id: string) => ['outline', id] as const,
  manuscript: (id: string) => ['manuscript', id] as const,
  scene: (id: string) => ['scene', id] as const,
  snapshots: (id: string) => ['snapshots', id] as const,
  codex: (novelId: string) => ['codex', novelId] as const,
  snippets: (novelId: string) => ['snippets', novelId] as const,
  prompts: ['prompts'] as const,
  providers: ['providers'] as const,
  collections: ['collections'] as const,
  settings: ['settings'] as const,
  chats: (novelId: string) => ['chats', novelId] as const,
  chat: (id: string) => ['chat', id] as const,
  jobs: ['jobs'] as const,
  logs: ['logs'] as const,
  system: ['system'] as const,
};

export interface SystemInfo {
  dbPath: string;
  dbDir: string;
  defaultDbDir: string;
  backupDir: string;
  defaultBackupDir: string;
  host: string;
  platform: string;
  lockWarning: { host: string; since: string; heartbeat: string } | null;
  conflicts: { file: string; modified: string }[];
  suggestions: { label: string; path: string }[];
  backups: { file: string; size: number; createdAt: string }[];
}

// Laufende Speichervorgänge pro Szene: vor dem Laden abwarten, damit nichts Veraltetes erscheint
export const pendingSaves = new Map<string, Promise<unknown>>();

export const useNovels = () => useQuery({ queryKey: keys.novels, queryFn: () => api.get<NovelListItem[]>('/api/novels') });
export const useSeriesList = () => useQuery({ queryKey: keys.series, queryFn: () => api.get<Series[]>('/api/series') });
export const useNovel = (id: string | undefined) =>
  useQuery({ queryKey: keys.novel(id ?? ''), queryFn: () => api.get<Novel>(`/api/novels/${id}`), enabled: !!id });
export const useOutline = (id: string | undefined) =>
  useQuery({ queryKey: keys.outline(id ?? ''), queryFn: () => api.get<Outline>(`/api/novels/${id}/outline`), enabled: !!id });

export interface Manuscript {
  outline: Outline;
  scenes: Record<string, { id: string; content: PMDoc; updatedAt: string }>;
}
export const useManuscript = (id: string | undefined) =>
  useQuery({
    queryKey: keys.manuscript(id ?? ''),
    queryFn: async () => {
      await Promise.all([...pendingSaves.values()]);
      return api.get<Manuscript>(`/api/novels/${id}/manuscript`);
    },
    enabled: !!id,
    staleTime: 0,
  });

export const useScene = (id: string | undefined) =>
  useQuery({
    queryKey: keys.scene(id ?? ''),
    queryFn: async () => {
      const p = pendingSaves.get(id!);
      if (p) await p.catch(() => undefined);
      return api.get<Scene>(`/api/scenes/${id}`);
    },
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
  });

export const useSnapshots = (sceneId: string | undefined) =>
  useQuery({ queryKey: keys.snapshots(sceneId ?? ''), queryFn: () => api.get<SceneSnapshot[]>(`/api/scenes/${sceneId}/snapshots`), enabled: !!sceneId });

export const useCodex = (novelId: string | undefined) =>
  useQuery({
    queryKey: keys.codex(novelId ?? ''),
    queryFn: () => api.get<{ entries: CodexEntry[]; relations: CodexRelation[] }>(`/api/novels/${novelId}/codex`),
    enabled: !!novelId,
  });

export const useSnippets = (novelId: string | undefined) =>
  useQuery({ queryKey: keys.snippets(novelId ?? ''), queryFn: () => api.get<Snippet[]>(`/api/novels/${novelId}/snippets`), enabled: !!novelId });

export const usePrompts = () => useQuery({ queryKey: keys.prompts, queryFn: () => api.get<Prompt[]>('/api/prompts') });
export const useProviders = () => useQuery({ queryKey: keys.providers, queryFn: () => api.get<ProviderInfo[]>('/api/providers') });
export const useCollections = () => useQuery({ queryKey: keys.collections, queryFn: () => api.get<ModelCollection[]>('/api/collections') });
export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => api.get<AppSettings>('/api/settings'), staleTime: 60_000 });

export const useChats = (novelId: string | undefined) =>
  useQuery({ queryKey: keys.chats(novelId ?? ''), queryFn: () => api.get<ChatThread[]>(`/api/novels/${novelId}/chats`), enabled: !!novelId });
export const useChat = (id: string | undefined) =>
  useQuery({
    queryKey: keys.chat(id ?? ''),
    queryFn: () => api.get<{ thread: ChatThread; messages: ChatMessage[] }>(`/api/chats/${id}`),
    enabled: !!id,
  });

export const useJobs = (poll: boolean) =>
  useQuery({ queryKey: keys.jobs, queryFn: () => api.get<JobInfo[]>('/api/jobs'), refetchInterval: poll ? 1500 : 10_000 });

export const useSystem = () => useQuery({ queryKey: keys.system, queryFn: () => api.get<SystemInfo>('/api/system'), refetchInterval: 120_000 });

export const useLogs = () => useQuery({ queryKey: keys.logs, queryFn: () => api.get<GenerationLog[]>('/api/logs?limit=200') });

export async function patchSettings(patch: Partial<AppSettings>) {
  const s = await api.patch<AppSettings>('/api/settings', patch);
  queryClient.setQueryData(keys.settings, s);
  return s;
}

export function invalidateNovel(novelId: string) {
  queryClient.invalidateQueries({ queryKey: keys.outline(novelId) });
  queryClient.invalidateQueries({ queryKey: keys.manuscript(novelId) });
  queryClient.invalidateQueries({ queryKey: keys.novels });
}
