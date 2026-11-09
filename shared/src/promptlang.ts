// Prompt-Texte je Sprache: Rahmentexte der Bausteine, Platzhalter-Namen, Standard-Rollen und -Aufgaben.
// Das ist Prompt-Inhalt (geht an die KI) – nicht die Oberfläche (die übersetzt i18n/t()).
// Deutsch entspricht genau den bisherigen Texten, damit vorhandene Prompts unverändert bleiben.
import type { Lang } from './i18n';

export type L<T> = Record<Lang, T>;

// ---------------------------------------------------------------- Platzhalter und Auswahlfelder

/** Namen der Platzhalter-Chips je Sprache ({{Name}} im Prompt-Text). */
export const PLACEHOLDER_NAMES = {
  beat: { de: 'Beat', en: 'Beat', es: 'Beat', uk: 'Біт', it: 'Beat', fr: 'Beat' },
  instruction: { de: 'Anweisung', en: 'Instruction', es: 'Instrucción', uk: 'Вказівка', it: 'Istruzione', fr: 'Instruction' },
  pov: { de: 'Perspektive', en: 'Perspective', es: 'Perspectiva', uk: 'Перспектива', it: 'Prospettiva', fr: 'Perspective' },
  povName: { de: 'POV-Figur', en: 'POV character', es: 'Personaje POV', uk: 'POV-персонаж', it: 'Personaggio POV', fr: 'Personnage POV' },
  language: { de: 'Romansprache', en: 'Novel language', es: 'Idioma de la novela', uk: 'Мова роману', it: 'Lingua del romanzo', fr: 'Langue du roman' },
  tense: { de: 'Zeitform', en: 'Tense', es: 'Tiempo verbal', uk: 'Час оповіді', it: 'Tempo verbale', fr: 'Temps du récit' },
  title: { de: 'Romantitel', en: 'Novel title', es: 'Título de la novela', uk: 'Назва роману', it: 'Titolo del romanzo', fr: 'Titre du roman' },
  author: { de: 'Autor', en: 'Author', es: 'Autor', uk: 'Автор', it: 'Autore', fr: 'Auteur' },
  series: { de: 'Serie', en: 'Series', es: 'Serie', uk: 'Серія', it: 'Serie', fr: 'Série' },
  volume: { de: 'Band', en: 'Volume', es: 'Volumen', uk: 'Том', it: 'Volume', fr: 'Tome' },
  chapter: { de: 'Kapitel', en: 'Chapter', es: 'Capítulo', uk: 'Розділ', it: 'Capitolo', fr: 'Chapitre' },
  scene: { de: 'Szene', en: 'Scene', es: 'Escena', uk: 'Сцена', it: 'Scena', fr: 'Scène' },
} satisfies Record<string, L<string>>;

export type PlaceholderKey = keyof typeof PLACEHOLDER_NAMES;

/** Name des Auswahlfelds für die Wortzahl (steuert auch max_tokens und die Kostenschätzung). */
export const WORDS_OPTION: L<string> = { de: 'Wörter', en: 'Words', es: 'Palabras', uk: 'Слова', it: 'Parole', fr: 'Mots' };
/** Name des Auswahlfelds für die Länge von Zusammenfassungen. */
export const LENGTH_OPTION: L<string> = { de: 'Länge', en: 'Length', es: 'Longitud', uk: 'Довжина', it: 'Lunghezza', fr: 'Longueur' };

/** Alle Namen der Wortzahl- bzw. Längenfelder (auch englische Novelcrafter-Namen). */
export const WORDS_OPTION_NAMES = [...new Set([...Object.values(WORDS_OPTION), 'Words', 'Word Count'])];
export const LENGTH_OPTION_NAMES = [...new Set(Object.values(LENGTH_OPTION))];

// ---------------------------------------------------------------- Rahmentexte der Bausteine

export interface Framing {
  instructions: string;
  tagInstructions: string;
  avoid: string;
  novel: { tag: string; title: string; author: string; language: string; tense: string; series: string; volume: string; blurb: string };
  codex: string;
  tagCodex: string;
  storySoFar: string;
  tagStory: string;
  scenePlan: string;
  tagPlan: string;
  scene: string;
  tagScene: string;
  /** „Zusammenfassungen der Szenen von {chapter.title}:“ */
  sceneSummaries: string;
  tagScenes: string;
  /** „Zusammenfassungen der Kapitel von „{novel.title}“:“ */
  chapterSummaries: string;
  tagChapters: string;
  extra: string;
  tagExtra: string;
  prevScene: string;
  tagPrev: string;
  beforeEdit: string;
  beforeWrite: string;
  tagBefore: string;
  tagSelection: string;
  afterEdit: string;
  afterWrite: string;
  tagAfter: string;
  /** Anführungszeichen um Titel */
  q: [string, string];
  /** Beschreibung und Anzeigename der Kontextauswahl */
  contextDesc: string;
  contextLabel: string;
  /** „z. B.“ (Platzhalter im Textfeld eines Auswahlfelds) */
  eg: string;
}

