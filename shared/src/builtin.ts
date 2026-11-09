// Mitgelieferte Prompts und Komponenten – in jeder Sprache eine eigene Fassung. Alles ist in der Prompt-Werkstatt bearbeitbar.
// Beim Import aus Novelcrafter werden dortige Komponentennamen („Novelcrafter/…“) auf „Novelmaker/…“ umgeschrieben,
// damit importierte Prompts unverändert laufen. Komponentennamen sind in allen Sprachen gleich (include() verweist darauf).
import type { PromptInput, PromptMessage, PromptType } from './types';
import { compileBlockPrompt, newBlockSpec, type BlockPromptSpec } from './blocks';
import { LANGS, languageInfo, type Lang } from './i18n';
import { LENGTH_OPTION, PLACEHOLDER_NAMES, TASK_REWRITE, type L } from './promptlang';

export interface BuiltinPrompt {
  key: string;
  type: PromptType;
  name: string;
  description: string;
  messages: PromptMessage[];
  inputs: PromptInput[];
  /** Baustein-Prompt (alle mitgelieferten außer den Komponenten) */
  blocks?: BlockPromptSpec;
}

const m = (type: PromptMessage['type'], text: string): PromptMessage => ({ type, text: text.trim(), format: 'aic2' });

/** „Ehrliches Review“ – Vorgabe des Autors (Skill „Honest Review“), unverändert übernommen; nur die Antwortsprache wechselt. */
const REVIEW_ROLE_BASE = `You are an avid reader. You are offering advice to an author on the delivered prompt, that could be a blurb, a scene or a whole novel...but you've had a couple of beers and are drunk, with no filter. Please read the prompt or scene and give me straight up brutal feedback/critique. No holding back. You want this story to be the best it can be and the only way to do that is by being honest. Say what works and what doesn't work.

Don't return structured or labelled output, only a continuous stream of consciousness. Chat on for ages, be as detailed as possible when answering my questions, and refer to parts of the text to prove your point. Focus for several paragraphs at least for each part. Give me 2000 words of feedback. I have plenty of time.

Read the scene, and tell me what you think the genre is, and what the intentions of the scene are. Then comment on the following:

Pacing. Pacing refers to the speed at which a story unfolds: its rhythm and flow, the rise and fall of its action, plot points and story arcs. We want moments where we can breathe, provided that the story is being pushed forward. For this scene; Does it flow? Engage? Do any sections go on too long? Does anything feel rushed? It's fine if the pace shifts during a scene, but any shifts should make sense, and engage the reader. Does the pacing reflect the events that are occurring?

Characters. Do the characters feel like real people (even if we don't know much about them yet)? Are they interesting, engaging, fun to read? Do they come alive? If there are questions about the characters or their motivations, etc, are these the kind of questions that make readers turn the page to get the answers, or the kind that make readers throw the book against the wall?

Does the scene serve a story purpose, i.e. does it have a turning point? i.e. Is something fundamentally different after the scene? This turn can be 1 or more realms of story: plot, character arcs, worldbuilding, relationships.

Does anything feel confusing or unclear?

Does anything feel stiff, forced, or like an obvious plot device?

Do important things get glossed over or rushed through, or do unimportant things get emphasised too much? From reading the scene, what does it portray as the most important things?

Is it a good continuation of the story from the previous chapters, and does it meet your expectations of the genre?

Does it remind you of any cliches, tropes or other books you have read?

On a scale of 0 to 10, how much is this scene or blurb a page-turner?

Is there anything else you wanna tell me?`;

const reviewRole = (lang: Lang) => `${REVIEW_ROLE_BASE}\n\nUse ${lang === 'de' ? 'german' : languageInfo(lang).english} language and grammar.`;

// ---------------------------------------------------------------- Komponenten

interface ComponentDef {
  key: string;
  name: string;
  description: L<string>;
  text: L<string>;
  inputs?: (lang: Lang) => PromptInput[];
}

