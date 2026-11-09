import { createContext, useContext } from 'react';
import { create } from 'zustand';
import type { Editor } from '@tiptap/core';
import { docToPlainText, frameNode, textToNodes, inlineMarkdown, type PMDoc, type PMNode } from '@novelmaker/shared';
import { api } from '../lib/api';
import { keys, pendingSaves, queryClient, type Manuscript } from '../lib/queries';
import type { Outline, SceneMeta } from '@novelmaker/shared';
import { t } from '../lib/i18n';

export interface SceneScope {
  novelId: string;
  sceneId: string;
}
export const SceneScopeContext = createContext<SceneScope | null>(null);
export function useSceneScope(): SceneScope {
  const s = useContext(SceneScopeContext);
  if (!s) throw new Error(t('SceneScope missing'));
  return s;
}

/** Zuletzt fokussierter Editor (für Werkzeugleiste und Panels). */
interface ActiveEditorState {
  editor: Editor | null;
  sceneId: string | null;
  novelId: string | null;
  set: (editor: Editor | null, sceneId: string | null, novelId: string | null) => void;
}
export const useActiveEditor = create<ActiveEditorState>((set) => ({
  editor: null,
  sceneId: null,
  novelId: null,
  set: (editor, sceneId, novelId) => set({ editor, sceneId, novelId }),
}));

// ---------------------------------------------------------------- Speichern

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';
interface SaveState {
  status: Record<string, SaveStatus>;
  setStatus: (sceneId: string, s: SaveStatus) => void;
}
export const useSaveState = create<SaveState>((set) => ({
  status: {},
  setStatus: (sceneId, s) => set((st) => ({ status: { ...st.status, [sceneId]: s } })),
}));

export function patchManuscriptContent(novelId: string, sceneId: string, content: PMDoc) {
  queryClient.setQueryData<Manuscript>(keys.manuscript(novelId), (m) =>
    m && m.scenes[sceneId] ? { ...m, scenes: { ...m.scenes, [sceneId]: { ...m.scenes[sceneId], content } } } : m,
  );
}

function patchCaches(novelId: string, meta: SceneMeta, content: PMDoc) {
  queryClient.setQueryData<Outline>(keys.outline(novelId), (o) =>
    o
      ? {
          ...o,
          acts: o.acts.map((a) => ({
            ...a,
            chapters: a.chapters.map((c) => ({ ...c, scenes: c.scenes.map((s) => (s.id === meta.id ? { ...s, ...meta } : s)) })),
          })),
        }
      : o,
  );
  queryClient.setQueryData<Manuscript>(keys.manuscript(novelId), (m) =>
    m && m.scenes[meta.id] ? { ...m, scenes: { ...m.scenes, [meta.id]: { ...m.scenes[meta.id], content, updatedAt: meta.updatedAt } } } : m,
  );
}

/** Geöffnete Editoren – damit Export und Kopieren den neuesten Stand bekommen */
const liveSavers = new Set<SceneSaver>();

export function registerSaver(saver: SceneSaver) {
  liveSavers.add(saver);
  return () => void liveSavers.delete(saver);
}

/** Alle offenen Änderungen sofort speichern und abwarten. */
export async function flushAllSaves() {
  await Promise.all([...liveSavers].map((s) => s.flush()));
  await Promise.all([...pendingSaves.values()].map((p) => p.catch(() => undefined)));
}

/** Speichern 0,8 s nach der letzten Eingabe – beim Durchschreiben aber spätestens alle 3 s. */
const SAVE_DELAY_MS = 800;
const SAVE_MAX_WAIT_MS = 3000;

