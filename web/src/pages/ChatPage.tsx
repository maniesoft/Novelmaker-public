import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BookOpen, Copy, ListPlus, MessagesSquare, MoreHorizontal, Plus, RotateCcw, Send, Square, StickyNote, Trash2 } from 'lucide-react';
import {
  beatsFromText,
  CODEX_TYPES,
  codexTypeLabel,
  type ChatMessage,
  type ChatThread,
  type CodexType,
  type InputValues,
  type ModelRef,
  type Outline,
  type PMDoc,
  type GenerateRequest,
  type RefValue,
  type Scene,
} from '@novelmaker/shared';
import {
  ContextPicker,
  EstimateChip,
  EstimateHover,
  InputsForm,
  isReferenceInput,
  ModelPicker,
  PreviewModal,
  PromptPicker,
  useCostEstimate,
  useDefaultModel,
  usePromptInputs,
  WarningsList,
} from '../components/ai';
import { Markdown } from '../components/Markdown';
import { Badge, Button, cn, confirmDialog, Empty, Field, formatDate, Input, Menu, MenuItem, Modal, Select, Spinner, Textarea } from '../components/ui';
import { api, copyText, streamSSE } from '../lib/api';
import { invalidateNovel, keys, queryClient, useChat, useChats, useOutline, usePrompts } from '../lib/queries';
import { toast } from '../lib/store';
import { chapterLabel, sceneLabel } from './OutlineTree';
import { t, tn } from '../lib/i18n';