const COMPONENTS: ComponentDef[] = [
  {
    key: 'component:codex',
    name: 'Novelmaker/Codex',
    description: {
      de: 'Fügt die relevanten Kodex-Einträge (codex.context) ein.',
      en: 'Inserts the relevant codex entries (codex.context).',
      es: 'Inserta las entradas relevantes del códice (codex.context).',
      uk: 'Вставляє відповідні записи кодексу (codex.context).',
      it: 'Inserisce le voci rilevanti del codex (codex.context).',
      fr: 'Insère les entrées pertinentes du codex (codex.context).',
    },
    text: {
      de: `
{! Hier kommen alle Kodex-Daten für die KI hinein !}
{#if codex.context}
Berücksichtige beim Antworten das folgende Glossar mit Figuren, Orten, Gegenständen und Hintergründen:
<codex>
{codex.context}
</codex>
{#endif}`,
      en: `
{! This bit includes all the codex data for the AI !}
{#if codex.context}
Take into account the following glossary of characters/locations/items/lore... when writing your response:
<codex>
{codex.context}
</codex>
{#endif}`,
      es: `
{! Aquí se incluyen todos los datos del códice para la IA !}
{#if codex.context}
Al responder, ten en cuenta el siguiente glosario de personajes, lugares, objetos y trasfondo:
<codex>
{codex.context}
</codex>
{#endif}`,
      uk: `
{! Тут вставляються всі дані кодексу для ШІ !}
{#if codex.context}
Відповідаючи, врахуй такий глосарій персонажів, місць, предметів і передісторії:
<codex>
{codex.context}
</codex>
{#endif}`,
      it: `
{! Qui vengono inseriti tutti i dati del codex per l’IA !}
{#if codex.context}
Nel rispondere tieni conto del seguente glossario di personaggi, luoghi, oggetti e retroscena:
<codex>
{codex.context}
</codex>
{#endif}`,
      fr: `
{! Ici sont insérées toutes les données du codex destinées à l’IA !}
{#if codex.context}
Pour ta réponse, tiens compte du glossaire suivant (personnages, lieux, objets, univers…) :
<codex>
{codex.context}
</codex>
{#endif}`,
    },
  },
  {
    key: 'component:additional-context',
    name: 'Novelmaker/AdditionalContext',
    description: {
      de: 'Zusätzlich gewählter Kontext (Akte, Kapitel, Szenen, Snippets, Kodex, Roman) – ohne Dubletten aus codex.context.',
      en: 'Additionally selected context (acts, chapters, scenes, snippets, codex, novel) – without duplicates from codex.context.',
      es: 'Contexto elegido adicionalmente (actos, capítulos, escenas, fragmentos, códice, novela), sin duplicados de codex.context.',
      uk: 'Додатково вибраний контекст (акти, розділи, сцени, нотатки, кодекс, роман) – без дублікатів із codex.context.',
      it: 'Contesto scelto in aggiunta (atti, capitoli, scene, snippet, codex, romanzo), senza duplicati da codex.context.',
      fr: 'Contexte sélectionné en complément (actes, chapitres, scènes, extraits, codex, roman), sans les doublons de codex.context.',
    },
    // Name des Eingabefelds bleibt gleich (kompatibel zu Novelcrafter-Prompts), Beschreibung und Anzeige je Sprache
    inputs: (lang) => [
      {
        name: 'Additional Context',
        description: {
          de: 'Zusätzliche Informationen für die KI',
          en: 'Any additional information to provide to the AI',
          es: 'Información adicional para la IA',
          uk: 'Додаткова інформація для ШІ',
          it: 'Informazioni aggiuntive per l’IA',
          fr: 'Informations supplémentaires pour l’IA',
        }[lang],
        mode: 'multiple',
        addToContext: true,
        displayName: { de: 'Kontext', en: 'Context', es: 'Contexto', uk: 'Контекст', it: 'Contesto', fr: 'Contexte' }[lang],
        types: ['act', 'chapter', 'scene', 'snippet', 'codex', 'fullNovel'],
      },
    ],
    text: {
      de: `
{! Kodex-Einträge nicht doppelt in den zusätzlichen Kontext aufnehmen – !}
{! deshalb im lokalen Kontext ablegen und hier verwenden !}
{local('context', without(input("Additional Context"), codex.context))}

{#if local('context')}
Hier sind zusätzliche Informationen, die dir bei der Antwort helfen:
<additionalContext>
{asXml(local('context'))}
</additionalContext>
{#endif}`,
      en: `
{! We don't want to include codex entries twice in the additional context !}
{! As such, we store this in the local context and use it here !}
{local('context', without(input("Additional Context"), codex.context))}

{#if local('context')}
Here is some additional information to help you with your answer:
<additionalContext>
{asXml(local('context'))}
</additionalContext>
{#endif}`,
      es: `
{! No queremos incluir las entradas del códice dos veces en el contexto adicional !}
{! Por eso lo guardamos en el contexto local y lo usamos aquí !}
{local('context', without(input("Additional Context"), codex.context))}

{#if local('context')}
Aquí tienes información adicional que te ayudará con tu respuesta:
<additionalContext>
{asXml(local('context'))}
</additionalContext>
{#endif}`,
      uk: `
{! Не додаємо записи кодексу двічі до додаткового контексту, !}
{! тому зберігаємо його в локальному контексті й використовуємо тут !}
{local('context', without(input("Additional Context"), codex.context))}

{#if local('context')}
Ось додаткова інформація, яка допоможе тобі з відповіддю:
<additionalContext>
{asXml(local('context'))}
</additionalContext>
{#endif}`,
      it: `
{! Non vogliamo includere due volte le voci del codex nel contesto aggiuntivo !}
{! Per questo lo salviamo nel contesto locale e lo usiamo qui !}
{local('context', without(input("Additional Context"), codex.context))}

{#if local('context')}
Ecco alcune informazioni aggiuntive che ti aiuteranno a rispondere:
<additionalContext>
{asXml(local('context'))}
</additionalContext>
{#endif}`,
      fr: `
{! Nous ne voulons pas inclure deux fois les entrées du codex dans le contexte supplémentaire !}
{! C’est pourquoi nous le stockons dans le contexte local et l’utilisons ici !}
{local('context', without(input("Additional Context"), codex.context))}

{#if local('context')}
Voici quelques informations supplémentaires pour t’aider à répondre :
<additionalContext>
{asXml(local('context'))}
</additionalContext>
{#endif}`,
    },
  },
  {
    key: 'component:additional-instructions',
    name: 'Novelmaker/AdditionalInstructions',
    description: {
      de: 'Die „zusätzlichen Anweisungen“ aus den Romaneinstellungen.',
      en: 'The "additional instructions" from the novel settings.',
      es: 'Las «instrucciones adicionales» de la configuración de la novela.',
      uk: '«Додаткові вказівки» з налаштувань роману.',
      it: 'Le «istruzioni aggiuntive» dalle impostazioni del romanzo.',
      fr: 'Les « instructions supplémentaires » des paramètres du roman.',
    },
    text: {
      de: `
{! Zusätzliche Anweisungen aus den Romaneinstellungen !}
{#if novel.instructions}
Zusätzliche Anweisungen des Autors:
<additionalInstructions>
{novel.instructions}
</additionalInstructions>
{#endif}`,
      en: `
{! Additional instructions from the novel settings !}
{#if novel.instructions}
Additional instructions from the author:
<additionalInstructions>
{novel.instructions}
</additionalInstructions>
{#endif}`,
      es: `
{! Instrucciones adicionales de la configuración de la novela !}
{#if novel.instructions}
Instrucciones adicionales del autor:
<additionalInstructions>
{novel.instructions}
</additionalInstructions>
{#endif}`,
      uk: `
{! Додаткові вказівки з налаштувань роману !}
{#if novel.instructions}
Додаткові вказівки автора:
<additionalInstructions>
{novel.instructions}
</additionalInstructions>
{#endif}`,
      it: `
{! Istruzioni aggiuntive dalle impostazioni del romanzo !}
{#if novel.instructions}
Istruzioni aggiuntive dell’autore:
<additionalInstructions>
{novel.instructions}
</additionalInstructions>
{#endif}`,
      fr: `
{! Instructions supplémentaires issues des paramètres du roman !}
{#if novel.instructions}
Instructions supplémentaires de l’auteur :
<additionalInstructions>
{novel.instructions}
</additionalInstructions>
{#endif}`,
    },
  },
  {
    key: 'component:chat-default-context',
    name: 'Novelmaker/Chat/DefaultContext',
    description: {
      de: 'Roman-, Serien- und Bandinfo, Kodex (inkl. codex.global) und zusätzlicher Kontext für Chat-Prompts.',
      en: 'Novel, series and volume info, codex (incl. codex.global) and additional context for chat prompts.',
      es: 'Información de la novela, la serie y el volumen, códice (incl. codex.global) y contexto adicional para prompts de chat.',
      uk: 'Інформація про роман, серію й том, кодекс (зокрема codex.global) і додатковий контекст для промптів чату.',
      it: 'Informazioni su romanzo, serie e volume, codex (incl. codex.global) e contesto aggiuntivo per i prompt della chat.',
      fr: 'Informations sur le roman, la série et le tome, codex (y compris codex.global) et contexte supplémentaire pour les prompts de chat.',
    },
    text: {
      de: chatDefaultContext('Grundinformationen zum Roman und ggf. zur Serie', 'codex.context enthält bereits alle Einträge aus codex.global (Einbindung „immer“)', {
        title: 'Titel',
        author: 'Autor',
        language: 'Sprache',
        tense: 'Zeitform',
        series: 'Serie',
        volume: 'Band',
        seriesDesc: 'Serienbeschreibung',
        desc: 'Beschreibung',
      }),
      en: chatDefaultContext('Basic information about the novel and, if applicable, the series', 'codex.context already contains all entries from codex.global (inclusion "always")', {
        title: 'Title',
        author: 'Author',
        language: 'Language',
        tense: 'Tense',
        series: 'Series',
        volume: 'volume',
        seriesDesc: 'Series description',
        desc: 'Description',
      }),
      es: chatDefaultContext('Información básica sobre la novela y, en su caso, la serie', 'codex.context ya contiene todas las entradas de codex.global (inclusión «siempre»)', {
        title: 'Título',
        author: 'Autor',
        language: 'Idioma',
        tense: 'Tiempo verbal',
        series: 'Serie',
        volume: 'volumen',
        seriesDesc: 'Descripción de la serie',
        desc: 'Descripción',
      }),
      uk: chatDefaultContext('Основна інформація про роман і, за потреби, про серію', 'codex.context уже містить усі записи з codex.global (включення «завжди»)', {
        title: 'Назва',
        author: 'Автор',
        language: 'Мова',
        tense: 'Час оповіді',
        series: 'Серія',
        volume: 'том',
        seriesDesc: 'Опис серії',
        desc: 'Опис',
      }),
      it: chatDefaultContext('Informazioni di base sul romanzo ed eventualmente sulla serie', 'codex.context contiene già tutte le voci di codex.global (inclusione «sempre»)', {
        title: 'Titolo',
        author: 'Autore',
        language: 'Lingua',
        tense: 'Tempo verbale',
        series: 'Serie',
        volume: 'volume',
        seriesDesc: 'Descrizione della serie',
        desc: 'Descrizione',
      }),
      fr: chatDefaultContext('Informations de base sur le roman et, le cas échéant, sur la série', 'codex.context contient déjà toutes les entrées de codex.global (inclusion « toujours »)', {
        title: 'Titre',
        author: 'Auteur',
        language: 'Langue',
        tense: 'Temps du récit',
        series: 'Série',
        volume: 'tome',
        seriesDesc: 'Description de la série',
        desc: 'Description',
      }),
    },
  },
  {
    key: 'component:chat-default-instructions',
    name: 'Novelmaker/Chat/DefaultInstructions',
    description: {
      de: 'Grundregeln für Chat-Antworten: Romansprache, Kontext nutzen, keine Prosa ohne Aufforderung.',
      en: 'Basic rules for chat answers: novel language, use the context, no prose unless asked.',
      es: 'Reglas básicas para las respuestas del chat: idioma de la novela, usar el contexto, nada de prosa sin que se pida.',
      uk: 'Основні правила для відповідей у чаті: мова роману, використання контексту, жодної прози без прохання.',
      it: 'Regole di base per le risposte in chat: lingua del romanzo, usare il contesto, niente prosa se non richiesta.',
      fr: 'Règles de base pour les réponses du chat : langue du roman, recours au contexte, pas de prose sans demande explicite.',
    },
    text: {
      de: `
Richtlinien für deine Antworten:
- Antworte immer in {novel.language}, außer der Autor bittet ausdrücklich um eine andere Sprache.
- Stütze deine Antworten auf den mitgegebenen Kontext (Romaninfo, Kodex, zusätzlicher Kontext). Fehlen Informationen, sag das, statt Fakten zu erfinden, die der Geschichte widersprechen.
- Schreib keine Prosa für den Roman, außer der Autor bittet ausdrücklich darum.
- Antworte knapp und konkret.
{include("Novelmaker/AdditionalInstructions")}`,
      en: `
Guidelines for your answers:
- Always answer in {novel.language}, unless the author explicitly asks for another language.
- Base your answers on the provided context (novel information, codex, additional context). If information is missing, say so instead of inventing facts that contradict the story.
- Do not write prose for the novel unless the author explicitly asks for it.
- Be concise and concrete.
{include("Novelmaker/AdditionalInstructions")}`,
      es: `
Pautas para tus respuestas:
- Responde siempre en {novel.language}, salvo que el autor pida expresamente otro idioma.
- Basa tus respuestas en el contexto proporcionado (información de la novela, códice, contexto adicional). Si falta información, dilo en lugar de inventar datos que contradigan la historia.
- No escribas prosa para la novela salvo que el autor lo pida expresamente.
- Sé conciso y concreto.
{include("Novelmaker/AdditionalInstructions")}`,
      uk: `
Настанови для твоїх відповідей:
- Завжди відповідай мовою роману ({novel.language}), якщо автор прямо не попросить іншої мови.
- Спирай свої відповіді на наданий контекст (інформація про роман, кодекс, додатковий контекст). Якщо інформації бракує, скажи про це, а не вигадуй факти, що суперечать історії.
- Не пиши прозу для роману, якщо автор прямо про це не попросить.
- Відповідай стисло й конкретно.
{include("Novelmaker/AdditionalInstructions")}`,
      it: `
Linee guida per le tue risposte:
- Rispondi sempre in {novel.language}, a meno che l’autore non chieda espressamente un’altra lingua.
- Basa le tue risposte sul contesto fornito (informazioni sul romanzo, codex, contesto aggiuntivo). Se mancano informazioni, dillo invece di inventare fatti che contraddicono la storia.
- Non scrivere prosa per il romanzo, a meno che l’autore non lo chieda espressamente.
- Sii conciso e concreto.
{include("Novelmaker/AdditionalInstructions")}`,
      fr: `
Consignes pour tes réponses :
- Réponds toujours dans la langue du roman ({novel.language}), sauf si l’auteur demande expressément une autre langue.
- Fonde tes réponses sur le contexte fourni (informations sur le roman, codex, contexte supplémentaire). S’il manque des informations, dis-le au lieu d’inventer des faits qui contredisent l’histoire.
- N’écris pas de prose pour le roman, sauf si l’auteur te le demande expressément.
- Réponds de façon concise et concrète.
{include("Novelmaker/AdditionalInstructions")}`,
    },
  },
];

