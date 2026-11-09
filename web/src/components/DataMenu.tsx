// Kopfzeile: Sichern, Beenden, Speicherort – und die Warnung, wenn die Datenbank auf einem anderen Rechner offen ist.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Database, FolderCog, HardDriveDownload, Power, X } from 'lucide-react';
import { api } from '../lib/api';
import { keys, queryClient, useSystem } from '../lib/queries';
import { toast } from '../lib/store';
import { Button, confirmDialog, formatDate, Menu, MenuItem } from './ui';
import { t, tr } from '../lib/i18n';

export async function backupNow() {
  try {
    const r = await api.post<{ file: string | null }>('/api/backups');
    toast.success(r.file ? t('Backup created: {file}', { file: r.file }) : t('No novels yet — nothing to back up.'));
    void queryClient.invalidateQueries({ queryKey: keys.system });
  } catch (e) {
    toast.error(e);
  }
}

export function DataMenu() {
  const navigate = useNavigate();
  const [stopped, setStopped] = useState(false);
  const quit = async () => {
    const ok = await confirmDialog({
      title: t('Quit Novelmaker?'),
      message: t('A backup is created automatically first. The console window then closes; this page only works again after a restart (start.bat).'),
      confirmLabel: t('Quit'),
    });
    if (!ok) return;
    try {
      await api.post('/api/system/shutdown');
      setStopped(true);
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <>
      <Menu
        trigger={(toggle, ref) => (
          <button
            ref={ref}
            type="button"
            onClick={toggle}
            title={t('Data: back up, storage location, quit')}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-stone-600 hover:bg-stone-200/50 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            <Database className="size-4" />
            <span className="hidden xl:inline">{t('Data')}</span>
          </button>
        )}
      >
        {(close) => (
          <div className="w-64">
            <MenuItem icon={<HardDriveDownload />} onClick={() => (close(), void backupNow())}>
              {t('Back up now')}
            </MenuItem>
            <MenuItem icon={<FolderCog />} onClick={() => (close(), navigate('/settings/data'))}>
              {t('Storage location & backups…')}
            </MenuItem>
            <div className="my-1 h-px bg-stone-200 dark:bg-stone-800" />
            <MenuItem icon={<Power />} onClick={() => (close(), void quit())}>
              {t('Quit Novelmaker')}
            </MenuItem>
          </div>
        )}
      </Menu>
      {stopped && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-100 p-6 text-center dark:bg-stone-950">
          <div>
            <Power className="mx-auto mb-3 size-10 text-stone-400" />
            <h1 className="text-xl font-semibold">{t('Novelmaker has been shut down')}</h1>
            <p className="mt-2 text-sm text-stone-500">{t('The backup has been created. You can close this tab now.')}</p>
          </div>
        </div>
      )}
    </>
  );
}

/** Warnung unter der Kopfzeile: Datenbank auf anderem Rechner geöffnet oder Konfliktkopien gefunden. */
export function SystemBanner() {
  const { data } = useSystem();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('nm-banner-dismissed') ?? '';
    } catch {
      return '';
    }
  });
  if (!data) return null;
  const key = `${data.lockWarning?.since ?? ''}|${data.conflicts.map((c) => c.file).join(',')}`;
  if ((!data.lockWarning && !data.conflicts.length) || dismissed === key) return null;
  const dismiss = () => {
    setDismissed(key);
    try {
      sessionStorage.setItem('nm-banner-dismissed', key);
    } catch {
      /* */
    }
  };
  return (
    <div className="flex shrink-0 items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {data.lockWarning && (
          <p>
            {tr(
              '<b>The database is currently also open on “{host}”</b> (last seen {date}). If you work on both computers at the same time, Dropbox/OneDrive will create conflicted copies and changes will be lost. Quit Novelmaker on the other computer and wait until syncing has finished.',
              { host: data.lockWarning.host, date: formatDate(data.lockWarning.heartbeat) },
            )}
          </p>
        )}
        {data.conflicts.length > 0 && (
          <p className={data.lockWarning ? 'mt-1' : ''}>
            {tr('<b>Conflicted copies found next to the database:</b> {files}. They may contain changes from the other computer.', {
              files: data.conflicts.map((c) => c.file.split(/[\\/]/).pop()).join(', '),
            })}{' '}
            <button type="button" className="underline" onClick={() => navigate('/settings/data')}>
              {t('View storage location')}
            </button>
          </p>
        )}
      </div>
      <Button size="xs" variant="ghost" icon={<X className="size-3.5" />} onClick={dismiss} title={t('Hide for this session')} />
    </div>
  );
}