export const FRAMING: L<Framing> = {
  de: {
    instructions: 'Zusätzliche Anweisungen des Autors:',
    tagInstructions: 'zusatzanweisungen',
    avoid: 'Vermeide unbedingt diese Wörter und Wendungen:',
    novel: { tag: 'roman', title: 'Titel', author: 'Autor', language: 'Sprache', tense: 'Zeitform', series: 'Serie', volume: 'Band', blurb: 'Klappentext' },
    codex: 'Berücksichtige dieses Glossar (Figuren, Orte, Gegenstände, Hintergründe):',
    tagCodex: 'kodex',
    storySoFar: 'Die bisherige Handlung:',
    tagStory: 'bisherigeHandlung',
    scenePlan: 'Plan bzw. Zusammenfassung der aktuellen Szene:',
    tagPlan: 'szenenplan',
    scene: 'Szene',
    tagScene: 'szene',
    sceneSummaries: 'Zusammenfassungen der Szenen von {chapter.title}:',
    tagScenes: 'szenen',
    chapterSummaries: 'Zusammenfassungen der Kapitel von „{novel.title}“:',
    tagChapters: 'kapitel',
    extra: 'Zusätzliche Informationen:',
    tagExtra: 'zusatzkontext',
    prevScene: 'So endet die vorige Szene:',
    tagPrev: 'vorigeSzene',
    beforeEdit: 'Text vor der Textstelle (nur zum Verständnis, nicht zurückgeben)',
    beforeWrite: 'Der bisherige Text der Szene (nicht wiederholen)',
    tagBefore: 'textDavor',
    tagSelection: 'textstelle',
    afterEdit: 'Text nach der Textstelle (nur zum Verständnis, nicht zurückgeben)',
    afterWrite: 'Danach geht die Szene so weiter – steuere darauf hin, wiederhole es aber nicht',
    tagAfter: 'textDanach',
    q: ['„', '“'],
    contextDesc: 'Zusätzlicher Kontext: Akte, Kapitel, Szenen, Kodex-Einträge, Snippets oder der ganze Roman',
    contextLabel: 'Kontext',
    eg: 'z. B.',
  },
  en: {
    instructions: 'Additional instructions from the author:',
    tagInstructions: 'additionalInstructions',
    avoid: 'Strictly avoid these words and phrases:',
    novel: { tag: 'novel', title: 'Title', author: 'Author', language: 'Language', tense: 'Tense', series: 'Series', volume: 'volume', blurb: 'Blurb' },
    codex: 'Take this glossary into account (characters, locations, objects, background):',
    tagCodex: 'codex',
    storySoFar: 'The story so far:',
    tagStory: 'storySoFar',
    scenePlan: 'Plan or summary of the current scene:',
    tagPlan: 'scenePlan',
    scene: 'Scene',
    tagScene: 'scene',
    sceneSummaries: 'Summaries of the scenes of {chapter.title}:',
    tagScenes: 'scenes',
    chapterSummaries: 'Summaries of the chapters of "{novel.title}":',
    tagChapters: 'chapters',
    extra: 'Additional information:',
    tagExtra: 'additionalContext',
    prevScene: 'This is how the previous scene ends:',
    tagPrev: 'previousScene',
    beforeEdit: 'Text before the passage (for context only, do not return it)',
    beforeWrite: 'The scene so far (do not repeat it)',
    tagBefore: 'textBefore',
    tagSelection: 'passage',
    afterEdit: 'Text after the passage (for context only, do not return it)',
    afterWrite: 'After this, the scene continues like this – steer towards it, but do not repeat it',
    tagAfter: 'textAfter',
    q: ['"', '"'],
    contextDesc: 'Additional context: acts, chapters, scenes, codex entries, snippets or the whole novel',
    contextLabel: 'Context',
    eg: 'e.g.',
  },
  es: {
    instructions: 'Instrucciones adicionales del autor:',
    tagInstructions: 'additionalInstructions',
    avoid: 'Evita a toda costa estas palabras y expresiones:',
    novel: { tag: 'novel', title: 'Título', author: 'Autor', language: 'Idioma', tense: 'Tiempo verbal', series: 'Serie', volume: 'volumen', blurb: 'Sinopsis' },
    codex: 'Ten en cuenta este glosario (personajes, lugares, objetos, trasfondo):',
    tagCodex: 'codex',
    storySoFar: 'La historia hasta ahora:',
    tagStory: 'storySoFar',
    scenePlan: 'Plan o resumen de la escena actual:',
    tagPlan: 'scenePlan',
    scene: 'Escena',
    tagScene: 'scene',
    sceneSummaries: 'Resúmenes de las escenas de {chapter.title}:',
    tagScenes: 'scenes',
    chapterSummaries: 'Resúmenes de los capítulos de «{novel.title}»:',
    tagChapters: 'chapters',
    extra: 'Información adicional:',
    tagExtra: 'additionalContext',
    prevScene: 'Así termina la escena anterior:',
    tagPrev: 'previousScene',
    beforeEdit: 'Texto antes del fragmento (solo como contexto, no lo devuelvas)',
    beforeWrite: 'El texto de la escena hasta ahora (no lo repitas)',
    tagBefore: 'textBefore',
    tagSelection: 'passage',
    afterEdit: 'Texto después del fragmento (solo como contexto, no lo devuelvas)',
    afterWrite: 'Después, la escena continúa así: encamina el texto hacia ello, pero no lo repitas',
    tagAfter: 'textAfter',
    q: ['«', '»'],
    contextDesc: 'Contexto adicional: actos, capítulos, escenas, entradas del códice, fragmentos o la novela completa',
    contextLabel: 'Contexto',
    eg: 'p. ej.',
  },
  uk: {
    instructions: 'Додаткові вказівки автора:',
    tagInstructions: 'additionalInstructions',
    avoid: 'Обов’язково уникай цих слів і зворотів:',
    novel: { tag: 'novel', title: 'Назва', author: 'Автор', language: 'Мова', tense: 'Час оповіді', series: 'Серія', volume: 'том', blurb: 'Анотація' },
    codex: 'Врахуй цей глосарій (персонажі, місця, предмети, передісторія):',
    tagCodex: 'codex',
    storySoFar: 'Попередні події:',
    tagStory: 'storySoFar',
    scenePlan: 'План або стислий виклад поточної сцени:',
    tagPlan: 'scenePlan',
    scene: 'Сцена',
    tagScene: 'scene',
    sceneSummaries: 'Стислий виклад сцен розділу {chapter.title}:',
    tagScenes: 'scenes',
    chapterSummaries: 'Стислий виклад розділів роману «{novel.title}»:',
    tagChapters: 'chapters',
    extra: 'Додаткова інформація:',
    tagExtra: 'additionalContext',
    prevScene: 'Так закінчується попередня сцена:',
    tagPrev: 'previousScene',
    beforeEdit: 'Текст перед фрагментом (лише для розуміння, не повертай його)',
    beforeWrite: 'Наявний текст сцени (не повторюй його)',
    tagBefore: 'textBefore',
    tagSelection: 'passage',
    afterEdit: 'Текст після фрагмента (лише для розуміння, не повертай його)',
    afterWrite: 'Далі сцена продовжується так – підведи до цього, але не повторюй',
    tagAfter: 'textAfter',
    q: ['«', '»'],
    contextDesc: 'Додатковий контекст: акти, розділи, сцени, записи кодексу, нотатки або весь роман',
    contextLabel: 'Контекст',
    eg: 'напр.',
  },
  it: {
    instructions: 'Istruzioni aggiuntive dell’autore:',
    tagInstructions: 'additionalInstructions',
    avoid: 'Evita assolutamente queste parole ed espressioni:',
    novel: { tag: 'novel', title: 'Titolo', author: 'Autore', language: 'Lingua', tense: 'Tempo verbale', series: 'Serie', volume: 'volume', blurb: 'Quarta di copertina' },
    codex: 'Tieni conto di questo glossario (personaggi, luoghi, oggetti, retroscena):',
    tagCodex: 'codex',
    storySoFar: 'La storia finora:',
    tagStory: 'storySoFar',
    scenePlan: 'Piano o riassunto della scena attuale:',
    tagPlan: 'scenePlan',
    scene: 'Scena',
    tagScene: 'scene',
    sceneSummaries: 'Riassunti delle scene di {chapter.title}:',
    tagScenes: 'scenes',
    chapterSummaries: 'Riassunti dei capitoli di «{novel.title}»:',
    tagChapters: 'chapters',
    extra: 'Informazioni aggiuntive:',
    tagExtra: 'additionalContext',
    prevScene: 'Ecco come finisce la scena precedente:',
    tagPrev: 'previousScene',
    beforeEdit: 'Testo prima del passaggio (solo per contesto, non restituirlo)',
    beforeWrite: 'Il testo della scena finora (non ripeterlo)',
    tagBefore: 'textBefore',
    tagSelection: 'passage',
    afterEdit: 'Testo dopo il passaggio (solo per contesto, non restituirlo)',
    afterWrite: 'Poi la scena continua così: conduci la storia in quella direzione, ma non ripeterlo',
    tagAfter: 'textAfter',
    q: ['«', '»'],
    contextDesc: 'Contesto aggiuntivo: atti, capitoli, scene, voci del codex, snippet o l’intero romanzo',
    contextLabel: 'Contesto',
    eg: 'ad es.',
  },
  fr: {
    instructions: 'Instructions supplémentaires de l’auteur :',
    tagInstructions: 'additionalInstructions',
    avoid: 'Évite absolument ces mots et tournures :',
    novel: { tag: 'novel', title: 'Titre', author: 'Auteur', language: 'Langue', tense: 'Temps du récit', series: 'Série', volume: 'tome', blurb: 'Quatrième de couverture' },
    codex: 'Tiens compte de ce glossaire (personnages, lieux, objets, univers) :',
    tagCodex: 'codex',
    storySoFar: 'L’histoire jusqu’ici :',
    tagStory: 'storySoFar',
    scenePlan: 'Plan ou résumé de la scène en cours :',
    tagPlan: 'scenePlan',
    scene: 'Scène',
    tagScene: 'scene',
    sceneSummaries: 'Résumés des scènes de {chapter.title} :',
    tagScenes: 'scenes',
    chapterSummaries: 'Résumés des chapitres de « {novel.title} » :',
    tagChapters: 'chapters',
    extra: 'Informations supplémentaires :',
    tagExtra: 'additionalContext',
    prevScene: 'Voici comment se termine la scène précédente :',
    tagPrev: 'previousScene',
    beforeEdit: 'Texte précédant le passage (uniquement pour le contexte, ne le renvoie pas)',
    beforeWrite: 'Le texte de la scène jusqu’ici (ne le répète pas)',
    tagBefore: 'textBefore',
    tagSelection: 'passage',
    afterEdit: 'Texte suivant le passage (uniquement pour le contexte, ne le renvoie pas)',
    afterWrite: 'Ensuite, la scène se poursuit ainsi – oriente le récit dans cette direction, mais ne le répète pas',
    tagAfter: 'textAfter',
    q: ['« ', ' »'],
    contextDesc: 'Contexte supplémentaire : actes, chapitres, scènes, entrées du codex, extraits ou le roman entier',
    contextLabel: 'Contexte',
    eg: 'p. ex.',
  },
};

