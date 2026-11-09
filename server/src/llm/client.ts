// Ein Client für alle OpenAI-kompatiblen APIs (/v1/chat/completions mit Streaming).
import { t, type Provider, type ProviderModel, type RenderedMessage } from '@novelmaker/shared';

export class LlmError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

function headers(p: Provider): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (p.apiKey) h.Authorization = `Bearer ${p.apiKey}`;
  if (p.kind === 'openrouter') {
    h['HTTP-Referer'] = 'http://localhost:3000';
    h['X-Title'] = 'Novelmaker';
  }
  return h;
}

async function errorText(res: Response): Promise<string> {
  const body = await res.text().catch(() => '');
  try {
    const j = JSON.parse(body);
    const msg = j?.error?.message ?? j?.message ?? j?.error ?? body;
    const raw = j?.error?.metadata?.raw;
    return `${typeof msg === 'string' ? msg : JSON.stringify(msg)}${raw ? ` (${String(raw).slice(0, 300)})` : ''}`;
  } catch {
    return body.slice(0, 500) || res.statusText;
  }
}

export async function fetchModels(p: Provider): Promise<ProviderModel[]> {
  let res: Response;
  try {
    res = await fetch(`${p.baseUrl}/models`, { headers: headers(p), signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new LlmError(t('{name} is unreachable ({error})', { name: p.name, error: (e as Error).message }));
  }
  if (!res.ok) throw new LlmError(`${p.name}: ${res.status} ${await errorText(res)}`, res.status);
  const j = (await res.json()) as { data?: any[]; models?: any[] };
  const list = j.data ?? j.models ?? [];
  return list
    .map((m: any): ProviderModel => {
      const pricing =
        m.pricing && (m.pricing.prompt != null || m.pricing.completion != null)
          ? { prompt: Number(m.pricing.prompt) || 0, completion: Number(m.pricing.completion) || 0 }
          : undefined;
      return {
        id: String(m.id ?? m.name ?? m.model),
        name: m.name && m.name !== m.id ? String(m.name) : undefined,
        contextLength: m.context_length ?? m.top_provider?.context_length ?? m.max_context_length ?? undefined,
        pricing,
      };
    })
    .filter((m: ProviderModel) => m.id && m.id !== 'undefined')
    .sort((a: ProviderModel, b: ProviderModel) => a.id.localeCompare(b.id));
}

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'usage'; promptTokens: number | null; completionTokens: number | null; cost: number | null }
  | { type: 'finish'; reason: string };

export interface ChatRequest {
  provider: Provider;
  model: string;
  messages: RenderedMessage[];
  params?: Record<string, unknown>;
  signal?: AbortSignal;
}

/** Streamt eine Chat-Completion. Wirft LlmError bei HTTP- oder API-Fehlern. */
export async function* streamChat(req: ChatRequest): AsyncGenerator<StreamEvent> {
  const { provider, model, messages, params, signal } = req;
  const body: Record<string, unknown> = { ...(params ?? {}), model, messages, stream: true };
  if (provider.kind === 'openrouter') {
    body.usage = { include: true };
    body.stream_options = { include_usage: true };
  }
  let res: Response;
  try {
    res = await fetch(`${provider.baseUrl}/chat/completions`, { method: 'POST', headers: headers(provider), body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new LlmError(t('{name} is unreachable ({error})', { name: provider.name, error: (e as Error).message }));
  }
  if (!res.ok || !res.body) throw new LlmError(`${provider.name}: ${res.status} ${await errorText(res)}`, res.status);

  const ctype = res.headers.get('content-type') ?? '';
  if (!ctype.includes('event-stream') && ctype.includes('json')) {
    // Server ignoriert stream=true
    const j = (await res.json()) as any;
    if (j.error) throw new LlmError(String(j.error.message ?? j.error));
    const text = j.choices?.[0]?.message?.content ?? '';
    if (text) yield { type: 'delta', text };
    if (j.usage) yield { type: 'usage', promptTokens: j.usage.prompt_tokens ?? null, completionTokens: j.usage.completion_tokens ?? null, cost: j.usage.cost ?? null };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === '[DONE]') return;
        let j: any;
        try {
          j = JSON.parse(data);
        } catch {
          continue;
        }
        if (j.error) throw new LlmError(String(j.error.message ?? JSON.stringify(j.error)));
        const choice = j.choices?.[0];
        const delta = choice?.delta ?? {};
        if (typeof delta.content === 'string' && delta.content) yield { type: 'delta', text: delta.content };
        const reasoning = delta.reasoning ?? delta.reasoning_content;
        if (typeof reasoning === 'string' && reasoning) yield { type: 'reasoning', text: reasoning };
        if (choice?.text && typeof choice.text === 'string') yield { type: 'delta', text: choice.text };
        if (choice?.finish_reason) yield { type: 'finish', reason: choice.finish_reason };
        if (j.usage)
          yield {
            type: 'usage',
            promptTokens: j.usage.prompt_tokens ?? null,
            completionTokens: j.usage.completion_tokens ?? null,
            cost: typeof j.usage.cost === 'number' ? j.usage.cost : null,
          };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Nicht streamend (für Hintergrund-Jobs): sammelt den Stream ein. */
export async function completeChat(req: ChatRequest): Promise<{ text: string; promptTokens: number | null; completionTokens: number | null; cost: number | null; finish: string | null }> {
  let text = '';
  let usage = { promptTokens: null as number | null, completionTokens: null as number | null, cost: null as number | null };
  let finish: string | null = null;
  for await (const ev of streamChat(req)) {
    if (ev.type === 'delta') text += ev.text;
    else if (ev.type === 'usage') usage = { promptTokens: ev.promptTokens, completionTokens: ev.completionTokens, cost: ev.cost };
    else if (ev.type === 'finish') finish = ev.reason;
  }
  return { text, ...usage, finish };
}
