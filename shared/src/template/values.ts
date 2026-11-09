// Laufzeitwerte der Template-Engine (ohne Abhängigkeit zur Engine, vermeidet Import-Zyklen).
import { isLang, novelLangCode, type Lang } from '../i18n';
import type { PromptType } from '../types';

export type ObjKind = 'scene' | 'chapter' | 'act' | 'codex' | 'snippet' | 'novel' | 'series' | 'text';
export interface Obj {
  $kind: ObjKind;
  id: string;
  mode?: 'full' | 'summary';
  text?: string;
}
export type Value = null | string | number | boolean | Value[] | Obj;

export const EDITOR_TYPES: PromptType[] = ['scene-beat-completion', 'continue-writing', 'text-replacement'];

export function isObj(v: unknown): v is Obj {
  return !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as Obj).$kind === 'string';
}

export function isTruthy(v: Value | undefined): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function valuesEqual(a: Value | undefined, b: Value | undefined): boolean {
  if (a == null || b == null) return (a ?? null) === (b ?? null);
  if (isObj(a) && isObj(b)) return a.$kind === b.$kind && (a.$kind === 'text' ? a.text === b.text : a.id === b.id);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => valuesEqual(x, b[i]));
  if (isObj(a) || isObj(b) || Array.isArray(a) || Array.isArray(b)) return false;
  if (typeof a === 'number' || typeof b === 'number') return String(a).trim() === String(b).trim();
  return String(a) === String(b);
}

export function containsValue(container: Value, item: Value): boolean {
  if (Array.isArray(container)) return container.some((x) => valuesEqual(x, item));
  if (container == null) return false;
  if (typeof container === 'string') {
    if (item == null || isObj(item)) return false;
    return container.toLowerCase().includes(String(item).toLowerCase());
  }
  return valuesEqual(container, item);
}

export function isGerman(language: string | null | undefined): boolean {
  return /^(de|deutsch|german)/i.test((language ?? '').trim());
}

/** Sprache des Romans für Texte, die die Engine selbst in den Prompt schreibt (Perspektive, „Kapitel 3“, …); sonst Englisch. */
export function novelTextLang(language: string | null | undefined): Lang {
  const code = novelLangCode(language).slice(0, 2);
  return isLang(code) ? code : 'en';
}