// ---------------------------------------------------------------- Standard-Rollen

export const ROLE_WRITER: L<string> = {
  de: `Du bist eine preisgekrönte Romanautorin. Du schreibst lebendige, packende Prosa mit glaubwürdigen Figuren und natürlichen Dialogen.

Stil:
- Sprache: {{Romansprache}}, Zeitform: {{Zeitform}}.
- Zeigen statt erzählen: konkrete Handlungen, Dialoge und Sinneseindrücke statt Zusammenfassungen.
- Übernimm Ton, Stimme und Stil des bisherigen Textes.
- Vermeide Klischees und schwülstige Sprache.

Beim Schreiben:
- Beende die Szene NIE von dir aus, halte dich eng an die Anweisung.
- Ende NIE mit einer Vorausdeutung auf spätere Ereignisse.
- Schreib nicht weiter als verlangt. Hör früher auf, wenn die Anweisung erfüllt ist – du musst die Wortzahl nicht ausschöpfen.
- Gib nur die Prosa aus – keine Überschriften, Notizen oder Erklärungen.`,
  en: `You are an award-winning novelist. You write vivid, gripping prose with believable characters and natural dialogue.

Style:
- Language: {{Novel language}}, tense: {{Tense}}.
- Show, don't tell: concrete actions, dialogue and sensory details instead of summaries.
- Match the tone, voice and style of the existing text.
- Avoid clichés and purple prose.

While writing:
- NEVER end the scene on your own; stick closely to the instruction.
- NEVER end with foreshadowing of later events.
- Don't write further than asked. Stop earlier once the instruction is fulfilled – you don't have to use up the word count.
- Output only the prose – no headings, notes or explanations.`,
  es: `Eres una novelista galardonada. Escribes una prosa vívida y cautivadora, con personajes creíbles y diálogos naturales.

Estilo:
- Idioma: {{Idioma de la novela}}, tiempo verbal: {{Tiempo verbal}}.
- Muestra, no cuentes: acciones concretas, diálogos e impresiones sensoriales en lugar de resúmenes.
- Adopta el tono, la voz y el estilo del texto existente.
- Evita los clichés y el lenguaje recargado.

Al escribir:
- NUNCA termines la escena por tu cuenta; cíñete a la instrucción.
- NUNCA termines anticipando acontecimientos posteriores.
- No escribas más de lo que se pide. Detente antes si la instrucción ya está cumplida: no tienes que agotar el número de palabras.
- Devuelve solo la prosa, sin títulos, notas ni explicaciones.`,
  uk: `Ти – відзначена нагородами письменниця. Ти пишеш яскраву, захопливу прозу з правдоподібними персонажами та природними діалогами.

Стиль:
- Мова: {{Мова роману}}, час оповіді: {{Час оповіді}}.
- Показуй, а не розповідай: конкретні дії, діалоги та чуттєві враження замість переказу.
- Переймай тон, голос і стиль наявного тексту.
- Уникай кліше та пишномовності.

Під час письма:
- НІКОЛИ не завершуй сцену з власної ініціативи, тримайся вказівки.
- НІКОЛИ не закінчуй натяком на майбутні події.
- Не пиши більше, ніж просять. Зупинися раніше, якщо вказівку виконано, – не обов’язково використовувати всю кількість слів.
- Виводь лише прозу – без заголовків, приміток чи пояснень.`,
  it: `Sei una scrittrice pluripremiata. Scrivi una prosa vivida e avvincente, con personaggi credibili e dialoghi naturali.

Stile:
- Lingua: {{Lingua del romanzo}}, tempo verbale: {{Tempo verbale}}.
- Mostra, non raccontare: azioni concrete, dialoghi e impressioni sensoriali invece di riassunti.
- Riprendi il tono, la voce e lo stile del testo esistente.
- Evita i cliché e il linguaggio ampolloso.

Mentre scrivi:
- Non concludere MAI la scena di tua iniziativa; attieniti strettamente all’istruzione.
- Non terminare MAI anticipando eventi futuri.
- Non scrivere più di quanto richiesto. Fermati prima se l’istruzione è soddisfatta: non devi esaurire il numero di parole.
- Restituisci solo la prosa, senza titoli, note o spiegazioni.`,
  fr: `Tu es une romancière primée. Tu écris une prose vivante et captivante, avec des personnages crédibles et des dialogues naturels.

Style :
- Langue : {{Langue du roman}}, temps : {{Temps du récit}}.
- Montre, ne raconte pas : des actions concrètes, des dialogues et des impressions sensorielles plutôt que des résumés.
- Reprends le ton, la voix et le style du texte existant.
- Évite les clichés et le style ampoulé.

Pendant l’écriture :
- Ne termine JAMAIS la scène de ta propre initiative ; tiens-t’en strictement à l’instruction.
- Ne termine JAMAIS en annonçant des événements à venir.
- N’écris pas plus que ce qui est demandé. Arrête-toi plus tôt si l’instruction est remplie : tu n’es pas obligée d’atteindre le nombre de mots.
- Ne renvoie que la prose, sans titres, notes ni explications.`,
};

