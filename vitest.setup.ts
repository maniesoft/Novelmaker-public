// Die Tests prüfen deutsche Meldungen und Prompt-Texte (Standard der App beim ersten Start wäre Englisch).
// Server-Tests stellen zusätzlich die Spracheinstellung ihrer Test-Datenbank auf Deutsch (siehe api/import.test.ts).
import { setLang } from './shared/src/i18n';

setLang('de');
