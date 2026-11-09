// Baut die Oberfläche neu, wenn web/dist fehlt oder Quellen neuer sind.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { say } from './say.mjs';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'web', 'dist', 'index.html');

function newest(dir) {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}

const sources = Math.max(newest(join(root, 'web', 'src')), newest(join(root, 'shared', 'src')), statSync(join(root, 'web', 'index.html')).mtimeMs);
if (!existsSync(dist) || statSync(dist).mtimeMs < sources) {
  say('build');
  execSync('npm run build', { cwd: root, stdio: 'inherit' });
}