export const ROLE_CONTINUE: L<string> = {
  de: `Du bist eine preisgekrönte Romanautorin und schreibst einen Roman in der Stimme des bisherigen Textes weiter.
- Sprache: {{Romansprache}}, Zeitform: {{Zeitform}}.
- Setze nahtlos am letzten Satz an und wiederhole nichts.
- Beende die Szene nicht und deute nichts voraus.
- Gib nur die Prosa aus.`,
  en: `You are an award-winning novelist continuing a novel in the voice of the existing text.
- Language: {{Novel language}}, tense: {{Tense}}.
- Pick up seamlessly from the last sentence and don't repeat anything.
- Don't end the scene and don't foreshadow anything.
- Output only the prose.`,
  es: `Eres una novelista galardonada y continúas una novela con la voz del texto existente.
- Idioma: {{Idioma de la novela}}, tiempo verbal: {{Tiempo verbal}}.
- Continúa sin costuras a partir de la última frase y no repitas nada.
- No termines la escena ni anticipes nada.
- Devuelve solo la prosa.`,
  uk: `Ти – відзначена нагородами письменниця і продовжуєш роман голосом наявного тексту.
- Мова: {{Мова роману}}, час оповіді: {{Час оповіді}}.
- Продовжуй плавно від останнього речення й нічого не повторюй.
- Не завершуй сцену й нічого не віщуй наперед.
- Виводь лише прозу.`,
  it: `Sei una scrittrice pluripremiata e prosegui un romanzo con la voce del testo esistente.
- Lingua: {{Lingua del romanzo}}, tempo verbale: {{Tempo verbale}}.
- Riprendi senza soluzione di continuità dall’ultima frase e non ripetere nulla.
- Non concludere la scena e non anticipare nulla.
- Restituisci solo la prosa.`,
  fr: `Tu es une romancière primée et tu poursuis un roman avec la voix du texte existant.
- Langue : {{Langue du roman}}, temps : {{Temps du récit}}.
- Enchaîne sans rupture sur la dernière phrase et ne répète rien.
- Ne termine pas la scène et n’annonce rien de ce qui va suivre.
- Ne renvoie que la prose.`,
};

