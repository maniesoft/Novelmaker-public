# Novelmaker

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Українська](README.uk.md) · **Italiano** · [Français](README.fr.md)

Un'app locale per scrivere romanzi, con l'aiuto dell'IA integrato nel manoscritto. Novelmaker gira nel tuo browser su `localhost` e conserva tutto in un unico file SQLite sul tuo computer. Funziona con i modelli di IA che scegli tu: tramite OpenRouter oppure con un modello in esecuzione sulla tua macchina (Ollama, LM Studio, KoboldCpp, …).

![Vista di scrittura: a sinistra la scaletta, al centro la scena con i nomi di personaggi e luoghi evidenziati, una scheda del codex per «Isolde Venn», a destra le note fissate e il pannello della scena](docs/screenshots/writing.png)

<sub>Tutti gli screenshot mostrano dati dimostrativi inventati.</sub>

## Indice

- [Perché esiste Novelmaker](#perché-esiste-novelmaker)
- [Che cos'è Novelmaker](#che-cosè-novelmaker)
- [Panoramica delle funzioni](#panoramica-delle-funzioni)
- [Lingue](#lingue)
- [Per iniziare](#per-iniziare)
- [Come funziona](#come-funziona)
- [Importare romanzi](#importare-romanzi)
- [Riferimento dei prompt](#riferimento-dei-prompt)
- [Dati, backup e più computer](#dati-backup-e-più-computer)
- [Scorciatoie da tastiera](#scorciatoie-da-tastiera)
- [Configurazione](#configurazione)
- [Sviluppo](#sviluppo)
- [Limiti noti](#limiti-noti)

## Perché esiste Novelmaker

L'idea di Novelmaker viene da [Novelcrafter](https://www.novelcrafter.com): un'app di scrittura in cui l'IA lavora direttamente dentro il manoscritto. Io volevo semplicemente la stessa cosa senza un sito web e senza un abbonamento.

Il mio problema più grande era il ritmo della mia scrittura. Alle fasi di leggerezza creativa, in cui usavo molto Novelcrafter, seguivano fasi in cui non scrivevo proprio niente, e intanto l'abbonamento continuava a correre. Il più delle volte, per pigrizia o per distrazione, non lo mettevo in pausa. Con Novelmaker paghi solo il tuo provider di IA, e solo per quello che generi davvero. Con un modello locale non paghi niente.

Un grande grazie e tantissimi complimenti a Novelcrafter. Novelmaker non vuole fare loro concorrenza in alcun modo. L'ho costruito per me, e chiunque voglia usarlo è il benvenuto.

Novelmaker non ha un server su internet, quindi i tuoi dati restano sul tuo computer (tranne i prompt che invii al tuo provider di IA). Questo significa anche:

- **Dei backup ti occupi tu.** Novelmaker crea copie di backup automaticamente, ma sul tuo disco. Tenerne una copia da un'altra parte (un altro disco, una cartella nel cloud) è compito tuo.
- **Le chiavi API le porti tu.** Ti serve una tua chiave API, ad es. per OpenRouter, oppure un modello in esecuzione sulla tua macchina.

## Che cos'è Novelmaker

Novelmaker è pensato per chi scrive narrativa lunga e vuole l'aiuto dell'IA **dentro il manoscritto** invece che in una finestra di chat separata. Tu scrivi. Quando vuoi che l'IA abbozzi un passaggio, lasci nel testo un'istruzione, chiamata *beat* (per esempio «Mara chiede del libro mastro scomparso; lui cambia discorso»), e fai clic su *Genera*. Novelmaker costruisce il prompt per te. Ci mette il testo prima del cursore, i riassunti delle scene precedenti e solo le voci del codex (personaggi, luoghi, lore) che contano per questa scena. Leggi il risultato e decidi cosa tenere.

I principi su cui si basa:

- **Locale e privato.** Un solo utente, nessun account, nessun servizio cloud proprio. Il tuo testo lascia il computer solo come parte dei prompt che invii al provider di IA che hai configurato.
- **Il modello lo scegli tu.** Funziona qualsiasi API compatibile con OpenAI: OpenRouter (centinaia di modelli, con i prezzi), Ollama, LM Studio, KoboldCpp o un tuo server.
- **Trasparente.** Vedi esattamente cosa va all'IA (il prompt finale, la selezione del codex con le motivazioni) e quanto costa, prima di fare clic e dopo.
- **L'autore resti tu.** L'output dell'IA non sostituisce mai il tuo testo di nascosto. Puoi applicarlo, metterlo da parte come variante, rigenerarlo o buttarlo via. Prima di ogni modifica applicata, Novelmaker salva una versione della scena.
- **Multilingue.** Interfaccia e prompt integrati in inglese, tedesco, spagnolo, ucraino, italiano e francese. Il tuo romanzo può essere in qualsiasi lingua conosciuta dal tuo modello (vedi [Lingue](#lingue)).

Fuori dagli obiettivi: più utenti, login, hosting su internet, un servizio di sincronizzazione. Le chiavi API sono salvate in chiaro nel database locale, quindi non rendere il server raggiungibile oltre `localhost`.

## Panoramica delle funzioni

### Libreria, romanzi e serie

![Libreria con una serie di due volumi e due romanzi singoli, ognuno con la sua copertina](docs/screenshots/library.png)

Un romanzo può essere autonomo oppure un volume di una serie. Le voci del codex possono appartenere a un solo volume o all'intera serie, così i personaggi passano da un libro all'altro. Ogni romanzo può avere una copertina (caricala o trascina dentro un'immagine). Puoi trasformare un romanzo singolo in una serie, aggiungerlo a una serie esistente o toglierlo di nuovo.

### Scrittura

La vista principale (lo screenshot in alto) ha tre parti:

- **Scaletta:** atti, capitoli e scene, da riordinare trascinandoli. Atti e scene sono facoltativi. Un libro senza atti e con un solo testo per capitolo appare esattamente così.
- **Editor:** una scena alla volta, oppure l'intero manoscritto come testo continuo. Salvataggio automatico, conteggio delle parole, modalità concentrazione, modalità scura. *Dividi* inizia una nuova scena o un nuovo capitolo al cursore.
- **Colonne laterali:** il pannello della scena (titolo, riassunto, punto di vista, etichette, versioni, contesto IA) e una colonna di elementi **fissati**: voci del codex, snippet o altre scene che vuoi tenere sott'occhio mentre scrivi.

I nomi e gli alias del codex sono sottolineati nel testo. Passandoci sopra con il mouse appare una scheda, e *Ctrl+clic* apre la voce direttamente sopra il testo. Ogni scena può avere il proprio **punto di vista** (personaggio POV e prospettiva narrativa); per impostazione predefinita segue quello del romanzo. Le **note nascoste** restano nel testo per te, ma non fanno parte del manoscritto e non vengono mai inviate all'IA.

### Beat e varianti

![Un beat con la sua istruzione, la scelta di prompt e modello, il passaggio generato con Applica/Metti da parte/Rigenera/Scarta e, sotto, una variante precedente messa da parte in un riquadro tratteggiato](docs/screenshots/beat-variants.png)

Un **beat** è un blocco di istruzioni dentro la scena. Scegli il prompt, il modello e opzioni come la lunghezza («Parole: 400»). La risposta compare man mano sotto il beat. Poi:

- **Applica** inserisce il testo nella scena (prima viene salvata una versione della scena).
- **Metti da parte** conserva la risposta come variante numerata in un **riquadro** sotto il beat, così puoi riprovare e confrontare. I riquadri si possono comprimere, intitolare, sciogliere in testo normale o eliminare. Per impostazione predefinita sono *nascosti all'IA*: non vengono inviati nei prompt, non vengono contati, non vengono esportati.
- **Rigenera** oppure **Scarta**.

### Il menu «/»

<img src="docs/screenshots/slash-menu.png" alt="Menu dei comandi dopo aver digitato / in una riga vuota: Beat, Nota, Riquadro, Continua a scrivere" width="560">

Digita `/` all'inizio di una riga vuota per inserire un beat, una nota o un riquadro, oppure per far continuare a scrivere l'IA da quel punto. Continuando a digitare filtri l'elenco (`/no` → Nota).

### Riscrivere, accorciare, espandere

![Finestra Riscrivi con il passaggio selezionato a sinistra e la versione dell'IA a destra](docs/screenshots/rewrite.png)

Seleziona del testo e scegli **Riscrivi**, **Accorcia**, **Espandi** o **Istruzione …** (una tua istruzione, ad es. «più tensione, frasi più brevi»). Vedi il prima e il dopo affiancati e puoi applicare, mettere da parte o rigenerare. **Continua a scrivere** (barra degli strumenti o `/`) abbozza il passaggio successivo a partire dal cursore.

### Conosci il costo prima di fare clic

<img src="docs/screenshots/cost-estimate.png" alt="Scheda al passaggio del mouse con i token stimati di input e di risposta, il costo totale, il costo massimo con max_tokens, il prezzo per milione di token e l'occupazione della finestra di contesto" width="560">

Ogni pulsante *Genera* mostra una stima (ad es. «≈ 1.50 ¢»). Passandoci sopra con il mouse vedi i dettagli: token di input e di risposta, costo, il massimo con `max_tokens`, il prezzo del modello e quanto è piena la finestra di contesto. Dopo la chiamata vengono mostrati i numeri reali del provider, che restano anche nel registro.

### Codex

![Pagina del codex con le voci raggruppate per tipo e l'editor del personaggio «Mara Quill»](docs/screenshots/codex.png)

Personaggi, luoghi, oggetti, lore, sottotrame, volumi e qualsiasi altra cosa. Ogni voce ha alias, una descrizione che viene inviata all'IA, note private che invece non vengono inviate, campi personalizzati, tag e relazioni. Il riconoscimento gestisce le forme flesse e i possessivi («Mara's» → Mara), e per i nomi che sono anche parole comuni puoi impostare una voce in modo che distingua tra maiuscole e minuscole. L'**inclusione** decide quando una voce entra in un prompt:

- **Se menzionato** (predefinito): la voce viene inclusa non appena il suo nome o un alias compare vicino al cursore.
- **Sempre:** ad es. una guida di stile o le regole del mondo.
- **Mai:** solo quando un prompt la richiede esplicitamente, ad es. un elenco di parole vietate.

### Vedi quello che vede l'IA

<img src="docs/screenshots/ai-context.png" alt="Colonna degli elementi fissati accanto alla scheda IA del pannello della scena, con le voci del codex che un beat includerebbe, ciascuna con il motivo (sempre, POV, fissato, menzionato) e il numero di token" width="560">

La scheda **IA** del pannello della scena elenca quali voci del codex un beat includerebbe e perché (sempre, personaggio POV, fissato, menzionato), con il numero di token. Le voci che non rientrano nel budget di token sono barrate. *Mostra l'intero prompt* (oppure *Anteprima* accanto a qualsiasi pulsante Genera) mostra il prompt finale completo.

### Piano e riassunti

![Vista Piano: capitoli come schede con riassunti delle scene modificabili e le voci del codex menzionate in ogni scena](docs/screenshots/plan.png)

Il piano mostra capitoli e scene come schede con riassunti modificabili. I riassunti alimentano «la storia finora» che ricevono i prompt dei beat. **Genera riassunti** viene eseguito come processo in background, con stima dei costi e avanzamento: scene → capitoli → volume. Il riassunto di un volume diventa una voce del codex a livello di serie, così il libro successivo «sa» cosa è successo prima.

### Chat

![Chat sul romanzo con capitoli e voci del codex allegati come contesto](docs/screenshots/chat.png)

Chat salvate per ogni romanzo, con un contesto che scegli tu: atti, capitoli o scene (testo completo o riassunto), voci del codex, snippet, l'intero romanzo o testo libero. Le risposte si possono copiare, salvare come snippet o come voce del codex, oppure **trasformare in beat in una scena**. Sono già incluse una chat libera e **Recensione sincera**, che dà un parere schietto da lettore sulle scene, sui capitoli o sul romanzo che alleghi.

### Officina dei prompt

![Editor dei prompt con il testo di ruolo e stile che contiene chip segnaposto, blocchi di contesto da spuntare e un'anteprima dal vivo del prompt finale per una scena reale](docs/screenshots/prompt-workshop.png)

I prompt si costruiscono a **blocchi**, senza codice: un testo di ruolo e stile, blocchi di contesto da spuntare, un compito e opzioni che scegli al momento dell'esecuzione. I segnaposto come *Personaggio POV* o *Tempo verbale* appaiono come chip. L'anteprima dal vivo mostra il prompt applicato a una scena reale del tuo romanzo. Vedi [Riferimento dei prompt](#riferimento-dei-prompt).

### Modelli e provider

![Raccolta di modelli «Fiction» con quattro modelli di OpenRouter e Ollama e parametri predefiniti facoltativi per ogni modello](docs/screenshots/model-collections.png)

Aggiungi OpenRouter (con la tua chiave API) o un server locale, carica il suo elenco di modelli e poi raccogli i tuoi modelli preferiti in **raccolte di modelli**, così la scelta del modello resta breve. Ogni modello può avere parametri predefiniti (ad es. `{"temperature": 0.9}`). Le raccolte si possono importare da Novelcrafter ed esportare verso Novelcrafter.

### Importazione ed esportazione

<img src="docs/screenshots/import.png" alt="Finestra di importazione per un file zip: titolo, serie di destinazione, numero di capitoli e scene trovati, voci del codex e snippet da importare" width="480">

Importa Word, Markdown, testo semplice o uno zip con manoscritto, cartella del codex e snippet, comprese le esportazioni complete di Novelcrafter (vedi [Importare romanzi](#importare-romanzi)). Prima di importare qualsiasi cosa, la finestra mostra cosa è stato trovato, e il libro può entrare in una serie esistente come volume successivo. Esporta l'intero romanzo o un singolo atto, capitolo o scena come Word (.docx) o Markdown, oppure copialo come testo formattato (titoli e corsivi restano quando incolli in Word). Prompt e raccolte di modelli si possono scambiare con Novelcrafter.

### Modalità scura e modalità concentrazione

![Vista del manoscritto in modalità scura](docs/screenshots/dark-mode.png)

### Inoltre

- **Ricerca** tra scene, codex e snippet.
- **Snippet:** note libere e materiale di ricerca, utilizzabili come contesto per l'IA.
- **Versioni:** istantanee delle scene, create automaticamente prima delle modifiche dell'IA, ripristinabili.
- **Registro:** ogni generazione con i messaggi finali, la risposta, i token, il costo e la durata.

## Lingue

Novelmaker supporta sei lingue in ogni sua parte: **inglese (English), tedesco (Deutsch), spagnolo (Español), ucraino (Українська), italiano e francese (Français)**.

| Cosa | Come funziona |
|---|---|
| **Interfaccia** | **Impostazioni → Generale → Lingua.** Al primo avvio viene usato l'inglese. La scelta viene salvata nel database, quindi ti segue anche su altri computer. I messaggi del server (errori, processi in background) usano la stessa lingua. |
| **Prompt integrati** | Ogni prompt integrato esiste in tutte e sei le lingue. Ogni prompt, compresi i tuoi, può avere una versione per lingua. L'officina dei prompt mostra una barra delle lingue (EN DE ES UK IT FR); se manca una versione, ripiega su un'altra e propone di copiarla. |
| **Lingua del romanzo** | Si imposta per ogni romanzo, indipendentemente dalla lingua dell'interfaccia. Dice all'IA in quale lingua scrivere, quindi puoi scrivere in qualsiasi lingua conosciuta dal tuo modello. I testi che Novelmaker aggiunge da sé ai prompt (la frase sul punto di vista, etichette come «Capitolo 3») seguono la lingua del romanzo per le sei lingue indicate sopra e negli altri casi sono in inglese. |
| **Riconoscimento del codex** | Funziona con qualsiasi alfabeto (accenti, umlaut, cirillico). Le desinenze automatiche (il possessivo inglese *'s*, le desinenze tedesche *-s/-n/-en*) sono pensate per l'inglese e il tedesco. Per le lingue con molte desinenze di caso, come l'ucraino, aggiungi le forme flesse come alias. |
| **Questo README** | English, Deutsch, Español, Українська, Italiano, Français (link in alto). |

Gli screenshot in tutte le versioni di questo README mostrano l'interfaccia in inglese. Se vuoi migliorare una traduzione o aggiungere una lingua, **Impostazioni → Generale → Aiuta a tradurre Novelmaker …** apre una tabella apposita; i dettagli sono in [Traduzioni](#traduzioni).

## Per iniziare

### Requisiti

[Node.js](https://nodejs.org) 22 o successivo. Nient'altro: il database è un file e l'interfaccia web viene compilata al primo avvio.

### Avvio

**Windows:** fai doppio clic su `start.bat`. Il primo avvio installa le dipendenze e compila l'interfaccia (ci vuole un minuto o due), poi il browser apre <http://localhost:3000>. Agli avvii successivi l'interfaccia viene ricompilata solo se il codice sorgente è cambiato.

**macOS, Linux o a mano:**

```sh
npm install
npm run build
npm start          # server + interfaccia su http://localhost:3000
```

**Chiusura:** scegli **Dati → Chiudi Novelmaker** nella barra superiore, chiudi la finestra della console oppure premi `Ctrl+C` al suo interno. In tutti e tre i casi viene prima creato un backup.

### Primi passi

1. **Impostazioni → Generale:** scegli la lingua dell'interfaccia. L'inglese è quella predefinita.
2. **Impostazioni → Provider IA:** aggiungi OpenRouter (inserisci la tua chiave API) e/o un server locale, poi fai clic su *Carica / testa modelli*.
3. **Impostazioni → Raccolte di modelli:** raccogli i modelli che vuoi usare e segna una raccolta come predefinita.
4. **Libreria → Nuovo romanzo**, oppure **Importa** un manoscritto esistente.
5. **Romanzo** (nella barra in alto del romanzo): imposta lingua, tempo verbale, punto di vista e personaggio POV. Le *Istruzioni aggiuntive per l'IA* finiscono in ogni prompt di beat e di chat.
6. Scrivi. Per avere l'aiuto dell'IA, digita `/` in una riga vuota, scegli *Beat*, descrivi cosa deve succedere e premi *Genera* (oppure `Ctrl+Enter`).
7. Facoltativo: **Dati → Posizione e backup** sposta il database in una cartella di Dropbox o OneDrive, così puoi lavorare su più computer.

## Come funziona

### Architettura

```
Browser (http://localhost:3000)
  React · TipTap (editor di testo) · CodeMirror (editor dei prompt)
        │  REST + Server-Sent Events per lo streaming
        ▼
Server Node.js (Fastify)
  ├─ database SQLite: un solo file con tutto
  ├─ motore dei prompt e riconoscimento del codex (stesso codice del browser)
  └─ client LLM ──▶ OpenRouter · Ollama · LM Studio · KoboldCpp · qualsiasi API compatibile con OpenAI
```

Il server serve per due motivi: spesso i browser non riescono a raggiungere direttamente i server di IA locali (CORS), e fare il backup di un unico file di database, o spostarlo, è più semplice che con lo spazio di archiviazione del browser. Il pacchetto `shared/` (motore dei prompt, riconoscimento del codex, tipi) gira sia nel browser sia sul server. In questo modo l'anteprima dal vivo e l'evidenziazione dei nomi si comportano esattamente come la generazione vera.

### Come viene salvato un romanzo

- **Serie → Romanzo (volume) → Atto → Capitolo → Scena.** Internamente esistono sempre tutti i livelli. L'interfaccia nasconde il livello degli atti quando c'è un solo atto, e quello delle scene quando un capitolo ha una sola scena.
- **Il testo delle scene** viene salvato come documento strutturato (JSON di ProseMirror) più una copia in testo semplice. Beat, note nascoste e riquadri sono blocchi dello stesso documento, ma non fanno parte del manoscritto: non vengono contati, né esportati, né inviati all'IA come testo della storia.
- **Le voci del codex** stanno a livello di serie (condivise da tutti i volumi) o a livello di volume. Una voce di volume con lo stesso nome prevale sulla voce della serie.
- Vengono salvati anche: i prompt (una versione per lingua dell'interfaccia), i provider, le raccolte di modelli, le chat, gli snippet, le versioni delle scene e il registro delle generazioni.

### Cosa succede quando fai clic su Genera

1. Il browser invia quale prompt e quale modello usare, le tue opzioni (ad es. *Parole: 400*, contesto aggiuntivo) e dove ti trovi: scena, beat, posizione del cursore o selezione.
2. Il server raccoglie ciò che chiedono i blocchi del prompt, per esempio i dati del romanzo, il testo prima e dopo il cursore, la fine della scena precedente, i riassunti di tutte le scene precedenti («la storia finora») e l'eventuale contesto che hai aggiunto.
3. **Selezione del codex:** cerca nomi e alias nella scena e nel beat, aggiunge le voci impostate su *Sempre*, il personaggio POV e le voci fissate, le ordina per priorità (sempre > POV > fissate > menzionate > resto) e si ferma al budget di token impostato nelle impostazioni del romanzo.
4. **Rendering:** i blocchi del prompt vengono compilati in messaggi di chat (system / user / assistant), che il motore dei template poi riempie.
5. **Streaming:** `max_tokens` viene ricavato dall'opzione *Parole*, a meno che non lo imposti la raccolta di modelli. La richiesta va al provider e la risposta torna al browser token per token.
6. **La tua decisione:** applicare, mettere da parte, rigenerare o scartare. Ogni chiamata viene registrata con i messaggi finali, la risposta, i token, il costo e la durata.

La **stima dei costi** esegue i passaggi 1–4 senza chiamare il modello. I token di input vengono stimati a circa 3,5 caratteri per token. La lunghezza della risposta viene da *Parole*, da *Lunghezza* (riassunti) o dal testo selezionato (riscrittura). I prezzi vengono dall'elenco dei modelli del provider: OpenRouter li fornisce, mentre i server locali contano come gratuiti.

### Prompt: blocchi, non codice

Un prompt di Novelmaker è composto da quattro parti (ruolo e stile, blocchi di contesto, compito, opzioni) e non richiede di programmare. Quando lo salvi, Novelmaker lo converte in messaggi per il suo motore dei template. Lo stesso motore esegue i prompt importati da Novelcrafter, che usano un piccolo linguaggio di script. I dettagli sono nel [Riferimento dei prompt](#riferimento-dei-prompt).

## Importare romanzi

**Libreria → Importa** accetta Word (`.docx`), Markdown (`.md`), testo semplice (`.txt`) o uno zip. Prima dell'importazione, una finestra mostra cosa è stato trovato. Lì puoi anche scegliere una serie esistente; il romanzo diventa allora il suo volume successivo.

- **Per impostazione predefinita tutto è prosa.** I titoli dividono il testo in capitoli (due livelli di titolo: atto + capitolo; tre: atto / capitolo / scena). `* * *` o una linea orizzontale inizia una nuova scena. Nei file di testo, righe come «Chapter 2: Title», «Prologue» o «Epilogue» diventano capitoli e «Part 1» diventa un atto.
- **Struttura dello zip:**

  ```
  Novel.zip
    Manuscript.docx   (oppure .md/.txt; più file = un capitolo ciascuno, ordinati per numero)
    Context/          una voce del codex per file; le sottocartelle Characters/, Locations/, Objects/, Lore/, Subplots/ ne stabiliscono il tipo
    Snippets/         uno snippet per file
  ```

  Funzionano anche i nomi delle cartelle in tedesco (`Kontext/`, `Figuren/`, `Orte/`, `Notizen/`, …).
- I file Markdown in `Context/` possono iniziare con un'intestazione come `aliases: Anni, signora Berg`, `type: character`, `always: true` (oppure `never: true`). Altre righe come `Età: 31` diventano campi personalizzati.
- **Esportazione di Novelcrafter:** uno zip completo di Novelcrafter viene riconosciuto automaticamente (la casella *Esportazione Novelcrafter* risulta spuntata). Riassunto e prosa di ogni scena vengono separati in corrispondenza della linea divisoria, e codex, snippet e chat vengono presi dalle cartelle di Novelcrafter. Le scene senza linea vengono classificate automaticamente; puoi cambiare la classificazione nella finestra.
- I file Word esportati da Novelmaker si possono reimportare con la stessa scaletta.

## Riferimento dei prompt

### Prompt a blocchi

| Parte | Contenuto |
|---|---|
| **Ruolo e stile** | Testo libero: chi è l'IA e come deve scrivere («Sei una redattrice onesta…», un'intera guida di stile, cose da evitare). |
| **Blocchi di contesto** | Spunta cosa deve ricevere l'IA: le istruzioni aggiuntive del romanzo, le parole vietate (gli alias di una voce del codex), le informazioni sul romanzo, il codex, la storia finora, il riassunto della scena, il contesto scelto al momento dell'esecuzione, la fine della scena precedente (*n* parole, facoltativamente solo con lo stesso personaggio POV), il testo prima del cursore (*n* parole, facoltativamente come modello di stile), il testo dopo il cursore, il testo selezionato e, per i riassunti, il testo da riassumere. Vengono proposti solo i blocchi adatti al tipo di prompt. |
| **Compito** | Testo libero: cosa deve fare l'IA (nella chat: le regole per le risposte). |
| **Opzioni** | Campi scelti al momento dell'esecuzione, ad es. *Parole: 200 / 400 / 600*. *Parole* limita anche la lunghezza della risposta; *Lunghezza* fa lo stesso per i riassunti. |

**I segnaposto** appaiono come chip. Inseriscili con *Segnaposto* o digitando `{{`: *Beat*, *Istruzione*, *Prospettiva*, *Personaggio POV*, *Lingua del romanzo*, *Tempo verbale*, *Titolo del romanzo*, *Autore*, *Serie*, *Volume*, *Capitolo*, *Scena*, più ogni opzione (ad es. `{{Parole}}`). Vengono salvati come semplice `{{Nome}}`.

**Nuovo** crea un prompt con *tutti* i blocchi del suo tipo, già impostati in modo sensato; togli la spunta a ciò che non ti serve. L'ordine non lo decidi tu. Ruolo e istruzioni diventano il messaggio di sistema, seguiti dal contesto, dal testo prima del cursore come modello di stile (l'IA lo tratta come un proprio output precedente) e infine dal compito. Nella chat tutto va nel messaggio di sistema. L'anteprima dal vivo mostra esattamente cosa verrà inviato.

Tipi di prompt: *Beat → prosa*, *Continua a scrivere*, *Modifica testo* (riscrivere, accorciare, espandere, istruzione personalizzata), *Riassunto* (scena, capitolo, volume), *Chat* e *Componente* (parti riutilizzabili per i prompt a script).

### Prompt a script (importati)

I prompt importati da Novelcrafter restano prompt a script e funzionano senza modifiche. **Converti in blocchi** crea una copia a blocchi se il prompt usa solo schemi comuni; altrimenti Novelmaker indica le parti che non hanno un equivalente a blocchi. Per questo scopo sono inclusi i componenti `Novelmaker/Codex`, `…/AdditionalContext`, `…/AdditionalInstructions`, `…/Chat/DefaultContext` e `…/Chat/DefaultInstructions`, e durante l'importazione i riferimenti a `Novelcrafter/…` vengono riscritti per puntare a questi.

```
{novel.title}   {wordsBefore(1500)}   {pov.character(scene.previous)}
{#if condizione} … {#elseif condizione} … {#else} … {#endif}
{! commento !}
"testo" o 'testo', numeri, + (concatenazione), is, is not, in, and, or, not
```

Le espressioni possono occupare più righe. In `#if`, un valore è vero se non è vuoto. I nomi di funzioni e input non distinguono tra maiuscole e minuscole. Le funzioni sconosciute producono un avviso invece di un errore. Le righe che contengono solo `{#if}`/`{#endif}`/commenti spariscono insieme al loro a capo. I messaggi vuoti vengono scartati e i messaggi consecutivi con lo stesso ruolo vengono uniti.

<details>
<summary>Elenco delle funzioni</summary>

| Gruppo | Funzioni |
|---|---|
| Romanzo | `novel.title`, `novel.author`, `novel.description`, `novel.summary`, `novel.language`, `novel.tense`, `novel.instructions`, `novel.hasSeries`, `novel.volume`, `novel.outline`, `novel.chapterSummaries`, `novel.fullText`, `novel.wordCount` |
| Serie | `series.title`, `series.description`, `series.volumes` |
| Punto di vista | `pov`, `pov.character(scene?)`, `pov.name(scene?)`, `pov.type(scene?)` |
| Scena | `scene`, `scene.title(scene?)`, `scene.summary(scene?)`, `scene.fullText(scene?)`, `scene.previous(scene?)`, `scene.next(scene?)`, `scene.number(scene?)`, `scene.labels(scene?)`, `scene.wordCount(scene?)`, `scene.chapter(scene?)`, `storySoFar`, `previousScenes(n)` |
| Capitolo | `chapter`, `chapter.title(chapter?)`, `chapter.summary(chapter?)`, `chapter.fullText(chapter?)`, `chapter.number(chapter?)`, `chapter.scenes(chapter?)`, `chapter.sceneSummaries(chapter?)`, `chapter.previous(chapter?)`, `chapter.next(chapter?)` |
| Atto | `act`, `act.title(act?)`, `act.summary(act?)`, `act.fullText(act?)`, `act.number(act?)`, `act.chapters(act?)` |
| Testo | `message`, `textBefore`, `textAfter`, `wordsBefore(n)`, `wordsAfter(n)`, `isStartOfText`, `selection`, `lastWords(text, n)`, `firstWords(text, n)`, `wordCount(text)`, `upper`, `lower`, `trim` |
| Codex | `codex.context`, `codex.global`, `codex.mentioned`, `codex.get(name, …)`, `codex.aliases(name)`, `codex.name/description/type(entry)`, `codex.field(entry, key)`, `codex.characters`, `codex.locations`, `codex.objects`, `codex.lore`, `codex.subplots`, `codex.volumes`, `codex.all`, `codex.byTag(tag)` |
| Snippet | `snippet.get(title)`, `snippet.text(snippet)` |
| Composizione | `include("Component")`, `input("Name")`, `local("name", value?)` |
| Liste e formato | `without(list, list2)`, `join(list, separator?)`, `count`, `first`, `last`, `list(…)`, `asXml`, `asMarkdown`, `asText` |
| Logica | `and(…)`, `or(…)`, `not(a)`, `isEmpty(a)`, `isNotEmpty(a)`, `is(a, b)`, `contains(list\|text, value)`, `if(cond, then, else?)`, `default(value, fallback)` |

Le proprietà si possono concatenare, ad es. `{scene.previous.summary}` o `{pov.character.name}`. Per impostazione predefinita, voci del codex, scene ecc. vengono rese come XML (`<character name="…" aliases="…">…</character>`); le impostazioni del romanzo offrono anche Markdown o testo semplice.

</details>

## Dati, backup e più computer

- **Database:** per impostazione predefinita `data/novelmaker.db`, un solo file con tutto (comprese le chiavi API in chiaro).
- **Posizione** (Dati → Posizione e backup): per esempio una cartella di Dropbox o OneDrive, per lavorare su più computer. Novelmaker sposta lì il file, oppure usa un database che esiste già in quella cartella (ad es. sul tuo secondo computer). Non serve riavviare. La scelta viene salvata per ogni computer in `data/config.json`.
- **Più computer:** lavora su uno solo alla volta e chiudi Novelmaker prima di passare all'altro. Un file di blocco (`novelmaker.db.lock`) accanto al database fa comparire un avviso se il database è ancora aperto altrove, e vengono segnalate anche le copie in conflitto di Dropbox/OneDrive. Il database funziona senza file WAL, quindi dopo ogni salvataggio lo stato completo si trova in quell'unico file.
- **Backup** (cartella a scelta, predefinita `data/backups/`, vengono conservati gli ultimi N): all'avvio se il file è cambiato dall'ultimo backup, alla chiusura, prima di eliminare un romanzo o una serie, e su richiesta (Dati → Esegui backup ora). Le impostazioni del romanzo offrono anche un'esportazione completa in JSON.
- **Salvataggio automatico:** il testo viene salvato 0,8 s dopo che smetti di digitare, e almeno ogni 3 s mentre continui a scrivere.
- **Ripristino:** chiudi Novelmaker, copia un backup nella cartella del database e rinominalo in `novelmaker.db`.

## Scorciatoie da tastiera

| Tasti | Azione |
|---|---|
| `/` all'inizio di una riga vuota | Menu dei comandi (beat, nota, riquadro, continua a scrivere) |
| `Ctrl+Shift+B` | Inserisci beat |
| `Ctrl+Alt+N` | Inserisci nota nascosta |
| `Ctrl+Enter` in un beat | Genera |
| `Ctrl+clic` su un nome evidenziato | Apri la voce del codex |
| `Ctrl+S` | Salva (impostazioni del romanzo, editor dei prompt) |
| `Ctrl+Z` / `Ctrl+Y` | Annulla / ripeti (recupera anche un riquadro eliminato) |
| `Esc` | Chiudi finestre e menu, esci dalla modalità concentrazione |

Su macOS usa `Cmd` invece di `Ctrl`.

## Configurazione

| Variabile d'ambiente | Predefinito | Significato |
|---|---|---|
| `PORT` | `3000` | Porta del server e dell'interfaccia |
| `HOST` | `localhost` | Indirizzo su cui il server è in ascolto |
| `NOVELMAKER_DATA` | `data/` nella cartella del programma | Cartella per `config.json`, il database (se non è stato spostato) e i backup |
| `NOVELMAKER_OPEN` | non impostata | `1` apre il browser dopo l'avvio (`start.bat` la imposta) |

## Sviluppo

```sh
npm run dev        # hot reload: interfaccia su http://localhost:5173, API sulla porta 3000
npm test           # vitest (shared + server)
npm run typecheck  # TypeScript per tutti e tre i pacchetti
npm run i18n       # controlla i file di traduzione
```

```
start.bat             avvia server + browser (installa/compila quando serve)
shared/               motore dei prompt, riconoscimento del codex, prompt a blocchi, codec Novelcrafter, i18n, tipi (browser + server)
server/               Fastify, SQLite (better-sqlite3), client LLM (compatibile con OpenAI, streaming), processi in background, importazione/esportazione
web/                  React, TipTap, CodeMirror, Tailwind
scripts/              controllo della build per start.bat, verifica delle traduzioni
docs/screenshots/     immagini per questo README
```

### Traduzioni

I testi dell'interfaccia sono scritti in inglese nel codice e fanno da chiavi (`t('Save')`). Ogni altra lingua ha un file JSON che associa il testo inglese alla sua traduzione: `shared/src/i18n/locales/{de,es,uk,it,fr}.json`.

- **Nell'app:** **Impostazioni → Generale → Aiuta a tradurre Novelmaker …** apre una tabella con il testo inglese, un'altra lingua per confronto e la tua traduzione. Filtra i testi mancanti e i segnaposto non validi, salva direttamente nel file della lingua e può scaricare o importare un file di lingua. È pensata per chi aiuta con le traduzioni; per l'uso normale non serve.
- **A mano** (non serve saper programmare): cambia il valore nel file JSON. Lascia invariati i segnaposto come `{n}` o `{name}` e i tag come `<b>…</b>`. I plurali si possono scrivere come `{ "one": "…", "few": "…", "many": "…", "other": "…" }` (le regole vengono da `Intl.PluralRules`). `npm run i18n` segnala le chiavi mancanti e i segnaposto non validi.
- Le modifiche salvate nella tabella valgono subito. Quelle fatte direttamente nei file hanno effetto al prossimo avvio: `start.bat` ricompila l'interfaccia automaticamente, altrimenti esegui `npm run build`.
- **Testi inglesi migliori** si cambiano nel codice. Insieme al testo cambia anche la chiave, quindi le altre lingue hanno bisogno anche della nuova chiave; `npm run i18n` elenca cosa manca.
- **Testi dei prompt migliori:** per uso personale, modifica semplicemente i prompt nell'officina dei prompt; ogni lingua ha la sua versione. Ciò che viene distribuito con Novelmaker si trova in `shared/src/promptlang.ts` (testi di contorno dei blocchi, nomi dei segnaposto, ruoli e compiti predefiniti), `shared/src/builtin.ts` (prompt integrati) e `shared/src/template/` (parole che il motore scrive nei prompt, come la frase sul punto di vista).
- **Aggiungere una lingua** si fa con la stessa tabella, senza programmare:
  1. In **Impostazioni → Generale → Aiuta a tradurre Novelmaker …** inserisci il codice della lingua in *Nuova lingua (codice)* (ad es. `pt` o `pt-BR`) e fai clic su **Avvia**. Ora la tabella ha una colonna vuota per la nuova lingua. Con *Confronta con* puoi tradurre partendo da una lingua che conosci meglio dell'inglese.
  2. Traduci quanto vuoi; il filtro *Mancanti* mostra cosa resta da fare. **Salva** crea il file della lingua (ad es. `shared/src/i18n/locales/pt.json`). La volta successiva la lingua compare in *Traduci in*, quindi puoi continuare più tardi. **Scarica** ti dà il file da inviare.
  3. Per renderla selezionabile nell'app serve un intervento nel codice: va registrata in `Lang`, `LANGS` e `LANGUAGES` in `shared/src/i18n/index.ts` (compreso l'import del file) e vanno scritti i testi dei prompt per quella lingua nei file indicati sopra. TypeScript segnala ogni punto in cui manca ancora la nuova lingua. Fino ad allora la traduzione resta nel suo file e non si perde nulla.

## Limiti noti

- **Importazione da Novelcrafter:** prospettiva narrativa e lingua non fanno parte dell'esportazione e vanno impostate dopo in *Romanzo* (se importi in una serie, vengono riprese dal volume precedente). Le scene senza una linea divisoria tra riassunto e prosa vengono classificate con un'euristica (pochi paragrafi lunghi senza dialoghi = riassunto), che puoi correggere nella finestra di importazione.
- Le **Personas** non sono supportate; `include("Novelcrafter/Personas")` viene eliminato durante l'importazione.
- I conteggi dei token prima dell'invio sono stime (circa 3,5 caratteri per token). Dopo la generazione, il registro mostra i numeri reali del provider.
- Con i **modelli di ragionamento**, alcuni provider contano il ragionamento nei `max_tokens`. In quel caso imposta un `max_tokens` più grande (oppure ad es. `{"reasoning": {"effort": "low"}}`) come parametro per quel modello nella sua raccolta.
