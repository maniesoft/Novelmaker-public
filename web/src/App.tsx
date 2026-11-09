import { useEffect } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { BookOpen, Cog, LayoutGrid, Library, Loader2, MessagesSquare, Moon, NotebookPen, PenLine, Search, StickyNote, Sun, SunMoon, TerminalSquare } from 'lucide-react';
import { ConfirmHost, Toaster, cn, IconButton, Popover } from './components/ui';
import { useJobs, useNovel, useSettings, keys, queryClient, invalidateNovel } from './lib/queries';
import { applyTheme, useUi } from './lib/store';
import { LibraryPage } from './pages/LibraryPage';
import { WritePage } from './pages/WritePage';
import { PlanPage } from './pages/PlanPage';
import { CodexPage } from './pages/CodexPage';
import { ChatPage } from './pages/ChatPage';
import { SnippetsPage } from './pages/SnippetsPage';
import { NovelSettingsPage } from './pages/NovelSettingsPage';
import { PromptsPage } from './pages/PromptsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SearchPage } from './pages/SearchPage';
import { useRef, useState } from 'react';
import { formatCost } from '@novelmaker/shared';
import { api } from './lib/api';
import { CodexModalHost } from './components/CodexModal';
import { DataMenu, SystemBanner } from './components/DataMenu';
import { t } from './lib/i18n';

