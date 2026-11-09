// Meldungen des Starters (start.bat, ensure-build.mjs) in der Systemsprache, sonst Englisch.
// Läuft vor dem Server – teils noch vor `npm install` –, darum ohne Abhängigkeiten und ohne Zugriff auf die
// Datenbank (dort steht die Sprache der Oberfläche; die Meldungen des Servers selbst kommen in jener Sprache).
//
//   node scripts/say.mjs <schlüssel>      – Meldung ausgeben
//   import { say } from './say.mjs'
//
// Die Meldung „Node.js nicht gefunden“ steht direkt in start.bat (ohne Node gibt es dieses Skript nicht).
import { fileURLToPath } from 'node:url';

const MESSAGES = {
  install: {
    en: 'Installing dependencies — the first start takes a little while…',
    de: 'Installiere Abhängigkeiten – das dauert beim ersten Start etwas …',
    es: 'Instalando dependencias; el primer inicio tarda un poco…',
    uk: 'Встановлення залежностей – перший запуск триває трохи довше…',
    it: "Installazione delle dipendenze: il primo avvio richiede un po' di tempo…",
    fr: 'Installation des dépendances – le premier démarrage prend un peu de temps…',
  },
  build: {
    en: 'Building the interface…',
    de: 'Baue die Oberfläche …',
    es: 'Compilando la interfaz…',
    uk: 'Збирання інтерфейсу…',
    it: "Compilazione dell'interfaccia…",
    fr: 'Compilation de l’interface…',
  },
  failed: {
    en: 'An error occurred (see above).',
    de: 'Es ist ein Fehler aufgetreten (siehe oben).',
    es: 'Se ha producido un error (ver arriba).',
    uk: 'Сталася помилка (див. вище).',
    it: 'Si è verificato un errore (vedi sopra).',
    fr: 'Une erreur s’est produite (voir ci-dessus).',
  },
};

/** Sprache des Systems (Windows: Region/Format, Linux/macOS: LANG/LC_*), sofern übersetzt; sonst Englisch. */
export function systemLang() {
  let code = '';
  try {
    code = new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale).language;
  } catch {
    /* Englisch */
  }
  return code in MESSAGES.failed ? code : 'en';
}

export function message(key, lang = systemLang()) {
  const m = MESSAGES[key];
  return m ? (m[lang] ?? m.en) : key;
}

export function say(key) {
  console.log(message(key));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) say(process.argv[2]);