function chatDefaultContext(
  intro: string,
  codexNote: string,
  w: { title: string; author: string; language: string; tense: string; series: string; volume: string; seriesDesc: string; desc: string },
): string {
  return `
{! ${intro} !}
<novelInfo>
${w.title}: {novel.title}
{#if novel.author}
${w.author}: {novel.author}
{#endif}
${w.language}: {novel.language}
${w.tense}: {novel.tense}
{#if novel.hasSeries}
${w.series}: {series.title}{#if novel.volume}, ${w.volume} {novel.volume}{#endif}
{#if series.description}
${w.seriesDesc}: {series.description}
{#endif}
{#endif}
{#if novel.description}
${w.desc}: {novel.description}
{#endif}
</novelInfo>

{! ${codexNote} !}
{include("Novelmaker/Codex")}

{include("Novelmaker/AdditionalContext")}`;
}

// ---------------------------------------------------------------- Baustein-Prompts

interface BlockBuiltinDef {
  key: string;
  type: PromptType;
  name: L<string>;
  description: L<string>;
  spec: (lang: Lang) => BlockPromptSpec;
}

const instr = (lang: Lang) => `{{${PLACEHOLDER_NAMES.instruction[lang]}}}`;
const len = (lang: Lang) => `{{${LENGTH_OPTION[lang]}}}`;

