// Markdown-Darstellung für KI-Antworten im Chat (Überschriften, Listen, Fett, Kursiv, Code, Tabellen).
import { useMemo } from 'react';
import MarkdownIt from 'markdown-it';
import { cn } from './ui';

// html: false – HTML aus der Antwort wird als Text gezeigt, nicht ausgeführt.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
// keine Bilder von fremden Servern nachladen
md.disable('image');
// Links in einem neuen Tab öffnen, ohne Zugriff auf dieses Fenster
md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return self.renderToken(tokens, idx, options);
};

/** Platzhalter für die Schreibmarke beim Streamen (Zeichen aus dem privaten Unicode-Bereich). */
const CARET = '';

export function Markdown({ text, caret, className }: { text: string; caret?: boolean; className?: string }) {
  const html = useMemo(() => {
    const out = md.render(caret ? text + CARET : text);
    return caret ? out.replace(CARET, '<span class="stream-caret"></span>') : out;
  }, [text, caret]);
  return <div className={cn('md', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