export function ChatPage() {
  const { novelId = '', threadId } = useParams();
  const navigate = useNavigate();
  const { data: threads } = useChats(novelId);
  const defModel = useDefaultModel();

  const create = async () => {
    const th = await api.post<ChatThread>(`/api/novels/${novelId}/chats`, { model: defModel });
    queryClient.invalidateQueries({ queryKey: keys.chats(novelId) });
    navigate(`/novel/${novelId}/chat/${th.id}`);
  };
  const remove = async (th: ChatThread) => {
    const ok = await confirmDialog({
      title: t('Delete chat “{title}”?', { title: th.title || t('New chat') }),
      message: t('The chat will be deleted with all its messages. Responses already added to snippets, the Codex, or scenes are kept.'),
    });
    if (!ok) return;
    await api.del(`/api/chats/${th.id}`).catch(toast.error);
    queryClient.invalidateQueries({ queryKey: keys.chats(novelId) });
    if (th.id === threadId) navigate(`/novel/${novelId}/chat`);
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-stone-200 bg-stone-100/60 dark:border-stone-800 dark:bg-stone-900/40">
        <div className="p-3">
          <Button variant="primary" size="sm" className="w-full" icon={<Plus className="size-4" />} onClick={create}>
            {t('New chat')}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {threads?.map((th) => (
            <div
              key={th.id}
              onClick={() => navigate(`/novel/${novelId}/chat/${th.id}`)}
              className={cn('group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-sm', th.id === threadId ? 'bg-amber-100 dark:bg-amber-900/40' : 'hover:bg-stone-200/60 dark:hover:bg-stone-800')}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{th.title || t('New chat')}</span>
                <span className="block text-[11px] text-stone-500">{formatDate(th.updatedAt)}</span>
              </span>
              <button
                type="button"
                title={t('Delete chat')}
                className="shrink-0 rounded p-1 text-stone-400 opacity-40 group-hover:opacity-100 hover:text-red-600"
                onClick={(e) => (e.stopPropagation(), remove(th))}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>
      <section className="min-w-0 flex-1">
        {threadId ? (
          <ChatView key={threadId} novelId={novelId} threadId={threadId} />
        ) : (
          <Empty icon={<MessagesSquare className="size-12" />} title={t('Free chat')}>
            {t(
              'Discuss plot, characters, and ideas with the AI. Choose any context at the top of the chat (acts, chapters, scenes, Codex, snippets, your own text). Responses can be saved as a snippet or codex entry, or added to a scene as beats.',
            )}
            <div className="mt-4">
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={create}>
                {t('Start chat')}
              </Button>
            </div>
          </Empty>
        )}
      </section>
    </div>
  );
}

function ChatView({ novelId, threadId }: { novelId: string; threadId: string }) {
  const { data, isLoading } = useChat(threadId);
  const { data: prompts } = usePrompts();
  const defModel = useDefaultModel();
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState<{ text: string; user: string | null } | null>(null);
  const [warnings, setWarnings] = useState<{ level: string; message: string }[]>([]);
  const [preview, setPreview] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (data?.thread && !thread) setThread({ ...data.thread, model: data.thread.model ?? defModel });
  }, [data, thread, defModel]);

  const prompt = useMemo(() => prompts?.find((p) => p.id === thread?.promptId) ?? null, [prompts, thread?.promptId]);
  const promptInputs = usePromptInputs(prompt);
  // Kontext-Feld (addToContext, Mehrfachauswahl) wird über die Kontextleiste befüllt
  const contextInput = promptInputs.find((d) => d.addToContext && d.mode === 'multiple' && isReferenceInput(d));
  const formInputs = promptInputs.filter((d) => d !== contextInput);

  const save = (patch: Partial<ChatThread>) => {
    setThread((cur) => (cur ? { ...cur, ...patch } : cur));
    void api.patch(`/api/chats/${threadId}`, patch).catch(toast.error);
  };

  // Tokens/Kosten und Warnungen (verzögert)
  const est = useCostEstimate(
    () =>
      thread?.promptId
        ? ({
            kind: 'chat',
            promptId: thread.promptId,
            model: thread.model ?? undefined,
            novelId,
            message: text,
            inputs: thread.inputs,
            context: thread.context,
            chatThreadId: threadId,
          } as GenerateRequest)
        : null,
    [thread?.promptId, thread?.model, thread?.inputs, thread?.context, text, novelId, threadId, data?.messages.length],
  );
  useEffect(() => {
    if (est.estimate) setWarnings(est.estimate.warnings.filter((w) => w.level !== 'info'));
  }, [est.estimate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [data?.messages.length, streaming?.text]);

  const send = async (regenerate = false) => {
    if (!thread) return;
    const content = text.trim();
    if (!regenerate && !content) return;
    if (!thread.model) return toast.error(t('Please choose a model.'));
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming({ text: '', user: regenerate ? null : content });
    if (!regenerate) setText('');
    try {
      await streamSSE(
        `/api/chats/${threadId}/send`,
        { content, regenerate, promptId: thread.promptId, model: thread.model, inputs: thread.inputs, context: thread.context },
        {
          onEvent: (ev, d) => {
            if (ev === 'delta') setStreaming((s) => (s ? { ...s, text: s.text + d.text } : s));
            else if (ev === 'meta') {
              setWarnings((d.warnings ?? []).filter((w: { level: string }) => w.level !== 'info'));
              if (d.threadTitle) queryClient.invalidateQueries({ queryKey: keys.chats(novelId) });
            } else if (ev === 'error') toast.error(d.message);
          },
        },
        controller.signal,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        toast.error(e);
        if (!regenerate) setText(content);
      }
    } finally {
      abortRef.current = null;
      await queryClient.invalidateQueries({ queryKey: keys.chat(threadId) });
      setStreaming(null);
      queryClient.invalidateQueries({ queryKey: keys.logs });
    }
  };

  if (isLoading || !thread) return <div className="p-6"><Spinner /></div>;
  const messages = data?.messages ?? [];
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-6 py-6">
          {!messages.length && !streaming && <div className="py-10 text-center text-sm text-stone-500">{t('Ask a question or give a task — e.g. “Develop beats for this scene”.')}</div>}
          {messages.map((m) => (
            <Bubble key={m.id} m={m} novelId={novelId} threadId={threadId} isLast={m.id === lastAssistant?.id} onRegenerate={() => send(true)} busy={!!streaming} />
          ))}
          {streaming && (
            <>
              {streaming.user && <Bubble m={{ id: 'u', threadId, role: 'user', content: streaming.user, createdAt: '', model: null, logId: null }} novelId={novelId} threadId={threadId} busy />}
              <div className="rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-stone-900">
                <Markdown text={streaming.text} caret className="text-[15px] leading-relaxed" />
              </div>
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="border-t border-stone-200 bg-white/80 dark:border-stone-800 dark:bg-stone-900/70">
        <div className="mx-auto max-w-3xl space-y-2 px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <PromptPicker types={['workshop-chat']} value={thread.promptId} onChange={(id) => save({ promptId: id })} />
            <ModelPicker value={thread.model} onChange={(m: ModelRef) => save({ model: m })} />
            <InputsForm inputs={formInputs} values={thread.inputs} onChange={(v: InputValues) => save({ inputs: v })} novelId={novelId} compact />
            <span className="ml-auto flex items-center gap-2 text-xs text-stone-500">
              <EstimateChip estimate={est.estimate} withTokens onHover={est.refresh} />
              <button type="button" className="hover:underline" onClick={() => setPreview(true)}>
                {t('Preview')}
              </button>
            </span>
          </div>
          {contextInput ? (
            <ContextPicker novelId={novelId} value={thread.context} onChange={(c: RefValue[]) => save({ context: c })} label={`${t('Context')}:`} />
          ) : (
            <div className="text-xs text-stone-500">{t('This prompt has no context picker.')}</div>
          )}
          <WarningsList warnings={warnings} />
          <div className="flex items-end gap-2">
            <Textarea
              autoGrow
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('Message… (Enter to send, Shift+Enter for a new line)')}
              className="max-h-64 overflow-y-auto"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!streaming) void send();
                }
              }}
            />
            {streaming ? (
              <Button variant="secondary" className="h-10" icon={<Square className="size-3.5" />} onClick={() => abortRef.current?.abort()}>
                {t('Stop')}
              </Button>
            ) : (
              <EstimateHover estimate={est.estimate} loading={est.loading} onHover={est.refresh}>
                <Button variant="primary" className="h-10" icon={<Send className="size-4" />} onClick={() => send()} disabled={!text.trim()}>
                  {t('Send')}
                </Button>
              </EstimateHover>
            )}
          </div>
        </div>
      </div>
      {preview && thread.promptId && (
        <PreviewModal
          request={{ kind: 'chat', promptId: thread.promptId, novelId, message: text, inputs: thread.inputs, chatThreadId: threadId, ...({ context: thread.context } as object) }}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  );
}

