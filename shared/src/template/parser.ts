// Parser für die Prompt-Syntax („aic2“, kompatibel zu aus Novelcrafter importierten Prompts).
//   {ausdruck}   {#if b}…{#elseif b}…{#else}…{#endif}   {! Kommentar !}
// Ausdrücke: Funktionsaufrufe mit Punkt-Namen, Strings ('…' oder "…"), Zahlen,
// + (Verkettung), is / is not / in / not in, and / or / not, Klammern.
import { getLang, t as tr } from '../i18n';

export type Expr =
  | { kind: 'str'; value: string }
  | { kind: 'num'; value: number }
  | { kind: 'lit'; value: boolean | null }
  | { kind: 'call'; name: string; args: Expr[] | null; pos: number }
  | { kind: 'bin'; op: BinOp; left: Expr; right: Expr }
  | { kind: 'not'; expr: Expr };

export type BinOp = '+' | 'is' | 'isnot' | 'in' | 'notin' | 'and' | 'or' | '<' | '>' | '<=' | '>=';

export type TNode =
  | { kind: 'text'; value: string }
  | { kind: 'expr'; expr: Expr; src: string; pos: number }
  | { kind: 'if'; branches: { cond: Expr | null; body: TNode[] }[] };

export interface ParseIssue {
  pos: number;
  line: number;
  col: number;
  message: string;
}

export interface ParsedTemplate {
  nodes: TNode[];
  issues: ParseIssue[];
}

// ---------------------------------------------------------------- Ausdrucks-Lexer

type Tok =
  | { t: 'str'; v: string; pos: number }
  | { t: 'num'; v: number; pos: number }
  | { t: 'id'; v: string; pos: number }
  | { t: 'op'; v: string; pos: number }
  | { t: 'end'; pos: number }
  | { t: 'eof'; pos: number };

class ExprError extends Error {
  constructor(
    message: string,
    public pos: number,
  ) {
    super(message);
  }
}

class ExprParser {
  private pos: number;
  private peeked: Tok | null = null;
  private peekedAt = -1;

  constructor(
    private src: string,
    start: number,
  ) {
    this.pos = start;
  }

  get position() {
    return this.pos;
  }