export function App() {
  const { data: settings } = useSettings();
  const theme = useUi((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => useUi.getState().theme === 'system' && applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);
  useEffect(() => {
    if (!settings) return;
    document.documentElement.style.setProperty('--editor-font-size', `${settings.editorFontSize}px`);
    document.documentElement.style.setProperty('--editor-width', `${settings.editorWidth}px`);
  }, [settings]);

  return (
    <div className="flex h-full flex-col">
      <Routes>
        <Route path="/" element={<Shell><LibraryPage /></Shell>} />
        <Route path="/prompts/:promptId?" element={<Shell><PromptsPage /></Shell>} />
        <Route path="/settings/:tab?" element={<Shell><SettingsPage /></Shell>} />
        <Route path="/novel/:novelId/*" element={<NovelRoutes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
      <ConfirmHost />
    </div>
  );
}

function NovelRoutes() {
  return (
    <Shell novel>
      <Routes>
        <Route path="write/:sceneId?" element={<WritePage />} />
        <Route path="manuscript" element={<WritePage manuscript />} />
        <Route path="plan" element={<PlanPage />} />
        <Route path="codex/:entryId?" element={<CodexPage />} />
        <Route path="chat/:threadId?" element={<ChatPage />} />
        <Route path="snippets/:snippetId?" element={<SnippetsPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<NovelSettingsPage />} />
        <Route path="*" element={<Navigate to="write" replace />} />
      </Routes>
      <CodexModalHost />
    </Shell>
  );
}

function Shell({ children, novel }: { children: React.ReactNode; novel?: boolean }) {
  const focusMode = useUi((s) => s.focusMode);
  return (
    <>
      {!focusMode && <Header novel={novel} />}
      {!focusMode && <SystemBanner />}
      <main className="min-h-0 flex-1">{children}</main>
    </>
  );
}

function Header({ novel }: { novel?: boolean }) {
  const { novelId } = useParams();
  const { data: n } = useNovel(novel ? novelId : undefined);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const tab = (to: string, icon: React.ReactNode, label: string) => (
    <NavLink
      to={`/novel/${novelId}/${to}`}
      className={({ isActive }) =>
        cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
          isActive ? 'bg-stone-200/80 text-stone-900 dark:bg-stone-800 dark:text-white' : 'text-stone-600 hover:bg-stone-200/50 dark:text-stone-400 dark:hover:bg-stone-800/60',
        )
      }
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </NavLink>
  );
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-stone-200 bg-white/80 px-3 backdrop-blur dark:border-stone-800 dark:bg-stone-900/80">
      <Link to="/" className="flex items-center gap-2 pr-2 font-semibold tracking-tight" title={t('Library')}>
        <span className="flex size-6 items-center justify-center rounded-md bg-amber-700 text-xs font-bold text-white">N</span>
        <span className="hidden lg:inline">Novelmaker</span>
      </Link>
      {novel && n && (
        <>
          <span className="max-w-56 truncate border-l border-stone-200 pl-3 text-sm font-medium text-stone-700 dark:border-stone-700 dark:text-stone-300" title={n.title}>
            {n.title}
            {n.volumeNumber ? <span className="ml-1 text-xs text-stone-400">{t('Volume {n}', { n: n.volumeNumber })}</span> : null}
          </span>
          <nav className="ml-2 flex items-center gap-0.5">
            {tab('write', <PenLine className="size-4" />, t('Write'))}
            {tab('manuscript', <NotebookPen className="size-4" />, t('Manuscript'))}
            {tab('plan', <LayoutGrid className="size-4" />, t('Plan'))}
            {tab('codex', <BookOpen className="size-4" />, t('Codex'))}
            {tab('chat', <MessagesSquare className="size-4" />, t('Chat'))}
            {tab('snippets', <StickyNote className="size-4" />, t('Snippets'))}
            {tab('search', <Search className="size-4" />, t('Search'))}
            {tab('settings', <Cog className="size-4" />, t('Novel'))}
          </nav>
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        <JobIndicator />
        <NavLink
          to="/"
          end
          className={({ isActive }) => cn('inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-stone-600 hover:bg-stone-200/50 dark:text-stone-400 dark:hover:bg-stone-800', isActive && 'bg-stone-200/80 dark:bg-stone-800')}
        >
          <Library className="size-4" />
          <span className="hidden xl:inline">{t('Library')}</span>
        </NavLink>
        <NavLink
          to="/prompts"
          className={({ isActive }) => cn('inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-stone-600 hover:bg-stone-200/50 dark:text-stone-400 dark:hover:bg-stone-800', isActive && 'bg-stone-200/80 dark:bg-stone-800')}
        >
          <TerminalSquare className="size-4" />
          <span className="hidden xl:inline">{t('Prompts')}</span>
        </NavLink>
        <DataMenu />
        <NavLink
          to="/settings"
          className={({ isActive }) => cn('inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-stone-600 hover:bg-stone-200/50 dark:text-stone-400 dark:hover:bg-stone-800', isActive && 'bg-stone-200/80 dark:bg-stone-800')}
        >
          <Cog className="size-4" />
          <span className="hidden xl:inline">{t('Settings')}</span>
        </NavLink>
        <IconButton title={theme === 'light' ? t('Theme: light') : theme === 'dark' ? t('Theme: dark') : t('Theme: system')} onClick={() => setTheme(nextTheme)}>
          {theme === 'light' ? <Sun className="size-4" /> : theme === 'dark' ? <Moon className="size-4" /> : <SunMoon className="size-4" />}
        </IconButton>
      </div>
    </header>
  );
}

function JobIndicator() {
  const [poll, setPoll] = useState(false);
  const { data: jobs } = useJobs(poll);
  const running = (jobs ?? []).filter((j) => j.status === 'running');
  const prevRunning = useRef(0);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPoll(running.length > 0);
    if (prevRunning.current > 0 && running.length === 0) {
      // Job fertig: Daten neu laden
      queryClient.invalidateQueries({ queryKey: ['outline'] });
      queryClient.invalidateQueries({ queryKey: ['codex'] });
      queryClient.invalidateQueries({ queryKey: ['novel'] });
      queryClient.invalidateQueries({ queryKey: keys.logs });
      for (const j of jobs ?? []) if (j.novelId) invalidateNovel(j.novelId);
    }
    prevRunning.current = running.length;
  }, [running.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!jobs?.length) return null;
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-stone-200 px-2.5 text-xs dark:border-stone-700"
      >
        {running.length ? <Loader2 className="size-3.5 animate-spin text-amber-600" /> : <span className="size-2 rounded-full bg-emerald-500" />}
        {running.length ? `${running[0].progress.done}/${running[0].progress.total}` : t('Jobs')}
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align="end" className="w-96 p-2">
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {jobs.map((j) => (
            <div key={j.id} className="rounded-md border border-stone-200 p-2 text-sm dark:border-stone-700">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{j.title}</span>
                <span className="shrink-0 text-xs text-stone-500">
                  {j.status === 'running' ? t('running') : j.status === 'done' ? t('done') : j.status === 'cancelled' ? t('canceled') : j.status === 'error' ? t('error') : j.status}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                <div className="h-full bg-amber-600 transition-all" style={{ width: `${j.progress.total ? (100 * j.progress.done) / j.progress.total : 0}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-stone-500">
                <span className="truncate">{j.step}</span>
                <span>{formatCost(j.cost)}</span>
              </div>
              {j.error && <div className="mt-1 text-xs text-red-600">{j.error}</div>}
              {j.status === 'running' && (
                <button type="button" className="mt-1 text-xs text-red-600 hover:underline" onClick={() => api.post(`/api/jobs/${j.id}/cancel`).then(() => queryClient.invalidateQueries({ queryKey: keys.jobs }))}>
                  {t('Cancel')}
                </button>
              )}
              {j.log.length > 0 && (
                <details className="mt-1 text-xs text-stone-500">
                  <summary className="cursor-pointer">{t('Log ({n})', { n: j.log.length })}</summary>
                  <div className="mt-1 max-h-32 overflow-y-auto">{j.log.map((l, i) => <div key={i}>{l}</div>)}</div>
                </details>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="mt-2 text-xs text-stone-500 hover:underline" onClick={() => api.post('/api/jobs/clear').then(() => queryClient.invalidateQueries({ queryKey: keys.jobs }))}>
          {t('Clear finished')}
        </button>
      </Popover>
    </>
  );
}