export class SceneSaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private editor: Editor | null = null;
  private lastSaved = '';
  private dirtySince = 0;

  constructor(
    private sceneId: string,
    private novelId: string,
    initial: PMDoc,
  ) {
    this.lastSaved = JSON.stringify(initial);
  }

  schedule(editor: Editor) {
    this.editor = editor;
    useSaveState.getState().setStatus(this.sceneId, 'dirty');
    if (!this.dirtySince) this.dirtySince = Date.now();
    if (this.timer) clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(SAVE_DELAY_MS, this.dirtySince + SAVE_MAX_WAIT_MS - Date.now()));
    this.timer = setTimeout(() => void this.flush(), wait);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.dirtySince = 0;
    const ed = this.editor;
    if (!ed || ed.isDestroyed) return;
    const content = ed.getJSON() as PMDoc;
    const json = JSON.stringify(content);
    if (json === this.lastSaved) {
      useSaveState.getState().setStatus(this.sceneId, 'saved');
      return;
    }
    this.lastSaved = json;
    patchManuscriptContent(this.novelId, this.sceneId, content);
    useSaveState.getState().setStatus(this.sceneId, 'saving');
    const p = api
      .patch<SceneMeta>(`/api/scenes/${this.sceneId}`, { content })
      .then((meta) => {
        patchCaches(this.novelId, meta, content);
        useSaveState.getState().setStatus(this.sceneId, 'saved');
      })
      .catch((e) => {
        this.lastSaved = '';
        useSaveState.getState().setStatus(this.sceneId, 'error');
        console.error(e);
      });
    pendingSaves.set(this.sceneId, p);
    await p;
    if (pendingSaves.get(this.sceneId) === p) pendingSaves.delete(this.sceneId);
  }

  /** Beim Schließen der Seite: synchron per keepalive-Fetch. */
  flushOnUnload() {
    const ed = this.editor;
    if (!ed || ed.isDestroyed) return;
    const content = ed.getJSON();
    const json = JSON.stringify(content);
    if (json === this.lastSaved) return;
    this.lastSaved = json;
    patchManuscriptContent(this.novelId, this.sceneId, content as PMDoc);
    void fetch(`/api/scenes/${this.sceneId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }), keepalive: true });
  }
}

// ---------------------------------------------------------------- Text rund um eine Position

export function textBeforePos(editor: Editor, pos: number): string {
  return docToPlainText(editor.state.doc.cut(0, pos).toJSON() as PMDoc);
}
export function textAfterPos(editor: Editor, pos: number): string {
  return docToPlainText(editor.state.doc.cut(pos).toJSON() as PMDoc);
}
export function fullText(editor: Editor): string {
  return docToPlainText(editor.getJSON() as PMDoc);
}

export async function snapshotBeforeAI(editor: Editor, sceneId: string, reason = t('Before accepting AI text')) {
  try {
    await api.post(`/api/scenes/${sceneId}/snapshots`, { reason, content: editor.getJSON() });
    queryClient.invalidateQueries({ queryKey: keys.snapshots(sceneId) });
  } catch (e) {
    console.error('Snapshot fehlgeschlagen', e);
  }
}

/** KI-Text an einer Position einfügen. Im laufenden Absatz wird der erste Teil angehängt. */
export function insertGeneratedAt(editor: Editor, pos: number, text: string) {
  const nodes = textToNodes(text);
  if (!nodes.length) return;
  const $pos = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size));
  const parent = $pos.parent;
  if (parent.type.name === 'paragraph' && parent.textContent.trim() && nodes[0].type === 'paragraph') {
    const before = parent.textBetween(0, $pos.parentOffset);
    const first = nodes.shift()!;
    const needsSpace = before && !/\s$/.test(before);
    const inline: PMNode[] = needsSpace ? [{ type: 'text', text: ' ' }, ...(first.content ?? [])] : (first.content ?? []);
    let chain = editor.chain().insertContentAt(pos, inline);
    if (nodes.length) {
      // nach dem Einfügen: Ende des Absatzes neu bestimmen und restliche Absätze dahinter setzen
      chain = chain.command(({ tr }) => {
        const $p = tr.doc.resolve(tr.mapping.map(pos));
        const end = $p.after($p.depth);
        tr.insert(end, nodes.map((n) => editor.schema.nodeFromJSON(n)));
        return true;
      });
    }
    chain.run();
    return;
  }
  editor.chain().insertContentAt(pos, nodes).run();
}

/**
 * Generierten Text zwischenspeichern: als Rahmen (für die KI ausgeblendet) hinter dem Block, in dem `pos` liegt –
 * hinter bereits abgelegten Rahmen, damit die Varianten in Reihenfolge stehen. `title(n)` bekommt die Nummer der Variante.
 */
export function stashInFrame(editor: Editor, pos: number, text: string, title: (n: number) => string): boolean {
  if (editor.isDestroyed || !text.trim()) return false;
  const doc = editor.state.doc;
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  let at = $pos.depth >= 1 ? $pos.after(1) : $pos.pos;
  let n = 1;
  for (let next = doc.nodeAt(at); next?.type.name === 'frame'; next = doc.nodeAt(at)) {
    at += next.nodeSize;
    n++;
  }
  const frame = frameNode(text, title(n));
  return editor.chain().insertContentAt(at, frame, { updateSelection: false }).run();
}

export function splitParagraphsForInsert(text: string): PMNode[] {
  return textToNodes(text);
}

export { inlineMarkdown };
