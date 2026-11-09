// Kodex-Eintrag direkt über dem Text bearbeiten: kein Seitenwechsel, nach dem Schließen ist man an derselben Stelle.
import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { create } from 'zustand';
import { t } from '../lib/i18n';
import { useCodex, useNovel } from '../lib/queries';
import { Button, Modal, Spinner } from './ui';
import { CodexEntryEditor } from './CodexEntryEditor';
import { useActiveEditor } from '../editor/scope';

interface CodexModalState {
  novelId: string | null;
  entryId: string | null;
  open: (novelId: string, entryId: string) => void;
  close: () => void;
}

export const useCodexModal = create<CodexModalState>((set) => ({
  novelId: null,
  entryId: null,
  open: (novelId, entryId) => set({ novelId, entryId }),
  close: () => set({ novelId: null, entryId: null }),
}));

export const openCodexModal = (novelId: string, entryId: string) => useCodexModal.getState().open(novelId, entryId);

/** Einmal pro Roman-Ansicht eingebunden (App-Shell). */
export function CodexModalHost() {
  const { novelId, entryId, open, close } = useCodexModal();
  const navigate = useNavigate();
  const { data } = useCodex(novelId ?? undefined);
  const { data: novel } = useNovel(novelId ?? undefined);
  if (!novelId || !entryId) return null;
  const entry = data?.entries.find((e) => e.id === entryId);
  const finish = () => {
    close();
    // Cursor zurück in den Text, an dieselbe Stelle
    const ed = useActiveEditor.getState().editor;
    if (ed && !ed.isDestroyed) setTimeout(() => ed.commands.focus(), 0);
  };
  return (
    <Modal
      open
      onClose={finish}
      width="max-w-3xl"
      title={t('Codex entry')}
      footer={
        <>
          <Button
            variant="ghost"
            icon={<ExternalLink className="size-4" />}
            onClick={() => {
              close();
              navigate(`/novel/${novelId}/codex/${entryId}`);
            }}
          >
            {t('Open in Codex')}
          </Button>
          <Button variant="primary" onClick={finish}>
            {t('Done')}
          </Button>
        </>
      }
    >
      {!data || !novel ? (
        <Spinner />
      ) : !entry ? (
        <div className="text-sm text-stone-500">{t('The entry no longer exists.')}</div>
      ) : (
        <CodexEntryEditor
          key={entry.id}
          compact
          entry={entry}
          all={data.entries}
          novelId={novelId}
          inSeries={!!novel.seriesId}
          relations={data.relations}
          onOpenEntry={(id) => open(novelId, id)}
          onOpenScene={(sceneId) => {
            close();
            navigate(`/novel/${novelId}/write/${sceneId}`);
          }}
          onDeleted={close}
        />
      )}
    </Modal>
  );
}
