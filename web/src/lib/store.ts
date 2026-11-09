import { create } from 'zustand';
import type { GenerateRequest, RenderWarning } from '@novelmaker/shared';
import { streamSSE } from './api';
import { patchSettings, queryClient, keys } from './queries';
import { aiPinnedCodexIds } from './pins';

// ---------------------------------------------------------------- UI-Einstellungen (lokal)

type Theme = 'light' | 'dark' | 'system';

function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* */
  }
}

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem('nm-theme', theme);
  } catch {
    /* */
  }
}

interface UiState {
  theme: Theme;
  focusMode: boolean;
  showMentions: boolean;
  sidebarOpen: boolean;
  panelOpen: boolean;
  /** Spalte mit angehefteten Snippets in der Schreibansicht */
  pinnedOpen: boolean;
  setTheme: (t: Theme) => void;
  toggle: (k: 'focusMode' | 'showMentions' | 'sidebarOpen' | 'panelOpen' | 'pinnedOpen') => void;
}

export const useUi = create<UiState>((set, get) => ({
  theme: (localStorage.getItem('nm-theme') as Theme) || 'system',
  focusMode: false,
  showMentions: readLocal('nm-mentions', true),
  sidebarOpen: readLocal('nm-sidebar', true),
  panelOpen: readLocal('nm-panel', true),
  pinnedOpen: readLocal('nm-pinned', true),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
    void patchSettings({ theme }).catch(() => undefined);
  },
  toggle: (k) => {
    const v = !get()[k];
    set({ [k]: v } as Partial<UiState>);
    if (k === 'showMentions') writeLocal('nm-mentions', v);
    if (k === 'sidebarOpen') writeLocal('nm-sidebar', v);
    if (k === 'panelOpen') writeLocal('nm-panel', v);
    if (k === 'pinnedOpen') writeLocal('nm-pinned', v);
  },
}));

// ---------------------------------------------------------------- Toasts

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  text: string;
}
interface ToastState {
  toasts: Toast[];
  push: (kind: Toast['kind'], text: string) => void;
  remove: (id: number) => void;
}
let toastId = 0;
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, text) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 8000 : 3500);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
export const toast = {
  info: (t: string) => useToasts.getState().push('info', t),
  success: (t: string) => useToasts.getState().push('success', t),
  error: (t: unknown) => useToasts.getState().push('error', t instanceof Error ? t.message : String(t)),
};

// ---------------------------------------------------------------- Generierungen (Beat, Weiterschreiben, Umschreiben, Zusammenfassung)

export interface GenState {
  status: 'streaming' | 'done' | 'error' | 'aborted';
  text: string;
  reasoning: string;
  error: string | null;
  warnings: RenderWarning[];
  cost: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  finish: string | null;
  request: GenerateRequest;
  controller: AbortController | null;
}

interface GenStore {
  gens: Record<string, GenState>;
  start: (key: string, req: GenerateRequest) => Promise<GenState | undefined>;
  abort: (key: string) => void;
  clear: (key: string) => void;
}

export const useGen = create<GenStore>((set, get) => ({
  gens: {},
  start: async (key, reqIn) => {
    // angeheftete Kodex-Einträge mitschicken (Beat, Weiterschreiben, Umschreiben)
    const req: GenerateRequest =
      reqIn.pinnedCodexIds || !['beat', 'continue', 'rewrite'].includes(reqIn.kind) ? reqIn : { ...reqIn, pinnedCodexIds: aiPinnedCodexIds(reqIn.novelId) };
    get().gens[key]?.controller?.abort();
    const controller = new AbortController();
    const update = (patch: Partial<GenState>) =>
      set((s) => (s.gens[key] ? { gens: { ...s.gens, [key]: { ...s.gens[key], ...patch } } } : s));
    set((s) => ({
      gens: {
        ...s.gens,
        [key]: {
          status: 'streaming',
          text: '',
          reasoning: '',
          error: null,
          warnings: [],
          cost: null,
          promptTokens: null,
          completionTokens: null,
          finish: null,
          request: req,
          controller,
        },
      },
    }));
    // Puffer: Deltas gesammelt pro Frame übernehmen
    let pending = '';
    let pendingReasoning = '';
    let raf = 0;
    const flush = () => {
      raf = 0;
      const cur = get().gens[key];
      if (!cur) return;
      update({ text: cur.text + pending, reasoning: cur.reasoning + pendingReasoning });
      pending = '';
      pendingReasoning = '';
    };
    try {
      await streamSSE(
        '/api/generate',
        req,
        {
          onEvent: (event, data) => {
            if (event === 'meta') update({ warnings: data.warnings ?? [] });
            else if (event === 'delta' || event === 'reasoning') {
              if (event === 'delta') pending += data.text;
              else pendingReasoning += data.text;
              if (!raf) raf = requestAnimationFrame(flush);
            } else if (event === 'done') {
              if (raf) cancelAnimationFrame(raf);
              flush();
              update({
                status: data.status === 'aborted' ? 'aborted' : 'done',
                cost: data.cost,
                promptTokens: data.promptTokens,
                completionTokens: data.completionTokens,
                finish: data.finish,
                controller: null,
              });
            } else if (event === 'error') {
              if (raf) cancelAnimationFrame(raf);
              flush();
              update({ status: 'error', error: data.message, controller: null });
            }
          },
        },
        controller.signal,
      );
      if (get().gens[key]?.status === 'streaming') {
        if (raf) cancelAnimationFrame(raf);
        flush();
        update({ status: 'done', controller: null });
      }
    } catch (e) {
      if (raf) cancelAnimationFrame(raf);
      flush();
      if ((e as Error).name === 'AbortError') update({ status: 'aborted', controller: null });
      else update({ status: 'error', error: (e as Error).message, controller: null });
    }
    queryClient.invalidateQueries({ queryKey: keys.logs });
    return get().gens[key];
  },
  abort: (key) => {
    get().gens[key]?.controller?.abort();
  },
  clear: (key) => {
    get().gens[key]?.controller?.abort();
    set((s) => {
      const g = { ...s.gens };
      delete g[key];
      return { gens: g };
    });
  },
}));
