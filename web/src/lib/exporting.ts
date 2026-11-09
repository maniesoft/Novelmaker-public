// Export und Kopieren: ganzer Roman, Akt, Kapitel oder Szene.
import { flushAllSaves } from '../editor/scope';
import { api, copyRich, download } from './api';
import { toast } from './store';
import { t, tn } from './i18n';

export type ExportPart = { scope: 'novel' } | { scope: 'act' | 'chapter' | 'scene'; item: string };

const query = (p: ExportPart) => (p.scope === 'novel' ? '' : `?scope=${p.scope}&item=${encodeURIComponent(p.item)}`);

/** Text in die Zwischenablage – formatiert (für Word & Co.) und als Klartext. */
export async function copyPart(novelId: string, part: ExportPart) {
  try {
    await flushAllSaves();
    const r = await api.get<{ label: string; html: string; text: string; words: number }>(`/api/novels/${novelId}/export/clipboard${query(part)}`);
    if (!r.text.trim()) return toast.info(t('“{label}” doesn’t contain any text yet.', { label: r.label }));
    await copyRich(r.html, r.text);
    toast.success(tn(r.words, 'Copied “{label}” — {n} word.', 'Copied “{label}” — {n} words.', { label: r.label }));
  } catch (e) {
    toast.error(e);
  }
}

export async function downloadPart(novelId: string, part: ExportPart, format: 'docx' | 'markdown' = 'docx') {
  await flushAllSaves().catch(() => undefined);
  download(`/api/novels/${novelId}/export/${format}${query(part)}`);
}
