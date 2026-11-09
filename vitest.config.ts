import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/test/**/*.test.ts', 'server/test/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // Tests dürfen nie in data/ schreiben (z. B. Sicherungen vor dem Löschen)
    env: { NOVELMAKER_DATA: join(tmpdir(), 'novelmaker-vitest') },
  },
});