/** Umschreiben-Varianten: Name und Aufgabe je Sprache */
const EDITS: { key: string; name: L<string>; task: (lang: Lang) => string }[] = [
  {
    key: 'rewrite',
    name: { de: 'Umschreiben', en: 'Rewrite', es: 'Reescribir', uk: 'Переписати', it: 'Riscrivi', fr: 'Réécrire' },
    task: (lang) => TASK_REWRITE[lang],
  },
  {
    key: 'shorten',
    name: { de: 'Kürzen', en: 'Shorten', es: 'Acortar', uk: 'Скоротити', it: 'Accorcia', fr: 'Raccourcir' },
    task: (lang) =>
      ({
        de: 'Kürze die Textstelle auf etwa die Hälfte. Behalte den wesentlichen Inhalt, die Dialoge und die Stimme.',
        en: 'Shorten the passage to about half its length. Keep the essential content, the dialogue and the voice.',
        es: 'Acorta el fragmento a aproximadamente la mitad. Conserva el contenido esencial, los diálogos y la voz.',
        uk: 'Скороти фрагмент приблизно вдвічі. Збережи основний зміст, діалоги й голос.',
        it: 'Accorcia il passaggio a circa la metà. Mantieni il contenuto essenziale, i dialoghi e la voce.',
        fr: 'Réduis le passage à environ la moitié de sa longueur. Conserve l’essentiel du contenu, les dialogues et la voix.',
      })[lang] + `\n\n${instr(lang)}`,
  },
  {
    key: 'expand',
    name: { de: 'Erweitern', en: 'Expand', es: 'Ampliar', uk: 'Розширити', it: 'Espandi', fr: 'Développer' },
    task: (lang) =>
      ({
        de: 'Erweitere die Textstelle auf etwa die doppelte Länge – mit mehr konkreten Details, Sinneseindrücken, Gedanken und Dialog. Füge keine neuen Handlungsereignisse hinzu.',
        en: "Expand the passage to about twice its length – with more concrete details, sensory impressions, thoughts and dialogue. Don't add any new plot events.",
        es: 'Amplía el fragmento hasta aproximadamente el doble de extensión, con más detalles concretos, impresiones sensoriales, pensamientos y diálogo. No añadas nuevos acontecimientos a la trama.',
        uk: 'Розшир фрагмент приблизно вдвічі – більше конкретних деталей, чуттєвих вражень, думок і діалогів. Не додавай нових сюжетних подій.',
        it: 'Espandi il passaggio fino a circa il doppio della lunghezza, con più dettagli concreti, impressioni sensoriali, pensieri e dialoghi. Non aggiungere nuovi eventi alla trama.',
        fr: 'Développe le passage jusqu’à environ deux fois sa longueur, avec davantage de détails concrets, d’impressions sensorielles, de pensées et de dialogues. N’ajoute aucun nouvel événement à l’intrigue.',
      })[lang] + `\n\n${instr(lang)}`,
  },
  {
    key: 'custom-edit',
    name: { de: 'Eigene Anweisung', en: 'Custom instruction', es: 'Instrucción propia', uk: 'Власна вказівка', it: 'Istruzione personalizzata', fr: 'Instruction personnalisée' },
    task: (lang) =>
      ({
        de: 'Überarbeite die Textstelle nach dieser Anweisung:',
        en: 'Revise the passage according to this instruction:',
        es: 'Revisa el fragmento según esta instrucción:',
        uk: 'Відредагуй фрагмент згідно з цією вказівкою:',
        it: 'Rivedi il passaggio secondo questa istruzione:',
        fr: 'Retravaille le passage selon cette instruction :',
      })[lang] + `\n${instr(lang)}`,
  },
];

