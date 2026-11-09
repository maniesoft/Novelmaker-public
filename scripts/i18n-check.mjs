// Checks the translations: collects all keys from t()/tn()/tr()/N_() in the code (keys are the English texts)
// and compares them with shared/src/i18n/locales/<lang>.json.
//
//   npm run i18n                 – report: missing/extra keys, placeholder and tag problems
//   npm run i18n -- --keys F     – write all keys (with plural forms and files) as JSON to F
//   npm run i18n -- --prune      – remove extra keys from the locale files
//
// Exit code 1 if something is missing or broken. (Runs through tsx because it uses shared/src/i18n/extract.ts.)
// The same table is available in the app: Settings → General → "Help translate".
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTranslation, extractKeys } from '../shared/src/i18n/extract.ts';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIRS = ['shared/src', 'server/src', 'web/src'];
const LOCALES = join(ROOT, 'shared/src/i18n/locales');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'locales' && name !== 'node_modules') walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const keys = new Map();
const dynamic = [];
for (const dir of DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    extractKeys(readFileSync(file, 'utf8'), relative(ROOT, file).replace(/\\/g, '/'), keys, dynamic);
  }
}

const args = process.argv.slice(2);
if (args[0] === '--keys') {
  const out = [...keys.values()].map((e) => ({ key: e.key, ...(e.one !== undefined ? { one: e.one, plural: true } : {}), files: e.files }));
  writeFileSync(args[1], JSON.stringify(out, null, 2));
  console.log(`${out.length} keys → ${args[1]}`);
  process.exit(0);
}

const langs = readdirSync(LOCALES)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5))
  .sort();
let bad = 0;
for (const lang of langs) {
  const path = join(LOCALES, `${lang}.json`);
  const dict = JSON.parse(readFileSync(path, 'utf8'));
  const missing = [...keys.keys()].filter((k) => !(k in dict));
  const extra = Object.keys(dict).filter((k) => !keys.has(k));
  const problems = [];
  for (const [k, v] of Object.entries(dict)) {
    const info = keys.get(k);
    if (!info) continue;
    for (const p of checkTranslation(k, v, info.one !== undefined)) {
      const form = p.form ? ` [${p.form}]` : '';
      if (p.kind === 'empty') problems.push(`${JSON.stringify(k)}${form}: empty`);
      else if (p.kind === 'noOther') problems.push(`${JSON.stringify(k)}: plural forms without "other"`);
      else problems.push(`${JSON.stringify(k)}${form}: ${p.kind} {${p.expected}} ≠ {${p.actual}}`);
    }
  }
  if (args[0] === '--prune' && extra.length) {
    for (const k of extra) delete dict[k];
    writeFileSync(path, JSON.stringify(dict, null, 2) + '\n');
  }
  console.log(`${lang}: ${Object.keys(dict).length} translations, ${missing.length} missing, ${extra.length} extra, ${problems.length} problems`);
  for (const k of missing.slice(0, 15)) console.log(`  missing: ${JSON.stringify(k)}`);
  if (missing.length > 15) console.log(`  … and ${missing.length - 15} more`);
  for (const p of problems.slice(0, 20)) console.log(`  ${p}`);
  if (args[0] !== '--prune') for (const k of extra.slice(0, 5)) console.log(`  extra: ${JSON.stringify(k)}`);
  if (missing.length || problems.length) bad++;
}
console.log(`${keys.size} keys in the code.`);
if (dynamic.length) {
  console.log(`\nCalls without a fixed text (please check):`);
  for (const d of dynamic) console.log(`  ${d}`);
}
process.exit(bad ? 1 : 0);
