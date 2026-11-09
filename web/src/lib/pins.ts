// Angeheftete Kodex-Einträge und Szenen (pro Roman in den Romaneinstellungen). Snippets haben ein eigenes Feld.
import type { Novel, PinRef } from '@novelmaker/shared';
import { api } from './api';
import { keys, queryClient, useNovel } from './queries';
import { toast, useUi } from './store';

const EMPTY: PinRef[] = [];

export function usePins(novelId: string | undefined): PinRef[] {
  const { data } = useNovel(novelId);
  return data?.settings.pins ?? EMPTY;
}

export const isPinned = (pins: PinRef[], kind: PinRef['kind'], id: string) => pins.some((p) => p.kind === kind && p.id === id);

function currentPins(novelId: string): PinRef[] {
  return queryClient.getQueryData<Novel>(keys.novel(novelId))?.settings.pins ?? [];
}

export async function setPins(novelId: string, update: (pins: PinRef[]) => PinRef[]) {
  const next = update(currentPins(novelId));
  queryClient.setQueryData<Novel>(keys.novel(novelId), (n) => (n ? { ...n, settings: { ...n.settings, pins: next } } : n));
  try {
    const updated = await api.patch<Novel>(`/api/novels/${novelId}`, { settings: { pins: next } });
    queryClient.setQueryData(keys.novel(novelId), updated);
  } catch (e) {
    toast.error(e);
    void queryClient.invalidateQueries({ queryKey: keys.novel(novelId) });
  }
}

/** An- bzw. abheften; beim Anheften wird die Spalte eingeblendet. */
export async function togglePin(novelId: string, kind: PinRef['kind'], id: string) {
  const pinned = isPinned(currentPins(novelId), kind, id);
  if (!pinned && !useUi.getState().pinnedOpen) useUi.getState().toggle('pinnedOpen');
  await setPins(novelId, (pins) => (pinned ? pins.filter((p) => !(p.kind === kind && p.id === id)) : [...pins, { kind, id }]));
}

export async function setPinAi(novelId: string, id: string, ai: boolean) {
  await setPins(novelId, (pins) => pins.map((p) => (p.kind === 'codex' && p.id === id ? { ...p, ai } : p)));
}

/** Angeheftete Kodex-Einträge, die an die KI gehen (für Beat, Weiterschreiben, Umschreiben). */
export function aiPinnedCodexIds(novelId: string): string[] {
  return currentPins(novelId)
    .filter((p) => p.kind === 'codex' && p.ai !== false)
    .map((p) => p.id);
}