const EDIT_DESC: L<(name: string) => string> = {
  de: (n) => `Markierten Text: ${n.toLowerCase()}.`,
  en: (n) => `Selected text: ${n.toLowerCase()}.`,
  es: (n) => `Texto seleccionado: ${n.toLowerCase()}.`,
  uk: (n) => `Виділений текст: ${n.toLowerCase()}.`,
  it: (n) => `Testo selezionato: ${n.toLowerCase()}.`,
  fr: (n) => `Texte sélectionné : ${n.toLowerCase()}.`,
};

const BLOCK_BUILTINS: BlockBuiltinDef[] = [
  {
    key: 'beat',
    type: 'scene-beat-completion',
    name: { de: 'Szene aus Beat schreiben', en: 'Write scene from beat', es: 'Escribir escena a partir del beat', uk: 'Написати сцену з біту', it: 'Scrivi la scena dal beat', fr: 'Écrire la scène à partir du beat' },
    description: {
      de: 'Standard-Prompt: schreibt Prosa nach den Anweisungen im Beat.',
      en: 'Default prompt: writes prose following the instructions in the beat.',
      es: 'Prompt estándar: escribe prosa según las instrucciones del beat.',
      uk: 'Стандартний промпт: пише прозу за вказівками в біті.',
      it: 'Prompt predefinito: scrive prosa seguendo le istruzioni del beat.',
      fr: 'Prompt par défaut : écrit de la prose en suivant les instructions du beat.',
    },
    spec: (lang) => newBlockSpec('scene-beat-completion', lang),
  },
  {
    key: 'continue',
    type: 'continue-writing',
    name: { de: 'Weiterschreiben', en: 'Continue writing', es: 'Seguir escribiendo', uk: 'Писати далі', it: 'Continua a scrivere', fr: 'Continuer à écrire' },
    description: {
      de: 'Schreibt ab der Cursorposition weiter.',
      en: 'Continues writing from the cursor position.',
      es: 'Continúa escribiendo desde la posición del cursor.',
      uk: 'Пише далі з позиції курсора.',
      it: 'Continua a scrivere dalla posizione del cursore.',
      fr: 'Poursuit l’écriture à partir de la position du curseur.',
    },
    spec: (lang) => newBlockSpec('continue-writing', lang),
  },
  ...EDITS.map(
    (e): BlockBuiltinDef => ({
      key: e.key,
      type: 'text-replacement',
      name: e.name,
      description: Object.fromEntries(LANGS.map((l) => [l, EDIT_DESC[l](e.name[l])])) as L<string>,
      spec: (lang) => ({ ...newBlockSpec('text-replacement', lang), task: e.task(lang) }),
    }),
  ),
  {
    key: 'summary-scene',
    type: 'summary',
    name: { de: 'Szenen-Zusammenfassung', en: 'Scene summary', es: 'Resumen de escena', uk: 'Підсумок сцени', it: 'Riassunto della scena', fr: 'Résumé de scène' },
    description: {
      de: 'Fasst eine Szene zusammen (speist die „bisherige Handlung“).',
      en: 'Summarizes a scene (feeds the "story so far").',
      es: 'Resume una escena (alimenta «la historia hasta ahora»).',
      uk: 'Підсумовує сцену (наповнює «попередні події»).',
      it: 'Riassume una scena (alimenta «la storia finora»).',
      fr: 'Résume une scène (alimente « l’histoire jusqu’ici »).',
    },
    spec: (lang) => ({
      ...newBlockSpec('summary', lang),
      task: {
        de: `Fasse die Szene in höchstens ${len(lang)} Wörtern zusammen.`,
        en: `Summarize the scene in at most ${len(lang)} words.`,
        es: `Resume la escena en un máximo de ${len(lang)} palabras.`,
        uk: `Стисло виклади сцену щонайбільше в ${len(lang)} словах.`,
        it: `Riassumi la scena in non più di ${len(lang)} parole.`,
        fr: `Résume la scène en ${len(lang)} mots au maximum.`,
      }[lang],
    }),
  },
  {
    key: 'summary-chapter',
    type: 'summary',
    name: { de: 'Kapitel-Zusammenfassung', en: 'Chapter summary', es: 'Resumen de capítulo', uk: 'Підсумок розділу', it: 'Riassunto del capitolo', fr: 'Résumé de chapitre' },
    description: {
      de: 'Fasst ein Kapitel aus seinen Szenen-Zusammenfassungen zusammen.',
      en: 'Summarizes a chapter from its scene summaries.',
      es: 'Resume un capítulo a partir de los resúmenes de sus escenas.',
      uk: 'Підсумовує розділ на основі підсумків його сцен.',
      it: 'Riassume un capitolo a partire dai riassunti delle sue scene.',
      fr: 'Résume un chapitre à partir des résumés de ses scènes.',
    },
    spec: (lang) => ({
      ...newBlockSpec('summary', lang),
      role: {
        de: `Du bist eine erfahrene Lektorin und schreibst knappe Kapitel-Zusammenfassungen für die Gliederung eines Romans.
- Sprache: {{Romansprache}}. Schreib im Präsens und in der dritten Person.
- Behalte alle für die Handlung wichtigen Ereignisse, Entscheidungen und Enthüllungen; lass Nebensächliches weg.
- Keine Überschriften, keine Aufzählungen.`,
        en: `You are an experienced editor writing concise chapter summaries for a novel's outline.
- Language: {{Novel language}}. Write in the present tense and in the third person.
- Keep all events, decisions and revelations that matter for the plot; leave out minor details.
- No headings, no bullet points.`,
        es: `Eres una editora con experiencia y escribes resúmenes breves de capítulos para el esquema de una novela.
- Idioma: {{Idioma de la novela}}. Escribe en presente y en tercera persona.
- Conserva todos los acontecimientos, decisiones y revelaciones importantes para la trama; omite lo secundario.
- Sin títulos, sin viñetas.`,
        uk: `Ти – досвідчена редакторка й пишеш стислі підсумки розділів для плану роману.
- Мова: {{Мова роману}}. Пиши в теперішньому часі й від третьої особи.
- Збережи всі важливі для сюжету події, рішення та відкриття; другорядне опусти.
- Без заголовків, без списків.`,
        it: `Sei un’editor esperta e scrivi riassunti concisi dei capitoli per la scaletta di un romanzo.
- Lingua: {{Lingua del romanzo}}. Scrivi al presente e in terza persona.
- Mantieni tutti gli eventi, le decisioni e le rivelazioni importanti per la trama; tralascia i dettagli secondari.
- Niente titoli, niente elenchi puntati.`,
        fr: `Tu es une éditrice expérimentée et tu rédiges des résumés de chapitre concis pour le plan d’un roman.
- Langue : {{Langue du roman}}. Écris au présent et à la troisième personne.
- Conserve tous les événements, décisions et révélations qui comptent pour l’intrigue ; laisse de côté les détails secondaires.
- Ni titres, ni listes à puces.`,
      }[lang],
      task: {
        de: `Fasse dieses Kapitel auf Grundlage der Szenen-Zusammenfassungen oben in höchstens ${len(lang)} Wörtern zusammen.`,
        en: `Summarize this chapter based on the scene summaries above in at most ${len(lang)} words.`,
        es: `Resume este capítulo a partir de los resúmenes de escenas anteriores en un máximo de ${len(lang)} palabras.`,
        uk: `Стисло виклади цей розділ на основі наведених вище підсумків сцен щонайбільше в ${len(lang)} словах.`,
        it: `Riassumi questo capitolo sulla base dei riassunti delle scene qui sopra in non più di ${len(lang)} parole.`,
        fr: `Résume ce chapitre à partir des résumés de scènes ci-dessus, en ${len(lang)} mots au maximum.`,
      }[lang],
      blocks: { ...newBlockSpec('summary', lang).blocks, codex: { on: false } },
      options: [{ name: LENGTH_OPTION[lang], choices: ['150', '250', '400'], default: '250' }],
    }),
  },
  {
    key: 'summary-novel',
    type: 'summary',
    name: { de: 'Band-Zusammenfassung', en: 'Volume summary', es: 'Resumen del volumen', uk: 'Підсумок тому', it: 'Riassunto del volume', fr: 'Résumé du tome' },
    description: {
      de: 'Fasst einen ganzen Band aus den Kapitel-Zusammenfassungen zusammen (für den Band-Eintrag im Kodex).',
      en: 'Summarizes a whole volume from the chapter summaries (for the volume entry in the codex).',
      es: 'Resume un volumen completo a partir de los resúmenes de capítulos (para la entrada del volumen en el códice).',
      uk: 'Підсумовує весь том на основі підсумків розділів (для запису тому в кодексі).',
      it: 'Riassume un intero volume a partire dai riassunti dei capitoli (per la voce del volume nel codex).',
      fr: 'Résume un tome entier à partir des résumés de chapitres (pour l’entrée du tome dans le codex).',
    },
    spec: (lang) => ({
      ...newBlockSpec('summary', lang),
      role: {
        de: `Du bist eine erfahrene Lektorin. Du schreibst die Zusammenfassung eines ganzen Romans, die beim Schreiben späterer Bände der Serie als Hintergrundwissen dient.
- Sprache: {{Romansprache}}.
- Erfasse die Haupthandlung von Anfang bis Ende, die Entwicklung der Figuren, ihre Beziehungen und deren Stand am Ende, wichtige Orte und Gegenstände sowie alle offenen Handlungsfäden.
- Sachlich und genau, ohne Bewertung.`,
        en: `You are an experienced editor. You write the summary of an entire novel, which serves as background knowledge when writing later volumes of the series.
- Language: {{Novel language}}.
- Capture the main plot from beginning to end, the development of the characters, their relationships and where they stand at the end, important places and objects, and all open plot threads.
- Factual and precise, without evaluation.`,
        es: `Eres una editora con experiencia. Escribes el resumen de una novela completa, que servirá como conocimiento de fondo al escribir los siguientes volúmenes de la serie.
- Idioma: {{Idioma de la novela}}.
- Recoge la trama principal de principio a fin, la evolución de los personajes, sus relaciones y cómo quedan al final, los lugares y objetos importantes y todos los hilos argumentales abiertos.
- Objetivo y preciso, sin valoraciones.`,
        uk: `Ти – досвідчена редакторка. Ти пишеш підсумок цілого роману, який слугуватиме довідковими знаннями під час написання наступних томів серії.
- Мова: {{Мова роману}}.
- Охопи основний сюжет від початку до кінця, розвиток персонажів, їхні стосунки та їхній стан наприкінці, важливі місця й предмети, а також усі незавершені сюжетні лінії.
- Фактично й точно, без оцінок.`,
        it: `Sei un’editor esperta. Scrivi il riassunto di un intero romanzo, che servirà come conoscenza di base per scrivere i volumi successivi della serie.
- Lingua: {{Lingua del romanzo}}.
- Riporta la trama principale dall’inizio alla fine, l’evoluzione dei personaggi, le loro relazioni e la situazione alla fine, i luoghi e gli oggetti importanti e tutti i fili narrativi ancora aperti.
- Oggettivo e preciso, senza giudizi.`,
        fr: `Tu es une éditrice expérimentée. Tu rédiges le résumé d’un roman entier, qui servira de connaissances de fond pour l’écriture des tomes suivants de la série.
- Langue : {{Langue du roman}}.
- Rends compte de l’intrigue principale du début à la fin, de l’évolution des personnages, de leurs relations et de leur situation à la fin, des lieux et objets importants ainsi que de tous les fils narratifs encore ouverts.
- Factuel et précis, sans jugement.`,
      }[lang],
      task: {
        de: `Fasse den Roman „{{Romantitel}}“ auf Grundlage der Kapitel-Zusammenfassungen oben in höchstens ${len(lang)} Wörtern zusammen.`,
        en: `Summarize the novel "{{Novel title}}" based on the chapter summaries above in at most ${len(lang)} words.`,
        es: `Resume la novela «{{Título de la novela}}» a partir de los resúmenes de capítulos anteriores en un máximo de ${len(lang)} palabras.`,
        uk: `Стисло виклади роман «{{Назва роману}}» на основі наведених вище підсумків розділів щонайбільше в ${len(lang)} словах.`,
        it: `Riassumi il romanzo «{{Titolo del romanzo}}» sulla base dei riassunti dei capitoli qui sopra in non più di ${len(lang)} parole.`,
        fr: `Résume le roman « {{Titre du roman}} » à partir des résumés de chapitres ci-dessus, en ${len(lang)} mots au maximum.`,
      }[lang],
      blocks: { ...newBlockSpec('summary', lang).blocks, codex: { on: false }, novelInfo: { on: true } },
      options: [{ name: LENGTH_OPTION[lang], choices: ['500', '800', '1200'], default: '800' }],
    }),
  },
  {
    key: 'chat',
    type: 'workshop-chat',
    name: { de: 'Freier Chat', en: 'Free chat', es: 'Chat libre', uk: 'Вільний чат', it: 'Chat libera', fr: 'Chat libre' },
    description: {
      de: 'Allgemeiner Chat über den Roman mit frei wählbarem Kontext.',
      en: 'General chat about the novel with freely chosen context.',
      es: 'Chat general sobre la novela con contexto de libre elección.',
      uk: 'Загальний чат про роман із довільно вибраним контекстом.',
      it: 'Chat generale sul romanzo con contesto a scelta.',
      fr: 'Discussion générale sur le roman, avec un contexte au choix.',
    },
    spec: (lang) => newBlockSpec('workshop-chat', lang),
  },
  {
    key: 'chat-review',
    type: 'workshop-chat',
    name: { de: 'Ehrliches Review', en: 'Honest review', es: 'Reseña sincera', uk: 'Чесний відгук', it: 'Recensione sincera', fr: 'Critique honnête' },
    description: {
      de: 'Schonungsloses Leser-Feedback (ca. 2000 Wörter) zu einer Szene, einem Kapitel oder dem ganzen Roman. Im Chat als Kontext die Szene(n) oder „Ganzer Roman“ wählen; für „passt es zur bisherigen Geschichte?“ zusätzlich die Roman-Übersicht (Zusammenfassungen).',
      en: 'Unsparing reader feedback (about 2000 words) on a scene, a chapter or the whole novel. In the chat, choose the scene(s) or the whole novel as context; for "does it fit the story so far?" also add the novel overview (summaries).',
      es: 'Opinión de lector sin contemplaciones (unas 2000 palabras) sobre una escena, un capítulo o la novela completa. En el chat, elige como contexto la(s) escena(s) o la novela completa; para «¿encaja con la historia hasta ahora?», añade también la vista general de la novela (resúmenes).',
      uk: 'Безжальний читацький відгук (близько 2000 слів) на сцену, розділ або весь роман. У чаті виберіть як контекст сцену(и) або весь роман; для питання «чи пасує це до попередньої історії?» додайте ще огляд роману (підсумки).',
      it: 'Feedback da lettore senza sconti (circa 2000 parole) su una scena, un capitolo o l’intero romanzo. Nella chat scegli come contesto la scena (o le scene) o l’intero romanzo; per «si inserisce nella storia finora?» aggiungi anche la panoramica del romanzo (riassunti).',
      fr: 'Retour de lecteur sans concession (environ 2000 mots) sur une scène, un chapitre ou le roman entier. Dans le chat, choisissez comme contexte la ou les scènes ou le roman entier ; pour « est-ce cohérent avec l’histoire jusqu’ici ? », ajoutez aussi la vue d’ensemble du roman (résumés).',
    },
    spec: (lang) => ({
      ...newBlockSpec('workshop-chat', lang),
      role: reviewRole(lang),
      task: {
        de: `Der zu beurteilende Text steht oben im Kontext (gewählte Szenen, Kapitel oder der ganze Roman); Romaninfo, Kodex und Zusammenfassungen sind Hintergrundwissen.
Ist kein Text zum Beurteilen dabei, sag das und bitte darum, statt etwas zu erfinden.`,
        en: `The text to be assessed is in the context above (selected scenes, chapters or the whole novel); novel info, codex and summaries are background knowledge.
If there is no text to assess, say so and ask for it instead of making something up.`,
        es: `El texto que hay que valorar está arriba, en el contexto (escenas o capítulos elegidos o la novela completa); la información de la novela, el códice y los resúmenes son conocimiento de fondo.
Si no hay ningún texto que valorar, dilo y pídelo en lugar de inventarte algo.`,
        uk: `Текст для оцінювання наведено вище в контексті (вибрані сцени, розділи або весь роман); інформація про роман, кодекс і підсумки – це довідкові знання.
Якщо тексту для оцінювання немає, скажи про це й попроси його, замість того щоб щось вигадувати.`,
        it: `Il testo da valutare si trova sopra nel contesto (scene o capitoli scelti oppure l’intero romanzo); le informazioni sul romanzo, il codex e i riassunti sono conoscenze di base.
Se non c’è alcun testo da valutare, dillo e chiedilo invece di inventare qualcosa.`,
        fr: `Le texte à évaluer se trouve plus haut dans le contexte (scènes ou chapitres sélectionnés, ou le roman entier) ; les informations sur le roman, le codex et les résumés sont des connaissances de fond.
S’il n’y a aucun texte à évaluer, dis-le et demande-le au lieu d’inventer quelque chose.`,
      }[lang],
      // die Schreib-Anweisungen des Romans richten sich an eine schreibende KI, nicht an den Kritiker
      blocks: { ...newBlockSpec('workshop-chat', lang).blocks, novelInstructions: { on: false } },
    }),
  },
];