function Bubble({ m, novelId, threadId, isLast, onRegenerate, busy }: { m: ChatMessage; novelId: string; threadId: string; isLast?: boolean; onRegenerate?: () => void; busy?: boolean }) {
  const [dialog, setDialog] = useState<'snippet' | 'codex' | 'beats' | null>(null);
  const user = m.role === 'user';
  const remove = async () => {
    const preview = m.content.length > 160 ? `${m.content.slice(0, 160)}…` : m.content;
    const ok = await confirmDialog({
      title: t('Delete message?'),
      message: <p className="line-clamp-4 whitespace-pre-wrap text-stone-500">{preview}</p>,
    });
    if (!ok) return;
    await api.del(`/api/chat-messages/${m.id}`).catch(toast.error);
    queryClient.invalidateQueries({ queryKey: keys.chat(threadId) });
  };
  return (
    <div className={cn('group flex', user && 'justify-end')}>
      <div className={cn('max-w-[85%] rounded-xl px-4 py-3 shadow-sm', user ? 'bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-50' : 'bg-white dark:bg-stone-900')}>
        {user ? (
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{m.content}</div>
        ) : (
          <Markdown text={m.content} className="text-[15px] leading-relaxed" />
        )}
        {m.id !== 'u' && (
          <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {m.model && <span className="mr-2 text-[11px] text-stone-400">{m.model}</span>}
            <Button size="xs" variant="ghost" icon={<Copy className="size-3" />} onClick={() => copyText(m.content).then(() => toast.success(t('Copied')))}>
              {t('Copy')}
            </Button>
            {!user && (
              <Button size="xs" variant="ghost" icon={<ListPlus className="size-3" />} onClick={() => setDialog('beats')}>
                {t('As beats')}
              </Button>
            )}
            <Menu
              trigger={(onToggle, ref) => (
                <button ref={ref} type="button" onClick={onToggle} className="rounded p-1 text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800">
                  <MoreHorizontal className="size-3.5" />
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem icon={<StickyNote />} onClick={() => (close(), setDialog('snippet'))}>
                    {t('Save as snippet')}
                  </MenuItem>
                  <MenuItem icon={<BookOpen />} onClick={() => (close(), setDialog('codex'))}>
                    {t('Save as codex entry')}
                  </MenuItem>
                  {isLast && onRegenerate && (
                    <MenuItem icon={<RotateCcw />} disabled={busy} onClick={() => (close(), onRegenerate())}>
                      {t('Regenerate')}
                    </MenuItem>
                  )}
                  <MenuItem danger icon={<Trash2 />} onClick={() => (close(), remove())}>
                    {t('Delete message')}
                  </MenuItem>
                </>
              )}
            </Menu>
          </div>
        )}
      </div>
      {dialog === 'snippet' && <SnippetDialog novelId={novelId} text={m.content} onClose={() => setDialog(null)} />}
      {dialog === 'codex' && <CodexDialog novelId={novelId} text={m.content} onClose={() => setDialog(null)} />}
      {dialog === 'beats' && <BeatsDialog novelId={novelId} text={m.content} onClose={() => setDialog(null)} />}
    </div>
  );
}

