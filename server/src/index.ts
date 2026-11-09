import { exec } from 'node:child_process';
import { statSync } from 'node:fs';
import { locale, setLang, t } from '@novelmaker/shared';
import { buildApp } from './app';
import { dbPath } from './config';
import { DbHandle, openDb } from './db';
import { seedBuiltins } from './repo/prompts';
import { getAppSettings } from './repo/settings';
import { createBackup, listBackups } from './services/backup';
import { SystemControl } from './services/system';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? 'localhost';

function backup(handle: DbHandle, label: string) {
  try {
    const file = createBackup(handle.db, getAppSettings(handle.db).backupsToKeep, label);
    if (file) console.log(t('Backup created: {file}', { file }));
  } catch (e) {
    console.warn(t('Backup failed: {error}', { error: (e as Error).message }));
  }
}

async function main() {
  const file = dbPath();
  const handle = new DbHandle(openDb(file));
  // Konsolenmeldungen in der Sprache der Oberfläche – darum vor der ersten Meldung
  setLang(getAppSettings(handle.db).language);
  const system = new SystemControl(handle, file);
  system.lock.acquire();
  const foreign = system.lock.foreign;
  if (foreign) {
    const since = new Date(foreign.since);
    console.warn(
      '\n' +
        t(
          'WARNING: The database is currently also open on “{host}” (since {date}). Working on two computers at the same time creates conflicted copies. Please quit Novelmaker there first.',
          { host: foreign.host, date: isNaN(since.getTime()) ? foreign.since : since.toLocaleString(locale()) },
        ) +
        '\n',
    );
  }
  // beim Start nur sichern, wenn sich die Datei seit der letzten Sicherung geändert hat (z. B. auf einem anderen Rechner)
  const last = listBackups()[0];
  if (!last || statSync(file).mtimeMs > new Date(last.createdAt).getTime() + 1000) backup(handle, 'start');
  seedBuiltins(handle.db);
  const app = await buildApp(handle.db, { logger: true, system });

  let stopping = false;
  const shutdown = async (reason: string) => {
    if (stopping) return;
    stopping = true;
    console.log('\n' + t('Novelmaker is shutting down ({reason})…', { reason }));
    backup(handle, 'beenden');
    system.lock.release();
    try {
      await Promise.race([app.close(), new Promise((r) => setTimeout(r, 1500))]);
    } catch {
      /* egal */
    }
    try {
      handle.raw.close();
    } catch {
      /* egal */
    }
    process.exit(0);
  };
  system.onShutdown = () => shutdown(`${t('Data')} → ${t('Quit Novelmaker')}`);
  // Strg+C, Beenden-Signal; SIGHUP = Konsolenfenster geschlossen (Windows lässt dann noch einige Sekunden Zeit)
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) process.on(sig, () => void shutdown(sig));

  await app.listen({ port: PORT, host: HOST });
  const url = `http://localhost:${PORT}`;
  console.log(t('Novelmaker is running at {url}  (database: {file})', { url, file: system.dbFile }));
  console.log(
    t('To quit: menu “{menu}” → “{item}”, close this window, or press Ctrl+C. A backup is created automatically when quitting.', {
      menu: t('Data'),
      item: t('Quit Novelmaker'),
    }),
  );
  if (process.env.NOVELMAKER_OPEN === '1') {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => undefined);
  }
}

main().catch((e) => {
  if ((e as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.error(t('Port {port} is already in use — is Novelmaker already running? Otherwise choose another port with the PORT environment variable.', { port: PORT }));
  } else console.error(e);
  process.exit(1);
});
