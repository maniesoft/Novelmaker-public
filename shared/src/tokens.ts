// Grobe Token-Schätzung ohne Tokenizer. Für Deutsch etwas konservativer als die übliche 4-Zeichen-Regel.
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

/** Tokens pro Wort (Deutsch, grob) – für die erwartete Antwortlänge aus „Wörter“. */
export const TOKENS_PER_WORD = 1.8;

export function wordsToTokens(words: number): number {
  return Math.round(words * TOKENS_PER_WORD);
}

export function estimateMessagesTokens(messages: { content: string }[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
}

export function formatTokens(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return '–';
  if (usd === 0) return '0 $';
  // unter 1 $ einheitlich in Cent, damit Beträge nebeneinander vergleichbar bleiben
  if (usd < 1) {
    const ct = usd * 100;
    return `${ct.toFixed(ct < 0.1 ? 3 : ct < 10 ? 2 : 1)} ¢`;
  }
  return `${usd.toFixed(2)} $`;
}
