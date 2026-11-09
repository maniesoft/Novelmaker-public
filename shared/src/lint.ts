// Statische Prüfung eines Templates (für den Prompt-Editor im Browser).
import { collectCalls, parseTemplate, type Expr } from './template/parser';
import { getFunctionMap } from './template/engine';
import { t } from './i18n';

export interface LintIssue {
  from: number;
  to: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface LintOptions {
  componentNames?: string[];
  inputNames?: string[];
  promptType?: string;
}

function knownFunction(name: string): boolean {
  const map = getFunctionMap();
  const key = name.toLowerCase();
  if (map.has(key)) return true;
  const parts = key.split('.');
  for (let k = parts.length - 1; k >= 1; k--) if (map.has(parts.slice(0, k).join('.'))) return true;
  return false;
}

export function lintTemplate(src: string, opts: LintOptions = {}): LintIssue[] {
  const { nodes, issues } = parseTemplate(src);
  const out: LintIssue[] = issues.map((i) => ({ from: i.pos, to: Math.min(src.length, i.pos + 1), severity: 'error', message: i.message }));
  const comps = opts.componentNames ? new Set(opts.componentNames.map((c) => c.trim().toLowerCase())) : null;
  const inputs = opts.inputNames ? new Set(opts.inputNames.map((c) => c.trim().toLowerCase())) : null;
  const map = getFunctionMap();
  for (const call of collectCalls(nodes)) {
    const to = call.pos + call.name.length;
    if (!knownFunction(call.name)) {
      out.push({ from: call.pos, to, severity: 'warning', message: t('Unknown function “{name}”', { name: call.name }) });
      continue;
    }
    const def = map.get(call.name.toLowerCase());
    if (def?.types && opts.promptType && opts.promptType !== 'component' && !def.types.includes(opts.promptType)) {
      out.push({
        from: call.pos,
        to,
        severity: 'warning',
        message: t('“{name}” isn’t available in the “{type}” prompt type', { name: def.name, type: opts.promptType }),
      });
    }
    const arg0 = call.args?.[0] as Expr | undefined;
    const lname = call.name.toLowerCase();
    if (lname === 'include' && comps && arg0?.kind === 'str' && !comps.has(arg0.value.trim().toLowerCase())) {
      out.push({ from: call.pos, to, severity: 'warning', message: t('Component “{name}” doesn’t exist', { name: arg0.value }) });
    }
    if (lname === 'input' && inputs && arg0?.kind === 'str' && !inputs.has(arg0.value.trim().toLowerCase())) {
      out.push({ from: call.pos, to, severity: 'warning', message: t('Input “{name}” is not defined', { name: arg0.value }) });
    }
  }
  return out;
}