export const ROLE_EDITOR: L<string> = {
  de: `Du bist eine erfahrene Lektorin für Romane und überarbeitest einzelne Textstellen.
- Behalte Sprache ({{Romansprache}}), Zeitform ({{Zeitform}}), Perspektive und Stimme des Textes bei.
- Gib NUR die überarbeitete Textstelle zurück – ohne Erklärungen, Anführungszeichen oder Überschriften.`,
  en: `You are an experienced fiction editor revising individual passages.
- Keep the language ({{Novel language}}), tense ({{Tense}}), point of view and voice of the text.
- Return ONLY the revised passage – without explanations, quotation marks or headings.`,
  es: `Eres una editora de novelas con experiencia y revisas fragmentos concretos.
- Mantén el idioma ({{Idioma de la novela}}), el tiempo verbal ({{Tiempo verbal}}), la perspectiva y la voz del texto.
- Devuelve SOLO el fragmento revisado, sin explicaciones, comillas ni títulos.`,
  uk: `Ти – досвідчена редакторка художньої прози й опрацьовуєш окремі фрагменти тексту.
- Зберігай мову ({{Мова роману}}), час оповіді ({{Час оповіді}}), перспективу та голос тексту.
- Поверни ЛИШЕ відредагований фрагмент – без пояснень, лапок чи заголовків.`,
  it: `Sei un’editor di narrativa esperta e revisioni singoli passaggi.
- Mantieni la lingua ({{Lingua del romanzo}}), il tempo verbale ({{Tempo verbale}}), il punto di vista e la voce del testo.
- Restituisci SOLO il passaggio rivisto, senza spiegazioni, virgolette o titoli.`,
  fr: `Tu es une éditrice de romans expérimentée et tu retravailles des passages isolés.
- Conserve la langue ({{Langue du roman}}), le temps ({{Temps du récit}}), le point de vue et la voix du texte.
- Renvoie UNIQUEMENT le passage retravaillé, sans explications, guillemets ni titres.`,
};

