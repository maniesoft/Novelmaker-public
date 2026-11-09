import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient, useSettings } from './lib/queries';
import { applyLang, useLang } from './lib/i18n';
import { App } from './App';
import './index.css';

/** Sprache aus den Einstellungen übernehmen; bei einem Wechsel wird die App neu aufgebaut und alles neu geladen. */
function LangRoot() {
  const { data: settings, isError } = useSettings();
  const { lang, known, rev } = useLang();
  const wanted = settings?.language;
  useEffect(() => {
    if (!wanted) {
      if (isError && !known) applyLang(lang);
      return;
    }
    const changed = wanted !== useLang.getState().lang;
    applyLang(wanted);
    // Server-Texte und Prompts (je Sprache gespeichert) neu holen
    if (changed) void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'settings' });
  }, [wanted, isError]); // eslint-disable-line react-hooks/exhaustive-deps
  // erster Start ohne gespeicherte Sprache: auf die Einstellungen warten (kein kurzes Aufblitzen der falschen Sprache)
  if (!known) return null;
  return <App key={`${lang}-${rev}`} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <LangRoot />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
