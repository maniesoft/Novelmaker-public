import { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Pin, PinOff, Plus, Trash2, X } from 'lucide-react';
import { CODEX_TYPES, codexTypeLabel, type CodexEntry, type CodexInclusion, type CodexType } from '@novelmaker/shared';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { keys, queryClient } from '../lib/queries';
import { isPinned, togglePin, usePins } from '../lib/pins';
import { toast } from '../lib/store';
import { Button, Checkbox, cn, confirmDialog, Field, Input, Select, Spinner, Textarea } from './ui';

export interface CodexEntryEditorProps {
  entry: CodexEntry;
  all: CodexEntry[];
  novelId: string;
  inSeries: boolean;
  relations: { id: string; aId: string; bId: string; label: string }[];
  /** Verknüpften Eintrag öffnen (Kodex-Seite: navigieren, Popup: Eintrag wechseln). */
  onOpenEntry: (id: string) => void;
  /** Szene öffnen, in der der Eintrag erwähnt wird. */
  onOpenScene: (sceneId: string) => void;
  /** Nach dem Löschen. */
  onDeleted: () => void;
  /** kompakter (im Popup) */
  compact?: boolean;
}

/** Bearbeitung eines Kodex-Eintrags – auf der Kodex-Seite und im Popup aus dem Text heraus. Speichert automatisch. */
export function CodexEntryEditor({ entry, all, novelId, inSeries, relations, onOpenEntry, onOpenScene, onDeleted, compact }: CodexEntryEditorProps) {
  const [e, setE] = useState(entry);
  const [aliasText, setAliasText] = useState(entry.aliases.join(', '));
  const [tagText, setTagText] = useState(entry.tags.join(', '));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<CodexEntry>>({});

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    try {
      await api.patch(`/api/codex/${entry.id}`, patch);
      queryClient.invalidateQueries({ queryKey: keys.codex(novelId) });
    } catch (err) {
      toast.error(err);
    }
  };
  const update = (patch: Partial<CodexEntry>, immediate = false) => {
    setE((x) => ({ ...x, ...patch }));
    pending.current = { ...pending.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, immediate ? 0 : 700);
  };
  useEffect(
    () => () => {
      void flush();
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const setLevel = async (level: 'novel' | 'series') => {
    await flush();
    await api.patch(`/api/codex/${entry.id}`, { level, novelId });
    queryClient.invalidateQueries({ queryKey: keys.codex(novelId) });
  };
  const remove = async () => {
    const typeLabel = CODEX_TYPES.some((x) => x.value === e.type) ? codexTypeLabel(e.type) : t('Entry');
    const ok = await confirmDialog({
      title: t('Delete “{name}”?', { name: e.name }),
      message: (
        <>
          <p>
            {e.type === 'character'
              ? t('The codex entry ({type}) will be deleted along with its links. Wherever the character is set as POV, that setting will be reset.', { type: typeLabel })
              : t('The codex entry ({type}) will be deleted along with its links.', { type: typeLabel })}
          </p>
          {!e.novelId && (
            <p className="mt-2 font-medium text-amber-700 dark:text-amber-500">{t('Warning: this entry belongs to the series and will then be missing from all volumes.')}</p>
          )}
        </>
      ),
    });
    if (!ok) return;
    pending.current = {};
    await api.del(`/api/codex/${entry.id}`).catch(toast.error);
    queryClient.invalidateQueries({ queryKey: keys.codex(novelId) });
    onDeleted();
  };

  const myRelations = relations.filter((r) => r.aId === entry.id || r.bId === entry.id);
  const [relOther, setRelOther] = useState('');
  const [relLabel, setRelLabel] = useState('');
  const addRelation = async () => {
    if (!relOther) return;
    await api.post(`/api/codex/${entry.id}/relations`, { otherId: relOther, label: relLabel });
    setRelOther('');
    setRelLabel('');
    queryClient.invalidateQueries({ queryKey: keys.codex(novelId) });
  };

  const [mentions, setMentions] = useState<{ sceneId: string; chapterTitle: string; sceneIndex: number; count: number }[] | null>(null);
  useEffect(() => {
    api.get<typeof mentions>(`/api/codex/${entry.id}/mentions?novelId=${novelId}`).then(setMentions, () => setMentions([]));
  }, [entry.id, novelId]);

  const byId = useMemo(() => new Map(all.map((x) => [x.id, x])), [all]);
  const inclusionHelp: Record<CodexInclusion, string> = {
    auto: t('Included as soon as the name or an alias appears in the text.'),
    always: t('Always included (codex.global) — for style, language, genre.'),
    never: t('Never automatically — only via codex.get(...) / codex.aliases(...). For lists like “AI-isms”.'),
  };

  const pins = usePins(novelId);
  const pinned = isPinned(pins, 'codex', entry.id);

  return (
    <div className={cn('mx-auto max-w-3xl space-y-5', compact ? 'p-0' : 'p-6')}>
      <div className="flex items-start gap-3">
        <Input value={e.name} onChange={(ev) => update({ name: ev.target.value })} className="h-10 flex-1 text-lg font-semibold" />
        <Button
          variant="ghost"
          className="h-10"
          icon={pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          onClick={() => void togglePin(novelId, 'codex', entry.id)}
          title={pinned ? t('Stop pinning next to the text') : t('Pin next to the text (stays visible while you write)')}
        />
        <Select value={e.type} onChange={(ev) => update({ type: ev.target.value as CodexType }, true)} className="h-10 w-36">
          {CODEX_TYPES.map((ct) => (
            <option key={ct.value} value={ct.value}>
              {t(ct.label)}
            </option>
          ))}
        </Select>
        <Button variant="ghost" className="h-10" icon={<Trash2 className="size-4" />} onClick={remove} title={t('Delete')} />
      </div>

      <Field label={t('Aliases')} hint={t('Comma-separated. Recognized in the text just like the name (including possessive ’s etc.).')}>
        <Input
          value={aliasText}
          onChange={(ev) => {
            setAliasText(ev.target.value);
            update({ aliases: ev.target.value.split(',').map((x) => x.trim()).filter(Boolean) });
          }}
          placeholder={t('e.g. Mia, Mrs. Huber')}
        />
      </Field>

      <Field label={t('Description (sent to the AI)')}>
        <Textarea autoGrow rows={6} value={e.description} onChange={(ev) => update({ description: ev.target.value })} className="font-serif text-[15px]" />
      </Field>

      <div>
        <div className="mb-1 text-xs font-medium text-stone-600 dark:text-stone-400">{t('Custom fields (also sent to the AI)')}</div>
        <div className="space-y-1.5">
          {e.fields.map((f, i) => (
            <div key={i} className="flex gap-2">
              <Input value={f.key} placeholder={t('Field')} className="w-40" onChange={(ev) => update({ fields: e.fields.map((x, j) => (j === i ? { ...x, key: ev.target.value } : x)) })} />
              <Input value={f.value} placeholder={t('Value')} onChange={(ev) => update({ fields: e.fields.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)) })} />
              <Button variant="ghost" icon={<X className="size-4" />} onClick={() => update({ fields: e.fields.filter((_, j) => j !== i) }, true)} />
            </div>
          ))}
          <Button size="xs" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => update({ fields: [...e.fields, { key: '', value: '' }] })}>
            {t('Add field')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 rounded-lg border border-stone-200 p-4 sm:grid-cols-2 dark:border-stone-800">
        <div>
          <div className="mb-2 text-xs font-medium text-stone-600 dark:text-stone-400">{t('Inclusion in prompts')}</div>
          {(['auto', 'always', 'never'] as CodexInclusion[]).map((v) => (
            <label key={v} className="mb-1.5 flex cursor-pointer items-start gap-2 text-sm">
              <input type="radio" className="mt-1 accent-amber-700" checked={e.inclusion === v} onChange={() => update({ inclusion: v }, true)} />
              <span>
                {v === 'auto' ? t('When mentioned') : v === 'always' ? t('Always') : t('Never (on request only)')}
                <span className="block text-xs text-stone-500">{inclusionHelp[v]}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="space-y-3">
          <Checkbox
            checked={e.caseSensitive}
            onChange={(v) => update({ caseSensitive: v }, true)}
            label={t('Case-sensitive')}
            hint={t('Useful for names that are also ordinary words (e.g. “Rose”).')}
          />
          {inSeries && (
            <Field label={t('Level')}>
              <Select value={e.novelId ? 'novel' : 'series'} onChange={(ev) => setLevel(ev.target.value as 'novel' | 'series')}>
                <option value="novel">{t('This volume only')}</option>
                <option value="series">{t('Whole series (all volumes)')}</option>
              </Select>
            </Field>
          )}
          <Field label={t('Tags')}>
            <Input
              value={tagText}
              onChange={(ev) => {
                setTagText(ev.target.value);
                update({ tags: ev.target.value.split(',').map((x) => x.trim()).filter(Boolean) });
              }}
              placeholder={t('comma-separated')}
            />
          </Field>
        </div>
      </div>

      <Field label={t('Notes (just for you, not sent to the AI)')}>
        <Textarea autoGrow rows={3} value={e.notes} onChange={(ev) => update({ notes: ev.target.value })} />
      </Field>

      <div>
        <div className="mb-1 text-xs font-medium text-stone-600 dark:text-stone-400">{t('Relationships')}</div>
        <div className="space-y-1">
          {myRelations.map((r) => {
            const other = byId.get(r.aId === entry.id ? r.bId : r.aId);
            if (!other) return null;
            return (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                <Link2 className="size-3.5 text-stone-400" />
                <button type="button" className="font-medium hover:underline" onClick={() => onOpenEntry(other.id)}>
                  {other.name}
                </button>
                {r.label && <span className="text-stone-500">– {r.label}</span>}
                <button
                  type="button"
                  className="ml-auto text-stone-400 hover:text-red-600"
                  onClick={() => api.del(`/api/codex-relations/${r.id}`).then(() => queryClient.invalidateQueries({ queryKey: keys.codex(novelId) }))}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <Select value={relOther} onChange={(ev) => setRelOther(ev.target.value)} className="w-56">
            <option value="">{t('Choose entry…')}</option>
            {all
              .filter((x) => x.id !== entry.id)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </Select>
          <Input value={relLabel} onChange={(ev) => setRelLabel(ev.target.value)} placeholder={t('Type of relationship (optional)')} />
          <Button disabled={!relOther} onClick={addRelation}>
            {t('Link')}
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-stone-600 dark:text-stone-400">{t('Mentioned in')}</div>
        {mentions == null ? (
          <Spinner />
        ) : mentions.length ? (
          <div className="flex flex-wrap gap-1.5">
            {mentions.map((m) => (
              <button
                key={m.sceneId}
                type="button"
                onClick={() => onOpenScene(m.sceneId)}
                className="rounded-full border border-stone-200 px-2 py-0.5 text-xs hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
              >
                {m.chapterTitle} · {m.sceneIndex} <span className="text-stone-400">({m.count}×)</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-sm text-stone-500">{e.inclusion === 'never' ? t('Entries set to “never” aren’t searched for in the text.') : t('Not mentioned anywhere yet.')}</div>
        )}
      </div>
    </div>
  );
}