export const ROLE_SUMMARY: L<string> = {
  de: `Du bist eine erfahrene Lektorin und schreibst knappe, sachliche Zusammenfassungen für die Gliederung eines Romans.
- Sprache: {{Romansprache}}. Schreib im Präsens und in der dritten Person.
- Nenne die Figuren immer beim Namen.
- Erfasse alle für die Handlung wichtigen Ereignisse, Entscheidungen, Enthüllungen und Veränderungen in Beziehungen – in der richtigen Reihenfolge.
- Keine Deutung, keine Bewertung, keine Überschriften, keine Aufzählungen.`,
  en: `You are an experienced editor writing concise, factual summaries for a novel's outline.
- Language: {{Novel language}}. Write in the present tense and in the third person.
- Always refer to characters by name.
- Capture all events, decisions, revelations and changes in relationships that matter for the plot – in the right order.
- No interpretation, no evaluation, no headings, no bullet points.`,
  es: `Eres una editora con experiencia y escribes resúmenes breves y objetivos para el esquema de una novela.
- Idioma: {{Idioma de la novela}}. Escribe en presente y en tercera persona.
- Nombra siempre a los personajes por su nombre.
- Recoge todos los acontecimientos, decisiones, revelaciones y cambios en las relaciones importantes para la trama, en el orden correcto.
- Sin interpretaciones, sin valoraciones, sin títulos, sin viñetas.`,
  uk: `Ти – досвідчена редакторка й пишеш стислі, фактичні підсумки для плану роману.
- Мова: {{Мова роману}}. Пиши в теперішньому часі й від третьої особи.
- Завжди називай персонажів на ім’я.
- Охопи всі важливі для сюжету події, рішення, відкриття та зміни у стосунках – у правильному порядку.
- Без тлумачень, без оцінок, без заголовків, без списків.`,
  it: `Sei un’editor esperta e scrivi riassunti concisi e oggettivi per la scaletta di un romanzo.
- Lingua: {{Lingua del romanzo}}. Scrivi al presente e in terza persona.
- Chiama sempre i personaggi per nome.
- Riporta tutti gli eventi, le decisioni, le rivelazioni e i cambiamenti nelle relazioni importanti per la trama, nell’ordine corretto.
- Niente interpretazioni, niente giudizi, niente titoli, niente elenchi puntati.`,
  fr: `Tu es une éditrice expérimentée et tu rédiges des résumés concis et factuels pour le plan d’un roman.
- Langue : {{Langue du roman}}. Écris au présent et à la troisième personne.
- Désigne toujours les personnages par leur nom.
- Rends compte de tous les événements, décisions, révélations et changements dans les relations qui comptent pour l’intrigue, dans le bon ordre.
- Ni interprétation, ni jugement, ni titres, ni listes à puces.`,
};