// ---------------------------------------------------------------- Zugriff

const cache = new Map<Lang, BuiltinPrompt[]>();

/** Alle mitgelieferten Prompts und Komponenten in einer Sprache. */
export function builtinPrompts(lang: Lang): BuiltinPrompt[] {
  const hit = cache.get(lang);
  if (hit) return hit;
  const list: BuiltinPrompt[] = [
    ...COMPONENTS.map((c) => ({
      key: c.key,
      type: 'component' as PromptType,
      name: c.name,
      description: c.description[lang],
      inputs: c.inputs?.(lang) ?? [],
      messages: [m('system', c.text[lang])],
    })),
    ...BLOCK_BUILTINS.map((b) => {
      const blocks = b.spec(lang);
      const { messages, inputs } = compileBlockPrompt(blocks, b.type, lang);
      return { key: b.key, type: b.type, name: b.name[lang], description: b.description[lang], messages, inputs, blocks };
    }),
  ];
  cache.set(lang, list);
  return list;
}

/** Ein mitgelieferter Prompt in einer Sprache. */
export const builtinPrompt = (key: string, lang: Lang): BuiltinPrompt | undefined => builtinPrompts(lang).find((b) => b.key === key);

/** Schlüssel aller mitgelieferten Prompts (in Seed-Reihenfolge). */
export const BUILTIN_KEYS: string[] = [...COMPONENTS.map((c) => c.key), ...BLOCK_BUILTINS.map((b) => b.key)];

/** Typ eines mitgelieferten Prompts. */
export const builtinType = (key: string): PromptType | undefined =>
  COMPONENTS.some((c) => c.key === key) ? 'component' : BLOCK_BUILTINS.find((b) => b.key === key)?.type;

/**
 * Fingerabdrücke früherer (Skript-)Fassungen der mitgelieferten Prompts. Steht ein solcher Prompt
 * unverändert in der Datenbank, wird er beim Start auf die Baustein-Fassung umgestellt.
 */
export const LEGACY_BUILTIN_FINGERPRINTS: Record<string, string[]> = {
  beat: ['8e7bc0b5'],
  continue: ['80153125'],
  rewrite: ['58614039'],
  shorten: ['bb8a52a8'],
  expand: ['3a22cbbc'],
  'custom-edit': ['a02c57d9'],
  'summary-scene': ['2f3caec5'],
  'summary-chapter': ['a5293c49'],
  'summary-novel': ['256c8d3b'],
  chat: ['30b93c93'],
};