  private lex(): Tok {
    const s = this.src;
    let i = this.pos;
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) {
      this.pos = i;
      return { t: 'eof', pos: i };
    }
    const c = s[i];
    const start = i;
    if (c === '}') {
      this.pos = i + 1;
      return { t: 'end', pos: start };
    }
    if (c === '"' || c === "'" || c === '“' || c === '„') {
      const close = c === '“' || c === '„' ? '”“' : c;
      i++;
      let v = '';
      while (i < s.length && !close.includes(s[i])) {
        if (s[i] === '\\' && i + 1 < s.length) {
          const n = s[i + 1];
          v += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          i += 2;
          continue;
        }
        v += s[i++];
      }
      if (i >= s.length) throw new ExprError(tr('Unterminated string (missing quotation mark)'), start);
      this.pos = i + 1;
      return { t: 'str', v, pos: start };
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(s[i + 1] ?? ''))) {
      i++;
      while (i < s.length && /[0-9.]/.test(s[i])) i++;
      this.pos = i;
      return { t: 'num', v: Number(s.slice(start, i)), pos: start };
    }
    if (/[\p{L}_$]/u.test(c)) {
      i++;
      while (i < s.length && /[\p{L}\p{N}_$.]/u.test(s[i])) i++;
      let v = s.slice(start, i);
      // abschließenden Punkt nicht zum Namen zählen
      while (v.endsWith('.')) {
        v = v.slice(0, -1);
        i--;
      }
      this.pos = i;
      return { t: 'id', v, pos: start };
    }
    const two = s.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
      this.pos = i + 2;
      return { t: 'op', v: two, pos: start };
    }
    if ('(),+!<>='.includes(c)) {
      this.pos = i + 1;
      return { t: 'op', v: c, pos: start };
    }
    throw new ExprError(tr('Unexpected character “{char}”', { char: c }), start);
  }

  peek(): Tok {
    if (!this.peeked || this.peekedAt !== this.pos) {
      const save = this.pos;
      this.peeked = this.lex();
      this.peekedAt = save;
      this.pos = save;
    }
    return this.peeked;
  }

  next(): Tok {
    const t = this.peek();
    this.lex();
    this.peeked = null;
    return t;
  }

  /** Nächstes Token nach dem aktuellen (ohne zu verbrauchen). */
  peek2(): Tok {
    const save = this.pos;
    this.lex();
    const t = this.lex();
    this.pos = save;
    this.peeked = null;
    return t;
  }

  private isKw(t: Tok, kw: string): boolean {
    return t.t === 'id' && t.v.toLowerCase() === kw;
  }

  private isOp(t: Tok, op: string): boolean {
    return t.t === 'op' && t.v === op;
  }

  parseExpr(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    for (;;) {
      const t = this.peek();
      if ((this.isKw(t, 'or') && !this.isOp(this.peek2(), '(')) || this.isOp(t, '||')) {
        this.next();
        left = { kind: 'bin', op: 'or', left, right: this.parseAnd() };
      } else return left;
    }
  }

  private parseAnd(): Expr {
    let left = this.parseCmp();
    for (;;) {
      const t = this.peek();
      if ((this.isKw(t, 'and') && !this.isOp(this.peek2(), '(')) || this.isOp(t, '&&')) {
        this.next();
        left = { kind: 'bin', op: 'and', left, right: this.parseCmp() };
      } else return left;
    }
  }

  private parseCmp(): Expr {
    const left = this.parseAdd();
    const t = this.peek();
    let op: BinOp | null = null;
    if (this.isKw(t, 'is')) {
      this.next();
      if (this.isKw(this.peek(), 'not')) {
        this.next();
        op = 'isnot';
      } else op = 'is';
    } else if (this.isKw(t, 'in')) {
      this.next();
      op = 'in';
    } else if (this.isKw(t, 'not') && this.isKw(this.peek2(), 'in')) {
      this.next();
      this.next();
      op = 'notin';
    } else if (t.t === 'op' && ['==', '=', '!=', '<', '>', '<=', '>='].includes(t.v)) {
      this.next();
      op = t.v === '==' || t.v === '=' ? 'is' : t.v === '!=' ? 'isnot' : (t.v as BinOp);
    }
    if (!op) return left;
    return { kind: 'bin', op, left, right: this.parseAdd() };
  }

  private parseAdd(): Expr {
    let left = this.parseUnary();
    while (this.isOp(this.peek(), '+')) {
      this.next();
      left = { kind: 'bin', op: '+', left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (this.isOp(t, '!') || (this.isKw(t, 'not') && !this.isOp(this.peek2(), '('))) {
      this.next();
      return { kind: 'not', expr: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const t = this.next();
    switch (t.t) {
      case 'str':
        return { kind: 'str', value: t.v };
      case 'num':
        return { kind: 'num', value: t.v };
      case 'op':
        if (t.v === '(') {
          const e = this.parseExpr();
          const close = this.next();
          if (!this.isOp(close, ')')) throw new ExprError(tr('Expected “)”'), close.pos);
          return e;
        }
        throw new ExprError(tr('Unexpected “{token}”', { token: t.v }), t.pos);
      case 'id': {
        const lower = t.v.toLowerCase();
        if (lower === 'true' || lower === 'false') return { kind: 'lit', value: lower === 'true' };
        if (lower === 'null') return { kind: 'lit', value: null };
        if (this.isOp(this.peek(), '(')) {
          this.next();
          const args: Expr[] = [];
          if (!this.isOp(this.peek(), ')')) {
            for (;;) {
              args.push(this.parseExpr());
              const sep = this.next();
              if (this.isOp(sep, ')')) break;
              if (!this.isOp(sep, ',')) throw new ExprError(tr('Expected “,” or “)”'), sep.pos);
            }
          } else this.next();
          return { kind: 'call', name: t.v, args, pos: t.pos };
        }
        return { kind: 'call', name: t.v, args: null, pos: t.pos };
      }
      case 'end':
        throw new ExprError(tr('Empty expression'), t.pos);
      case 'eof':
        throw new ExprError(tr('Missing “}”'), t.pos);
    }
  }

  expectEnd() {
    const t = this.next();
    if (t.t !== 'end') throw new ExprError(t.t === 'eof' ? tr('Missing “}”') : tr('Unexpected content before “}”'), t.pos);
  }
}

// ---------------------------------------------------------------- Template-Lexer

type Item =
  | { t: 'text'; v: string }
  | { t: 'expr'; expr: Expr; src: string; pos: number }
  | { t: 'if' | 'elseif'; expr: Expr; pos: number }
  | { t: 'else'; pos: number }
  | { t: 'endif'; pos: number }
  | { t: 'comment' };

function lineCol(src: string, pos: number): { line: number; col: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < pos && i < src.length; i++) {
    if (src[i] === '\n') {
      line++;
      last = i;
    }
  }
  return { line, col: pos - last };
}

function tokenize(src: string, issues: ParseIssue[]): Item[] {
  const items: Item[] = [];
  let text = '';
  const flush = () => {
    if (text) items.push({ t: 'text', v: text });
    text = '';
  };
  const issue = (pos: number, message: string) => issues.push({ pos, message, ...lineCol(src, pos) });
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\' && (src[i + 1] === '{' || src[i + 1] === '}')) {
      text += src[i + 1];
      i += 2;
      continue;
    }
    if (c !== '{') {
      text += c;
      i++;
      continue;
    }
    // Kommentar
    if (src[i + 1] === '!') {
      const end = src.indexOf('!}', i + 2);
      if (end < 0) {
        issue(i, tr('Comment without “!}”'));
        text += src.slice(i);
        break;
      }
      flush();
      items.push({ t: 'comment' });
      i = end + 2;
      continue;
    }
    let j = i + 1;
    while (j < src.length && /[ \t]/.test(src[j])) j++;
    // Block-Tags
    if (src[j] === '#' || src[j] === '/') {
      const m = /^(?:#\s*(else\s*if|elseif|elif|if|else|endif|end)|\/\s*(if))\b/i.exec(src.slice(j));
      if (!m) {
        issue(i, tr('Unknown block tag'));
        text += c;
        i++;
        continue;
      }
      const kw = (m[1] ?? 'endif').toLowerCase().replace(/\s+/g, '');
      const after = j + m[0].length;
      try {
        if (kw === 'if' || kw === 'elseif' || kw === 'elif') {
          const p = new ExprParser(src, after);
          const expr = p.parseExpr();
          p.expectEnd();
          flush();
          items.push({ t: kw === 'if' ? 'if' : 'elseif', expr, pos: i });
          i = p.position;
        } else {
          const p = new ExprParser(src, after);
          p.expectEnd();
          flush();
          items.push(kw === 'else' ? { t: 'else', pos: i } : { t: 'endif', pos: i });
          i = p.position;
        }
      } catch (e) {
        const err = e as ExprError;
        issue(err.pos ?? i, `{#${kw}}: ${err.message}`);
        text += c;
        i++;
      }
      continue;
    }
    // Ausdruck
    try {
      const p = new ExprParser(src, i + 1);
      const expr = p.parseExpr();
      p.expectEnd();
      flush();
      items.push({ t: 'expr', expr, src: src.slice(i, p.position), pos: i });
      i = p.position;
    } catch (e) {
      const err = e as ExprError;
      issue(err.pos ?? i, tr('Expression: {message}', { message: err.message ?? String(e) }));
      text += c;
      i++;
    }
  }
  flush();
  return items;
}

/**
 * Zeilen, die nur aus Block-Tags/Kommentaren (und Leerraum) bestehen, verschwinden komplett.
 * Einrückung am Zeilenanfang im Template-Text wird entfernt.
 */
function stripStandalone(items: Item[]): Item[] {
  // In Zeilen zerlegen
  type Line = { items: Item[]; nl: boolean };
  const lines: Line[] = [{ items: [], nl: false }];
  for (const it of items) {
    if (it.t !== 'text') {
      lines[lines.length - 1].items.push(it);
      continue;
    }
    const parts = it.v.split('\n');
    parts.forEach((p, idx) => {
      if (idx > 0) {
        lines[lines.length - 1].nl = true;
        lines.push({ items: [], nl: false });
      }
      if (p) lines[lines.length - 1].items.push({ t: 'text', v: p });
    });
  }
  const out: Item[] = [];
  for (const line of lines) {
    const hasTag = line.items.some((x) => x.t === 'if' || x.t === 'elseif' || x.t === 'else' || x.t === 'endif' || x.t === 'comment');
    const onlyWs = line.items.every((x) => x.t !== 'expr' && (x.t !== 'text' || !x.v.trim()));
    if (hasTag && onlyWs) {
      for (const x of line.items) if (x.t !== 'text') out.push(x);
      continue; // Zeile samt Umbruch entfernen
    }
    let first = true;
    for (const x of line.items) {
      if (x.t === 'text' && first) {
        const v = x.v.replace(/^[ \t]+/, '');
        if (v) out.push({ t: 'text', v });
      } else out.push(x);
      if (x.t !== 'comment') first = false;
    }
    if (line.nl) out.push({ t: 'text', v: '\n' });
  }
  // benachbarte Texte zusammenführen
  const merged: Item[] = [];
  for (const x of out) {
    const last = merged[merged.length - 1];
    if (x.t === 'text' && last?.t === 'text') last.v += x.v;
    else merged.push(x.t === 'text' ? { ...x } : x);
  }
  return merged;
}

function buildTree(items: Item[], src: string, issues: ParseIssue[]): TNode[] {
  const root: TNode[] = [];
  const stack: { node: Extract<TNode, { kind: 'if' }>; body: TNode[]; hasElse: boolean; pos: number }[] = [];
  const target = () => (stack.length ? stack[stack.length - 1].body : root);
  const issue = (pos: number, message: string) => issues.push({ pos, message, ...lineCol(src, pos) });
  for (const it of items) {
    switch (it.t) {
      case 'text':
        target().push({ kind: 'text', value: it.v });
        break;
      case 'comment':
        break;
      case 'expr':
        target().push({ kind: 'expr', expr: it.expr, src: it.src, pos: it.pos });
        break;
      case 'if': {
        const body: TNode[] = [];
        const node: Extract<TNode, { kind: 'if' }> = { kind: 'if', branches: [{ cond: it.expr, body }] };
        target().push(node);
        stack.push({ node, body, hasElse: false, pos: it.pos });
        break;
      }
      case 'elseif':
      case 'else': {
        const top = stack[stack.length - 1];
        if (!top) {
          issue(it.pos, it.t === 'else' ? tr('{#else} without {#if}') : tr('{#elseif} without {#if}'));
          break;
        }
        if (top.hasElse) issue(it.pos, it.t === 'else' ? tr('{#else} after {#else}') : tr('{#elseif} after {#else}'));
        const body: TNode[] = [];
        top.node.branches.push({ cond: it.t === 'else' ? null : it.expr, body });
        top.body = body;
        if (it.t === 'else') top.hasElse = true;
        break;
      }
      case 'endif':
        if (!stack.length) issue(it.pos, tr('{#endif} without {#if}'));
        else stack.pop();
        break;
    }
  }
  for (const s of stack) issue(s.pos, tr('{#if} without {#endif}'));
  return root;
}

const cache = new Map<string, ParsedTemplate>();

export function parseTemplate(src: string): ParsedTemplate {
  // Fehlermeldungen sind übersetzt → Cache je Sprache
  const key = `${getLang()}\u0000${src}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const issues: ParseIssue[] = [];
  const items = stripStandalone(tokenize(src, issues));
  const nodes = buildTree(items, src, issues);
  const res = { nodes, issues };
  if (cache.size > 500) cache.clear();
  cache.set(key, res);
  return res;
}

/** Alle Funktionsnamen und include()-Ziele eines Templates (für Lint, Eingabefelder, Verwendungsnachweis). */
export function collectCalls(nodes: TNode[]): { name: string; args: Expr[] | null; pos: number }[] {
  const out: { name: string; args: Expr[] | null; pos: number }[] = [];
  const visitExpr = (e: Expr) => {
    switch (e.kind) {
      case 'call':
        out.push({ name: e.name, args: e.args, pos: e.pos });
        e.args?.forEach(visitExpr);
        break;
      case 'bin':
        visitExpr(e.left);
        visitExpr(e.right);
        break;
      case 'not':
        visitExpr(e.expr);
        break;
    }
  };
  const visit = (ns: TNode[]) => {
    for (const n of ns) {
      if (n.kind === 'expr') visitExpr(n.expr);
      else if (n.kind === 'if')
        for (const b of n.branches) {
          if (b.cond) visitExpr(b.cond);
          visit(b.body);
        }
    }
  };
  visit(nodes);
  return out;
}

export function includedComponentNames(src: string): string[] {
  const { nodes } = parseTemplate(src);
  return collectCalls(nodes)
    .filter((c) => c.name.toLowerCase() === 'include' && c.args?.[0]?.kind === 'str')
    .map((c) => (c.args![0] as { value: string }).value);
}

export function referencedInputNames(src: string): string[] {
  const { nodes } = parseTemplate(src);
  return collectCalls(nodes)
    .filter((c) => c.name.toLowerCase() === 'input' && c.args?.[0]?.kind === 'str')
    .map((c) => (c.args![0] as { value: string }).value);
}