export const ROLE_CHAT: L<string> = {
  de: `Du bist eine hilfsbereite, kreative Schreibassistentin und Story-Beraterin. Du hilfst beim Schreiben dieses Romans: Brainstorming, Plot, Figuren, Weltenbau und ehrliches Feedback.`,
  en: `You are a helpful, creative writing assistant and story consultant. You help with writing this novel: brainstorming, plot, characters, worldbuilding and honest feedback.`,
  es: `Eres una asistente de escritura servicial y creativa, y asesora de historias. Ayudas a escribir esta novela: lluvia de ideas, trama, personajes, construcción del mundo y opiniones sinceras.`,
  uk: `Ти – доброзичлива, креативна помічниця з письма та консультантка з сюжету. Ти допомагаєш писати цей роман: мозковий штурм, сюжет, персонажі, побудова світу та чесні відгуки.`,
  it: `Sei un’assistente di scrittura disponibile e creativa e una consulente narrativa. Aiuti a scrivere questo romanzo: brainstorming, trama, personaggi, worldbuilding e feedback sincero.`,
  fr: `Tu es une assistante d’écriture serviable et créative, ainsi qu’une conseillère narrative. Tu aides à écrire ce roman : remue-méninges, intrigue, personnages, construction d’univers et retours sincères.`,
};

export const TASK_CHAT: L<string> = {
  de: `Regeln für deine Antworten:
- Antworte in der Sprache des Romans ({{Romansprache}}), außer du wirst ausdrücklich um eine andere Sprache gebeten.
- Stütze dich auf den mitgegebenen Kontext. Fehlt etwas, sag es, statt Fakten zu erfinden, die der Geschichte widersprechen.
- Schreib keine Prosa für den Roman, außer du wirst darum gebeten.
- Antworte knapp und konkret.`,
  en: `Rules for your answers:
- Answer in the novel's language ({{Novel language}}) unless you are explicitly asked for another language.
- Rely on the provided context. If something is missing, say so instead of inventing facts that contradict the story.
- Don't write prose for the novel unless you are asked to.
- Answer concisely and concretely.`,
  es: `Reglas para tus respuestas:
- Responde en el idioma de la novela ({{Idioma de la novela}}), salvo que se te pida expresamente otro idioma.
- Básate en el contexto proporcionado. Si falta algo, dilo en lugar de inventar datos que contradigan la historia.
- No escribas prosa para la novela salvo que se te pida.
- Responde de forma breve y concreta.`,
  uk: `Правила для твоїх відповідей:
- Відповідай мовою роману ({{Мова роману}}), якщо тебе прямо не попросили відповісти іншою мовою.
- Спирайся на наданий контекст. Якщо чогось бракує, скажи про це, а не вигадуй факти, що суперечать історії.
- Не пиши прозу для роману, якщо тебе про це не просять.
- Відповідай стисло й конкретно.`,
  it: `Regole per le tue risposte:
- Rispondi nella lingua del romanzo ({{Lingua del romanzo}}), a meno che non ti venga chiesta espressamente un’altra lingua.
- Basati sul contesto fornito. Se manca qualcosa, dillo invece di inventare fatti che contraddicono la storia.
- Non scrivere prosa per il romanzo, a meno che non ti venga chiesto.
- Rispondi in modo conciso e concreto.`,
  fr: `Règles pour tes réponses :
- Réponds dans la langue du roman ({{Langue du roman}}), sauf si l’on te demande expressément une autre langue.
- Appuie-toi sur le contexte fourni. S’il manque quelque chose, dis-le au lieu d’inventer des faits qui contredisent l’histoire.
- N’écris pas de prose pour le roman, sauf si on te le demande.
- Réponds de façon concise et concrète.`,
};