function SnippetDialog({ novelId, text, onClose }: { novelId: string; text: string; onClose: () => void }) {
  const [title, setTitle] = useState(text.split('\n')[0].replace(/^#+\s*/, '').slice(0, 60));
  const save = async () => {
    await api.post(`/api/novels/${novelId}/snippets`, { title, text });
    queryClient.invalidateQueries({ queryKey: keys.snippets(novelId) });
    toast.success(t('Snippet saved'));
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('Save as snippet')}
      footer={
        <Button variant="primary" onClick={save}>
          {t('Save')}
        </Button>
      }
    >
      <Field label={t('Title')}>
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
    </Modal>
  );
}

function CodexDialog({ novelId, text, onClose }: { novelId: string; text: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [type, setType] = useState<CodexType>('character');
  const [description, setDescription] = useState(text);
  const save = async () => {
    const e = await api.post<{ id: string }>(`/api/novels/${novelId}/codex`, { name, type, description });
    queryClient.invalidateQueries({ queryKey: keys.codex(novelId) });
    onClose();
    navigate(`/novel/${novelId}/codex/${e.id}`);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('Create codex entry')}
      width="max-w-2xl"
      footer={
        <Button variant="primary" disabled={!name.trim()} onClick={save}>
          {t('Create')}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <Field label={t('Name')} className="flex-1">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('Type')}>
            <Select value={type} onChange={(e) => setType(e.target.value as CodexType)}>
              {CODEX_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {codexTypeLabel(ct.value)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t('Description')}>
          <Textarea rows={10} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Nummerierte Liste → Beat-Blöcke am Ende (oder Anfang) einer Szene. */
function BeatsDialog({ novelId, text, onClose }: { novelId: string; text: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: outline } = useOutline(novelId);
  const beats = useMemo(() => beatsFromText(text), [text]);
  const [sceneId, setSceneId] = useState('');
  const [where, setWhere] = useState<'end' | 'start'>('end');
  const [busy, setBusy] = useState(false);
  const options = useMemo(() => sceneOptions(outline), [outline]);
  useEffect(() => {
    if (!sceneId && options.length) setSceneId(localStorage.getItem(`nm-last-scene-${novelId}`) ?? options[0].id);
  }, [options, sceneId, novelId]);
  const apply = async (newScene: boolean) => {
    setBusy(true);
    try {
      let target = sceneId;
      if (newScene) {
        const cur = options.find((o) => o.id === sceneId);
        const s = await api.post<Scene>('/api/scenes', { chapterId: cur?.chapterId ?? outline!.acts[0].chapters[0].id });
        target = s.id;
      }
      const scene = await api.get<Scene>(`/api/scenes/${target}`);
      await api.post(`/api/scenes/${target}/snapshots`, { reason: t('Before adding beats from chat') });
      const existing = (scene.content.content ?? []).filter((n) => !(n.type === 'paragraph' && !n.content?.length));
      const content: PMDoc = { type: 'doc', content: where === 'end' ? [...existing, ...beats, { type: 'paragraph' }] : [...beats, ...existing] };
      await api.patch(`/api/scenes/${target}`, { content });
      queryClient.invalidateQueries({ queryKey: keys.scene(target) });
      invalidateNovel(novelId);
      toast.success(tn(beats.length, '{n} beat added', '{n} beats added'));
      onClose();
      navigate(`/novel/${novelId}/write/${target}`);
    } catch (e) {
      toast.error(e);
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={tn(beats.length, 'Add {n} beat to a scene', 'Add {n} beats to a scene')}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => apply(true)} loading={busy} title={t('Creates a new scene in the chapter of the selected scene')}>
            {t('Into a new scene')}
          </Button>
          <Button variant="primary" onClick={() => apply(false)} loading={busy} disabled={!sceneId}>
            {t('Accept')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <Field label={t('Scene')} className="flex-1">
            <Select value={sceneId} onChange={(e) => setSceneId(e.target.value)}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('Position')}>
            <Select value={where} onChange={(e) => setWhere(e.target.value as 'end' | 'start')}>
              <option value="end">{t('at the end')}</option>
              <option value="start">{t('at the beginning')}</option>
            </Select>
          </Field>
        </div>
        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          {beats.map((b, i) => (
            <div key={i} className="beat-static">
              <Badge tone="amber" className="mr-2">
                {t('Beat')}
              </Badge>
              {(b.content ?? []).map((c) => c.text).join('')}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function sceneOptions(outline: Outline | undefined) {
  if (!outline) return [];
  const out: { id: string; label: string; chapterId: string }[] = [];
  let chNo = 0;
  for (const a of outline.acts)
    for (const c of a.chapters) {
      chNo++;
      c.scenes.forEach((s, i) => out.push({ id: s.id, chapterId: c.id, label: `${chapterLabel(c, chNo)}${c.scenes.length > 1 ? ` · ${sceneLabel(s, i + 1)}` : ''}` }));
    }
  return out;
}