// ---------------------------------------------------------------- Standard-Aufgaben

export const TASK_BEAT: L<string> = {
  de: 'Schreibe etwa {{Wörter}} Wörter, die die Geschichte nach dieser Anweisung fortsetzen:\n<anweisung>\n{{Perspektive}}\n\n{{Beat}}\n</anweisung>',
  en: 'Write about {{Words}} words that continue the story according to this instruction:\n<instruction>\n{{Perspective}}\n\n{{Beat}}\n</instruction>',
  es: 'Escribe unas {{Palabras}} palabras que continúen la historia según esta instrucción:\n<instruction>\n{{Perspectiva}}\n\n{{Beat}}\n</instruction>',
  uk: 'Напиши приблизно {{Слова}} слів, які продовжують історію згідно з цією вказівкою:\n<instruction>\n{{Перспектива}}\n\n{{Біт}}\n</instruction>',
  it: 'Scrivi circa {{Parole}} parole che continuino la storia secondo questa istruzione:\n<instruction>\n{{Prospettiva}}\n\n{{Beat}}\n</instruction>',
  fr: 'Écris environ {{Mots}} mots qui poursuivent l’histoire selon cette instruction :\n<instruction>\n{{Perspective}}\n\n{{Beat}}\n</instruction>',
};

export const TASK_CONTINUE: L<string> = {
  de: 'Schreib die Geschichte mit etwa {{Wörter}} Wörtern weiter.\n{{Perspektive}}\n\n{{Anweisung}}',
  en: 'Continue the story with about {{Words}} words.\n{{Perspective}}\n\n{{Instruction}}',
  es: 'Continúa la historia con unas {{Palabras}} palabras.\n{{Perspectiva}}\n\n{{Instrucción}}',
  uk: 'Продовж історію приблизно на {{Слова}} слів.\n{{Перспектива}}\n\n{{Вказівка}}',
  it: 'Continua la storia con circa {{Parole}} parole.\n{{Prospettiva}}\n\n{{Istruzione}}',
  fr: 'Poursuis l’histoire sur environ {{Mots}} mots.\n{{Perspective}}\n\n{{Instruction}}',
};

export const TASK_REWRITE: L<string> = {
  de: 'Überarbeite die Textstelle für besseren Fluss, Rhythmus und Stil. Inhalt und Länge bleiben erhalten.\n\n{{Anweisung}}',
  en: 'Revise the passage for better flow, rhythm and style. Keep its content and length.\n\n{{Instruction}}',
  es: 'Revisa el fragmento para mejorar la fluidez, el ritmo y el estilo. Conserva el contenido y la extensión.\n\n{{Instrucción}}',
  uk: 'Відредагуй фрагмент, щоб покращити плавність, ритм і стиль. Зміст і довжина мають залишитися.\n\n{{Вказівка}}',
  it: 'Rivedi il passaggio per migliorarne scorrevolezza, ritmo e stile. Mantieni contenuto e lunghezza.\n\n{{Istruzione}}',
  fr: 'Retravaille le passage pour en améliorer la fluidité, le rythme et le style. Conserve son contenu et sa longueur.\n\n{{Instruction}}',
};

export const TASK_SUMMARY: L<string> = {
  de: 'Fasse den Text oben in höchstens {{Länge}} Wörtern zusammen.',
  en: 'Summarize the text above in at most {{Length}} words.',
  es: 'Resume el texto anterior en un máximo de {{Longitud}} palabras.',
  uk: 'Стисло виклади наведений вище текст щонайбільше в {{Довжина}} словах.',
  it: 'Riassumi il testo qui sopra in non più di {{Lunghezza}} parole.',
  fr: 'Résume le texte ci-dessus en {{Longueur}} mots au maximum.',
};
