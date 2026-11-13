# Novelmaker

[English](README.md) · **Deutsch** · [Español](README.es.md) · [Українська](README.uk.md) · [Italiano](README.it.md) · [Français](README.fr.md)

Ein lokales Schreibprogramm für Romane, bei dem die KI-Hilfe direkt im Manuskript sitzt. Novelmaker läuft im Browser auf `localhost` und speichert alles in einer einzigen SQLite-Datei auf deinem Rechner. Es arbeitet mit den KI-Modellen, die du auswählst: über OpenRouter oder mit einem Modell auf dem eigenen Rechner (Ollama, LM Studio, KoboldCpp, …).

![Schreibansicht: links die Gliederung, in der Mitte die Szene mit hervorgehobenen Figuren- und Ortsnamen, eine Kodex-Karte zu „Isolde Venn“, rechts angeheftete Notizen und das Szenen-Panel](docs/screenshots/writing.png)

<sub>Alle Screenshots zeigen erfundene Beispieldaten; die Oberfläche ist dort auf Englisch eingestellt.</sub>

## Inhalt

- [Warum es Novelmaker gibt](#warum-es-novelmaker-gibt)
- [Was Novelmaker ist](#was-novelmaker-ist)
- [Rundgang](#rundgang)
- [Sprachen](#sprachen)
- [Loslegen](#loslegen)
- [Wie es funktioniert](#wie-es-funktioniert)
- [Romane importieren](#romane-importieren)
- [Prompt-Referenz](#prompt-referenz)
- [Daten, Sicherungen und mehrere Rechner](#daten-sicherungen-und-mehrere-rechner)
- [Tastenkürzel](#tastenkürzel)
- [Konfiguration](#konfiguration)
- [Entwicklung](#entwicklung)
- [Bekannte Grenzen](#bekannte-grenzen)

## Warum es Novelmaker gibt

Die Idee zu Novelmaker stammt von [Novelcrafter](https://www.novelcrafter.com): ein Schreibprogramm, in dem die KI direkt im Manuskript mitarbeitet. Ich wollte das nur ohne Internetseite und ohne Abo.

Mein größtes Problem war mein Schreibrhythmus. Auf Phasen kreativer Leichtigkeit, in denen ich Novelcrafter viel genutzt habe, folgten Phasen kreativer Nullarbeit, und das Abo lief jedes Mal weiter. Meistens war ich zu faul oder zu vergesslich, es ruhen zu lassen. Mit Novelmaker bezahlst du nur deinen KI-Anbieter, und nur für das, was du tatsächlich generierst. Mit einem lokalen Modell kostet es gar nichts.

Vielen Dank und großes Kino an Novelcrafter! Ich will ihnen überhaupt keine Konkurrenz machen. Novelmaker habe ich für mich gebaut, und wer es gern nutzen möchte, soll das tun.

Novelmaker hat keinen Server im Internet, deine Daten bleiben also auf deinem Rechner (bis auf die Prompts, die du an deinen KI-Anbieter schickst). Das heißt auch:

- **Um Sicherungen kümmerst du dich selbst.** Novelmaker legt zwar automatisch Sicherungskopien an, aber auf deiner eigenen Festplatte. Eine Kopie an einem anderen Ort (zweite Platte, Cloud-Ordner) ist deine Sache.
- **API-Keys bringst du selbst mit.** Du brauchst einen eigenen Schlüssel, z. B. für OpenRouter, oder ein Modell, das auf deinem Rechner läuft.

## Was Novelmaker ist

Novelmaker ist für Menschen, die lange Texte schreiben und KI-Hilfe **im Manuskript** wollen statt in einem getrennten Chatfenster. Du schreibst. Soll die KI eine Passage entwerfen, hinterlässt du im Text eine Anweisung, einen sogenannten *Beat* (zum Beispiel „Mara fragt nach dem fehlenden Logbuch; er lenkt ab“), und klickst auf *Generieren*. Novelmaker baut den Prompt für dich. Er enthält den Text vor dem Cursor, die Zusammenfassungen der früheren Szenen und nur die Kodex-Einträge (Figuren, Orte, Hintergrund), die für diese Szene wichtig sind. Du liest das Ergebnis und entscheidest, was bleibt.

Worauf Novelmaker aufbaut:

- **Lokal und privat.** Eine Person, kein Konto, kein eigener Cloud-Dienst. Dein Text verlässt den Rechner nur als Teil der Prompts, die du an den von dir eingerichteten KI-Anbieter schickst.
- **Freie Modellwahl.** Jede OpenAI-kompatible API funktioniert: OpenRouter (Hunderte Modelle, mit Preisen), Ollama, LM Studio, KoboldCpp oder ein eigener Server.
- **Nachvollziehbar.** Du siehst genau, was an die KI geht (fertiger Prompt, Kodex-Auswahl mit Begründung) und was es kostet, vor dem Klick und danach.
- **Du bleibst Autor.** KI-Text ersetzt nie stillschweigend deinen Text. Du übernimmst ihn, legst ihn als Variante zur Seite, lässt neu generieren oder verwirfst ihn. Vor jeder Übernahme sichert Novelmaker eine Version der Szene.
- **Mehrsprachig.** Oberfläche und mitgelieferte Prompts auf Englisch, Deutsch, Spanisch, Ukrainisch, Italienisch und Französisch. Dein Roman kann in jeder Sprache sein, die dein Modell beherrscht (siehe [Sprachen](#sprachen)).

Nicht vorgesehen: mehrere Benutzer, Anmeldung, Betrieb im Internet, ein Sync-Dienst. API-Keys liegen im Klartext in der lokalen Datenbank, den Server also nicht über `localhost` hinaus erreichbar machen.

## Rundgang

### Bibliothek, Romane und Serien

![Bibliothek mit einer Serie aus zwei Bänden und zwei Einzelromanen, jeweils mit Cover](docs/screenshots/library.png)

Ein Roman kann allein stehen oder ein Band einer Serie sein. Kodex-Einträge gehören entweder zu einem Band oder zur ganzen Serie, so dass Figuren von Buch zu Buch mitgehen. Jeder Roman kann ein Cover haben (hochladen oder Bild hineinziehen). Einen Einzelroman kannst du in eine Serie umwandeln, zu einer bestehenden Serie hinzufügen oder wieder herauslösen.

### Schreiben

Die Hauptansicht (Screenshot oben) besteht aus drei Teilen:

- **Gliederung:** Akte, Kapitel und Szenen, per Drag & Drop umsortierbar. Akte und Szenen sind optional. Ein Buch ohne Akte und mit einem Text pro Kapitel sieht genau so aus.
- **Editor:** eine Szene oder das ganze Manuskript als durchgehender Text. Autosave, Wortzahl, Fokusmodus, Dark Mode. *Teilen* beginnt am Cursor eine neue Szene oder ein neues Kapitel.
- **Seitenspalten:** das Szenen-Panel (Titel, Zusammenfassung, Perspektive, Labels, Versionen, KI-Kontext) und eine Spalte mit **Angeheftetem**: Kodex-Einträge, Snippets oder andere Szenen, die du beim Schreiben im Blick behalten willst.

Kodex-Namen und Aliase sind im Text unterstrichen. Beim Drüberfahren erscheint eine Karte, *Strg+Klick* öffnet den Eintrag direkt über dem Text. Jede Szene kann eine eigene **Perspektive** haben (POV-Figur und Erzählperspektive); standardmäßig gilt die des Romans. **Versteckte Notizen** bleiben für dich im Text stehen, gehören aber nicht zum Manuskript und gehen nie an die KI.

### Beats und Varianten

![Ein Beat mit Anweisung, Prompt- und Modellauswahl, darunter die generierte Passage mit Übernehmen/Zwischenspeichern/Neu generieren/Verwerfen und eine frühere Variante in einem gestrichelten Rahmen](docs/screenshots/beat-variants.png)

Ein **Beat** ist ein Anweisungsblock in der Szene. Du wählst Prompt, Modell und Optionen wie die Länge („Wörter: 400“). Die Antwort erscheint fortlaufend unter dem Beat. Danach:

- **Übernehmen** setzt den Text in die Szene (vorher wird eine Version der Szene gesichert).
- **Zwischenspeichern** legt die Antwort als nummerierte Variante in einem **Rahmen** unter dem Beat ab. So kannst du es noch einmal versuchen und vergleichen. Rahmen lassen sich einklappen, benennen, in normalen Text auflösen oder löschen. Standardmäßig sind sie *für die KI ausgeblendet*: nicht im Prompt, nicht in der Wortzahl, nicht im Export.
- **Neu generieren** oder **Verwerfen**.

### Das „/“-Menü

<img src="docs/screenshots/slash-menu.png" alt="Befehlsmenü nach Eingabe von / in einer leeren Zeile: Beat, Notiz, Rahmen, Weiterschreiben" width="560">

Ein `/` am Anfang einer leeren Zeile fügt einen Beat, eine Notiz oder einen Rahmen ein oder lässt die KI ab dort weiterschreiben. Weitertippen filtert die Liste (`/no` → Notiz).

### Umschreiben, kürzen, erweitern

![Umschreiben-Dialog: links die markierte Passage, rechts die Fassung der KI](docs/screenshots/rewrite.png)

Text markieren und **Umschreiben**, **Kürzen**, **Erweitern** oder **Anweisung …** wählen (eigene Anweisung, z. B. „mehr Spannung, kürzere Sätze“). Vorher und Nachher stehen nebeneinander; übernehmen, zwischenspeichern oder neu generieren. **Weiterschreiben** (Werkzeugleiste oder `/`) entwirft die nächste Passage ab dem Cursor.

### Kosten vor dem Klick

<img src="docs/screenshots/cost-estimate.png" alt="Hover-Karte mit geschätzten Eingabe- und Antwort-Tokens, Gesamtkosten, Höchstkosten bei max_tokens, Preis pro Million Tokens und Füllstand des Kontextfensters" width="560">

Neben jedem *Generieren* steht eine Schätzung (z. B. „≈ 1.50 ¢“). Beim Drüberfahren zeigt eine Karte die Details: Eingabe- und Antwort-Tokens, Kosten, die Obergrenze bei `max_tokens`, den Preis des Modells und den Füllstand des Kontextfensters. Nach der Generierung stehen die echten Werte des Anbieters da und im Protokoll.

### Kodex

![Kodex-Seite mit Einträgen nach Typ und dem Editor für die Figur „Mara Quill“](docs/screenshots/codex.png)

Figuren, Orte, Objekte, Lore, Subplots, Bände und Sonstiges. Jeder Eintrag hat Aliase, eine Beschreibung, die an die KI geht, Notizen nur für dich, eigene Felder, Tags und Beziehungen. Die Erkennung findet auch gebeugte Formen und Genitive („Marias“ → Maria, auch mit Umlauten). Für Namen, die zugleich normale Wörter sind, lässt sich Groß-/Kleinschreibung erzwingen. Die **Einbindung** legt fest, wann ein Eintrag in den Prompt kommt:

- **Bei Erwähnung** (Standard): sobald Name oder Alias in der Nähe des Cursors vorkommt.
- **Immer:** z. B. ein Stilguide oder die Regeln der Welt.
- **Nie:** nur wenn ein Prompt ihn ausdrücklich anfordert, z. B. eine Liste verbotener Wörter.

### Sehen, was die KI sieht

<img src="docs/screenshots/ai-context.png" alt="Spalte mit Angeheftetem neben dem KI-Reiter des Szenen-Panels; dort die Kodex-Einträge, die ein Beat bekäme, jeweils mit Grund (immer, POV, angeheftet, erwähnt) und Tokenzahl" width="560">

Der Reiter **KI** im Szenen-Panel zeigt, welche Kodex-Einträge ein Beat bekäme und warum (immer, POV-Figur, angeheftet, erwähnt), mit Tokenzahl. Was nicht mehr ins Token-Budget passt, ist durchgestrichen. *Ganzen Prompt zeigen* (oder *Vorschau* neben jedem Generieren-Knopf) zeigt den kompletten fertigen Prompt.

### Plan und Zusammenfassungen

![Plan-Ansicht: Kapitel als Karten mit bearbeitbaren Szenen-Zusammenfassungen und den in jeder Szene erwähnten Kodex-Einträgen](docs/screenshots/plan.png)

Der Plan zeigt Kapitel und Szenen als Karten mit bearbeitbaren Zusammenfassungen. Sie bilden die „bisherige Handlung“, die Beat-Prompts mitbekommen. **Zusammenfassungen erzeugen** läuft als Hintergrund-Job mit Kostenschätzung und Fortschritt: Szenen → Kapitel → Band. Eine Band-Zusammenfassung wird zum Kodex-Eintrag auf Serienebene, so „weiß“ der nächste Band, was vorher geschah.

### Chat

![Chat über den Roman mit Kapiteln und Kodex-Einträgen als Kontext](docs/screenshots/chat.png)

Gespeicherte Chats pro Roman, mit selbst gewähltem Kontext: Akte, Kapitel oder Szenen (Volltext oder Zusammenfassung), Kodex-Einträge, Snippets, der ganze Roman oder freier Text. Antworten lassen sich kopieren, als Snippet oder Kodex-Eintrag speichern oder **als Beats in eine Szene übernehmen**. Mitgeliefert sind ein freier Chat und **Ehrliches Review**: schonungsloses Leser-Feedback zu den angehängten Szenen, Kapiteln oder dem ganzen Roman.

### Prompt-Werkstatt

![Prompt-Editor mit Rolle-und-Stil-Text samt Platzhalter-Chips, Kontext-Bausteinen zum Anhaken und einer Live-Vorschau des fertigen Prompts für eine echte Szene](docs/screenshots/prompt-workshop.png)

Prompts entstehen aus **Bausteinen**, ohne Code: ein Text für Rolle und Stil, Kontext-Bausteine zum Anhaken, eine Aufgabe und Optionen, die du beim Ausführen wählst. Platzhalter wie *POV-Figur* oder *Zeitform* erscheinen als Chips. Die Live-Vorschau rendert den Prompt gegen eine echte Szene deines Romans. Mehr unter [Prompt-Referenz](#prompt-referenz).

### Modelle und Anbieter

![Modellsammlung „Fiction“ mit vier Modellen von OpenRouter und Ollama und optionalen Standard-Parametern pro Modell](docs/screenshots/model-collections.png)

OpenRouter (mit deinem API-Key) oder einen lokalen Server hinzufügen, die Modellliste laden und dann die Lieblingsmodelle in **Modellsammlungen** zusammenstellen, damit die Modellauswahl kurz bleibt. Jedes Modell kann Standard-Parameter haben (z. B. `{"temperature": 0.9}`). Sammlungen lassen sich aus Novelcrafter importieren und dorthin exportieren.

### Import und Export

<img src="docs/screenshots/import.png" alt="Import-Dialog für eine Zip-Datei: Titel, Ziel-Serie, gefundene Kapitel und Szenen, zu importierende Kodex-Einträge und Snippets" width="480">

Importieren lassen sich Word, Markdown, Text oder ein Zip mit Manuskript, Kodex-Ordner und Snippets, auch komplette Novelcrafter-Exporte (siehe [Romane importieren](#romane-importieren)). Der Dialog zeigt vorher, was gefunden wurde, und das Buch kann als nächster Band in eine bestehende Serie gehen. Exportieren lässt sich der ganze Roman oder ein einzelner Akt, ein Kapitel oder eine Szene: als Word (.docx) oder Markdown, oder als formatierter Text in die Zwischenablage (Überschriften und Kursiv bleiben beim Einfügen in Word erhalten). Prompts und Modellsammlungen lassen sich mit Novelcrafter austauschen.

### Dark Mode und Fokusmodus

![Manuskript-Ansicht im Dark Mode](docs/screenshots/dark-mode.png)

### Außerdem

- **Suche** über Szenen, Kodex und Snippets.
- **Snippets:** freie Notizen und Recherche, auch als KI-Kontext nutzbar.
- **Versionen:** Stände einer Szene, automatisch vor KI-Änderungen angelegt, wiederherstellbar.
- **Protokoll:** jede Generierung mit fertigen Nachrichten, Antwort, Tokens, Kosten und Dauer.

## Sprachen

Novelmaker unterstützt durchgehend sechs Sprachen: **Englisch (English), Deutsch, Spanisch (Español), Ukrainisch (Українська), Italienisch (Italiano) und Französisch (Français)**.

| Was | Wie es funktioniert |
|---|---|
| **Oberfläche** | **Einstellungen → Allgemein → Sprache.** Beim ersten Start ist Englisch eingestellt. Die Wahl steht in der Datenbank und gilt damit auch an anderen Rechnern. Meldungen des Servers (Fehler, Hintergrund-Jobs) kommen in derselben Sprache. |
| **Mitgelieferte Prompts** | Jeden mitgelieferten Prompt gibt es in allen sechs Sprachen. Jeder Prompt, auch ein eigener, kann eine Fassung pro Sprache haben. Die Prompt-Werkstatt zeigt eine Sprachleiste (EN DE ES UK IT FR); fehlt eine Fassung, wird eine andere verwendet und das Kopieren angeboten. |
| **Sprache des Romans** | Pro Roman eingestellt, unabhängig von der Oberflächensprache. Sie sagt der KI, in welcher Sprache sie schreiben soll; du kannst also in jeder Sprache schreiben, die dein Modell beherrscht. Texte, die Novelmaker selbst in Prompts einfügt (der Satz zur Perspektive, Bezeichnungen wie „Kapitel 3“), folgen bei den sechs Sprachen oben der Romansprache, sonst sind sie Englisch. |
| **Kodex-Erkennung** | Funktioniert mit jedem Alphabet (Akzente, Umlaute, Kyrillisch). Die automatischen Endungen (Genitiv-*s*, *-n*, *-en*, englisch *'s*) sind auf Deutsch und Englisch zugeschnitten. Bei Sprachen mit vielen Fallendungen, etwa Ukrainisch, die gebeugten Formen als Aliase eintragen. |
| **Diese README** | English, Deutsch, Español, Українська, Italiano, Français (Links ganz oben). |

Die Screenshots zeigen in allen Fassungen dieser README die englische Oberfläche. Wer eine Übersetzung verbessern oder eine Sprache ergänzen möchte, findet unter **Einstellungen → Allgemein → Beim Übersetzen von Novelmaker helfen …** eine Tabelle dafür; Details unter [Übersetzungen](#übersetzungen).

## Loslegen

### Voraussetzungen

[Node.js](https://nodejs.org) 22 oder neuer. Sonst nichts: Die Datenbank ist eine Datei, die Oberfläche wird beim ersten Start gebaut.

### Starten

**Windows:** Doppelklick auf `start.bat`. Beim ersten Start werden die Abhängigkeiten installiert und die Oberfläche gebaut (das dauert ein, zwei Minuten), danach öffnet sich der Browser auf <http://localhost:3000>. Bei späteren Starts wird die Oberfläche nur neu gebaut, wenn sich der Quellcode geändert hat.

**macOS, Linux oder von Hand:**

```sh
npm install
npm run build
npm start          # Server + Oberfläche auf http://localhost:3000
```

**Beenden:** in der Kopfzeile **Daten → Novelmaker beenden** wählen, das Konsolenfenster schließen oder dort `Strg+C` drücken. In allen drei Fällen wird vorher eine Sicherung angelegt.

### Erste Schritte

1. **Einstellungen → Allgemein:** Sprache der Oberfläche wählen. Beim ersten Start ist Englisch eingestellt.
2. **Einstellungen → KI-Anbieter:** OpenRouter (API-Key eintragen) und/oder einen lokalen Server hinzufügen, dann *Modelle laden / testen*.
3. **Einstellungen → Modellsammlungen:** die Modelle sammeln, die du nutzen willst, und eine Sammlung als Standard markieren.
4. **Bibliothek → Neuer Roman** oder ein vorhandenes Manuskript **importieren**.
5. **Roman** (in der Leiste des Romans): Sprache, Zeitform, Perspektive und POV-Figur setzen. *Zusätzliche Anweisungen an die KI* gehen in jeden Beat- und Chat-Prompt.
6. Schreiben. Für KI-Hilfe in einer leeren Zeile `/` tippen, *Beat* wählen, beschreiben, was passieren soll, und *Generieren* klicken (oder `Strg+Enter`).
7. Optional: **Daten → Speicherort & Sicherungen** legt die Datenbank in einen Dropbox- oder OneDrive-Ordner, um an mehreren Rechnern zu arbeiten.

## Wie es funktioniert

### Aufbau

```
Browser (http://localhost:3000)
  React · TipTap (Texteditor) · CodeMirror (Prompt-Editor)
        │  REST + Server-Sent Events fürs Streaming
        ▼
Node.js-Server (Fastify)
  ├─ SQLite-Datenbank: eine Datei mit allem
  ├─ Prompt-Engine und Kodex-Erkennung (derselbe Code wie im Browser)
  └─ LLM-Client ──▶ OpenRouter · Ollama · LM Studio · KoboldCpp · jede OpenAI-kompatible API
```

Den Server braucht es aus zwei Gründen: Browser erreichen lokale KI-Server oft nicht direkt (CORS), und eine einzelne Datenbankdatei lässt sich leichter sichern und umziehen als Browser-Speicher. Das Paket `shared/` (Prompt-Engine, Kodex-Erkennung, Typen) läuft im Browser und auf dem Server. Dadurch verhalten sich Live-Vorschau und Namens-Hervorhebung genau wie die echte Generierung.

### Wie ein Roman gespeichert wird

- **Serie → Roman (Band) → Akt → Kapitel → Szene.** Intern gibt es immer alle Ebenen. Die Oberfläche blendet die Akt-Ebene aus, wenn es nur einen Akt gibt, und die Szenen-Ebene, wenn ein Kapitel nur eine Szene hat.
- **Szenentext** wird als strukturiertes Dokument (ProseMirror-JSON) gespeichert, dazu eine Klartext-Kopie. Beats, versteckte Notizen und Rahmen sind Blöcke im selben Dokument, gehören aber nicht zum Manuskript: Sie werden nicht gezählt, nicht exportiert und nicht als Romantext an die KI geschickt.
- **Kodex-Einträge** liegen auf Serienebene (für alle Bände) oder Bandebene. Ein Band-Eintrag mit gleichem Namen ersetzt den Serien-Eintrag.
- Außerdem gespeichert: Prompts (eine Fassung pro Oberflächensprache), Anbieter, Modellsammlungen, Chats, Snippets, Szenen-Versionen und das Protokoll.

### Was beim Klick auf „Generieren“ passiert

1. Der Browser schickt, welcher Prompt und welches Modell gelten, deine Optionen (z. B. *Wörter: 400*, zusätzlicher Kontext) und wo du bist: Szene, Beat, Cursorposition oder Markierung.
2. Der Server sammelt, was die Bausteine des Prompts anfordern, etwa Romandaten, Text vor und nach dem Cursor, das Ende der vorigen Szene, die Zusammenfassungen aller früheren Szenen („bisherige Handlung“) und den Kontext, den du hinzugefügt hast.
3. **Kodex-Auswahl:** Er sucht in Szene und Beat nach Namen und Aliasen, nimmt Einträge mit *Immer*, die POV-Figur und angeheftete Einträge dazu, sortiert nach Priorität (immer > POV > angeheftet > erwähnt > Rest) und hört beim Token-Budget aus den Romaneinstellungen auf.
4. **Rendern:** Die Bausteine des Prompts werden zu Chat-Nachrichten (System / User / Assistant) und von der Template-Engine ausgefüllt.
5. **Streamen:** `max_tokens` ergibt sich aus der Option *Wörter*, sofern die Modellsammlung nichts anderes vorgibt. Die Anfrage geht an den Anbieter, die Antwort kommt Token für Token in den Browser.
6. **Deine Entscheidung:** übernehmen, zwischenspeichern, neu generieren oder verwerfen. Jeder Aufruf landet im Protokoll mit fertigen Nachrichten, Antwort, Tokens, Kosten und Dauer.

Die **Kostenschätzung** durchläuft die Schritte 1–4, ohne das Modell aufzurufen. Eingabe-Tokens werden mit etwa 3,5 Zeichen pro Token geschätzt. Die Antwortlänge kommt aus *Wörter*, *Länge* (Zusammenfassungen) oder dem markierten Text (Umschreiben). Preise stammen aus der Modellliste des Anbieters: OpenRouter liefert sie mit, lokale Server gelten als kostenlos.

### Prompts: Bausteine statt Code

Ein Novelmaker-Prompt besteht aus vier Teilen (Rolle & Stil, Kontext-Bausteine, Aufgabe, Optionen) und braucht keine Programmierung. Beim Speichern übersetzt Novelmaker ihn in Nachrichten für seine Template-Engine. Dieselbe Engine führt Prompts aus, die aus Novelcrafter importiert wurden und eine kleine Skriptsprache nutzen. Details in der [Prompt-Referenz](#prompt-referenz).

## Romane importieren

**Bibliothek → Importieren** nimmt Word (`.docx`), Markdown (`.md`), Text (`.txt`) oder ein Zip. Vor dem Import zeigt ein Dialog, was gefunden wurde. Dort lässt sich auch eine bestehende Serie wählen; der Roman wird dann ihr nächster Band.

- **Standard: alles ist Prosa.** Überschriften gliedern in Kapitel (zwei Ebenen: Akt + Kapitel, drei: Akt / Kapitel / Szene). `* * *` oder eine waagerechte Linie beginnt eine neue Szene. In Word zählen auch eigene Formatvorlagen als Überschrift, wenn sie eine Gliederungsebene haben (Absatz → Gliederungsebene). In Textdateien und in Word-Dokumenten ganz ohne Überschriften (z. B. Kapiteltitel nur groß und fett gesetzt) werden allein stehende Zeilen wie „Kapitel 2: Titel“, „Prolog“, „Epilog“ zu Kapiteln und „Teil 1“ zu Akten. Das klappt in allen Sprachen der App, also auch mit „Chapter 3“, „Chapitre 3“, „Capítulo 3“, „Capitolo 3“ oder „Розділ 3“.
- **Zip-Aufbau:**

  ```
  Roman.zip
    Manuskript.docx   (oder .md/.txt; mehrere Dateien = je ein Kapitel, nach Nummer sortiert)
    Kontext/          je Datei ein Kodex-Eintrag; Unterordner Figuren/, Orte/, Objekte/, Lore/, Subplots/ setzen den Typ
    Snippets/         je Datei ein Snippet (auch „Notizen/“)
  ```

  Englische Ordnernamen (`Context/`, `Characters/`, `Locations/`, …) funktionieren ebenso.
- Markdown-Dateien in `Kontext/` dürfen mit einem Kopf beginnen, z. B. `aliases: Anni, Frau Berg`, `type: Figur`, `immer: true` (bzw. `nie: true`). Weitere Zeilen wie `Alter: 31` werden eigene Felder.
- **Novelcrafter-Export:** Ein kompletter Novelcrafter-Zip wird erkannt und das Häkchen *Novelcrafter-Export* automatisch gesetzt. Zusammenfassung und Prosa jeder Szene werden an der Trennlinie getrennt, Kodex, Snippets und Chats aus den Novelcrafter-Ordnern übernommen. Szenen ohne Linie werden automatisch eingeordnet; das lässt sich im Dialog überstimmen.
- Von Novelmaker exportierte Word-Dateien lassen sich mit derselben Gliederung wieder importieren.

## Prompt-Referenz

### Baustein-Prompts

| Teil | Inhalt |
|---|---|
| **Rolle & Stil** | Freier Text: wer die KI ist und wie sie schreiben soll („Du bist eine ehrliche Lektorin …“, ein ganzer Stilguide, Verbote). |
| **Kontext-Bausteine** | Zum Anhaken: zusätzliche Anweisungen des Romans, verbotene Wörter (Aliase eines Kodex-Eintrags), Romaninfo, Kodex, bisherige Handlung, Zusammenfassung der Szene, beim Ausführen wählbarer Kontext, Ende der vorigen Szene (*n* Wörter, wahlweise nur bei gleicher POV-Figur), Text vor dem Cursor (*n* Wörter, wahlweise als Stilvorlage), Text nach dem Cursor, markierter Text, bei Zusammenfassungen der zusammenzufassende Text. Angeboten wird, was zum Prompt-Typ passt. |
| **Aufgabe** | Freier Text: was die KI tun soll (im Chat: Regeln für die Antworten). |
| **Optionen** | Felder, die beim Ausführen gewählt werden, z. B. *Wörter: 200 / 400 / 600*. *Wörter* begrenzt auch die Antwortlänge, *Länge* tut das bei Zusammenfassungen. |

**Platzhalter** erscheinen als Chips. Einfügen über *Platzhalter* oder durch Tippen von `{{`: *Beat*, *Anweisung*, *Perspektive*, *POV-Figur*, *Romansprache*, *Zeitform*, *Romantitel*, *Autor*, *Serie*, *Band*, *Kapitel*, *Szene* sowie jede Option (z. B. `{{Wörter}}`). Gespeichert wird schlicht `{{Name}}`.

**Neu** legt einen Prompt mit *allen* Bausteinen seines Typs an, sinnvoll vorbelegt; abhaken, was du nicht brauchst. Die Reihenfolge legst du nicht selbst fest. Rolle und Anweisungen werden zur Systemnachricht, danach folgen der Kontext, der Text vor dem Cursor als Stilvorlage (das Modell hält ihn für seine eigene frühere Antwort) und zuletzt die Aufgabe. Im Chat steht alles in der Systemnachricht. Die Live-Vorschau zeigt genau, was gesendet wird.

Prompt-Typen: *Beat → Prosa*, *Weiterschreiben*, *Text bearbeiten* (Umschreiben, Kürzen, Erweitern, eigene Anweisung), *Zusammenfassung* (Szene, Kapitel, Band), *Chat* und *Komponente* (wiederverwendbare Teile für Skript-Prompts).

### Skript-Prompts (importiert)

Aus Novelcrafter importierte Prompts bleiben Skript-Prompts und laufen unverändert. **In Bausteine umwandeln** legt eine Baustein-Kopie an, wenn der Prompt nur die üblichen Muster nutzt; sonst nennt Novelmaker die Stellen, für die es keinen Baustein gibt. Die Komponenten `Novelmaker/Codex`, `…/AdditionalContext`, `…/AdditionalInstructions`, `…/Chat/DefaultContext` und `…/Chat/DefaultInstructions` sind dafür mitgeliefert; Verweise auf `Novelcrafter/…` werden beim Import darauf umgeschrieben.

```
{novel.title}   {wordsBefore(1500)}   {pov.character(scene.previous)}
{#if bedingung} … {#elseif bedingung} … {#else} … {#endif}
{! Kommentar !}
"Text" oder 'Text', Zahlen, + (Verkettung), is, is not, in, and, or, not
```

Ausdrücke dürfen über mehrere Zeilen gehen. In `#if` ist ein Wert wahr, wenn er nicht leer ist. Funktions- und Eingabenamen ignorieren Groß-/Kleinschreibung. Unbekannte Funktionen erzeugen eine Warnung statt eines Fehlers. Zeilen, die nur aus `{#if}`/`{#endif}`/Kommentaren bestehen, verschwinden samt Zeilenumbruch. Leere Nachrichten werden weggelassen, aufeinanderfolgende Nachrichten derselben Rolle zusammengeführt.

<details>
<summary>Funktionsliste</summary>

| Gruppe | Funktionen |
|---|---|
| Roman | `novel.title`, `novel.author`, `novel.description`, `novel.summary`, `novel.language`, `novel.tense`, `novel.instructions`, `novel.hasSeries`, `novel.volume`, `novel.outline`, `novel.chapterSummaries`, `novel.fullText`, `novel.wordCount` |
| Serie | `series.title`, `series.description`, `series.volumes` |
| Perspektive | `pov`, `pov.character(scene?)`, `pov.name(scene?)`, `pov.type(scene?)` |
| Szene | `scene`, `scene.title(scene?)`, `scene.summary(scene?)`, `scene.fullText(scene?)`, `scene.previous(scene?)`, `scene.next(scene?)`, `scene.number(scene?)`, `scene.labels(scene?)`, `scene.wordCount(scene?)`, `scene.chapter(scene?)`, `storySoFar`, `previousScenes(n)` |
| Kapitel | `chapter`, `chapter.title(chapter?)`, `chapter.summary(chapter?)`, `chapter.fullText(chapter?)`, `chapter.number(chapter?)`, `chapter.scenes(chapter?)`, `chapter.sceneSummaries(chapter?)`, `chapter.previous(chapter?)`, `chapter.next(chapter?)` |
| Akt | `act`, `act.title(act?)`, `act.summary(act?)`, `act.fullText(act?)`, `act.number(act?)`, `act.chapters(act?)` |
| Text | `message`, `textBefore`, `textAfter`, `wordsBefore(n)`, `wordsAfter(n)`, `isStartOfText`, `selection`, `lastWords(text, n)`, `firstWords(text, n)`, `wordCount(text)`, `upper`, `lower`, `trim` |
| Kodex | `codex.context`, `codex.global`, `codex.mentioned`, `codex.get(name, …)`, `codex.aliases(name)`, `codex.name/description/type(entry)`, `codex.field(entry, key)`, `codex.characters`, `codex.locations`, `codex.objects`, `codex.lore`, `codex.subplots`, `codex.volumes`, `codex.all`, `codex.byTag(tag)` |
| Snippets | `snippet.get(title)`, `snippet.text(snippet)` |
| Komposition | `include("Komponente")`, `input("Name")`, `local("name", wert?)` |
| Listen & Format | `without(liste, liste2)`, `join(liste, trenner?)`, `count`, `first`, `last`, `list(…)`, `asXml`, `asMarkdown`, `asText` |
| Logik | `and(…)`, `or(…)`, `not(a)`, `isEmpty(a)`, `isNotEmpty(a)`, `is(a, b)`, `contains(liste\|text, wert)`, `if(b, dann, sonst?)`, `default(wert, ersatz)` |

Eigenschaften lassen sich verketten, z. B. `{scene.previous.summary}` oder `{pov.character.name}`. Kodex-Einträge, Szenen usw. werden standardmäßig als XML gerendert (`<character name="…" aliases="…">…</character>`); in den Romaneinstellungen auch als Markdown oder Klartext.

</details>

## Daten, Sicherungen und mehrere Rechner

- **Datenbank:** standardmäßig `data/novelmaker.db`, eine Datei mit allem (auch den API-Keys im Klartext).
- **Speicherort** (Daten → Speicherort & Sicherungen): z. B. ein Dropbox- oder OneDrive-Ordner, um an mehreren Rechnern zu arbeiten. Novelmaker verschiebt die Datei dorthin oder nutzt eine dort schon vorhandene (z. B. auf dem zweiten Rechner). Ein Neustart ist nicht nötig. Die Wahl steht pro Rechner in `data/config.json`.
- **Mehrere Rechner:** immer nur an einem gleichzeitig arbeiten und vor dem Wechsel Novelmaker beenden. Eine Sperrdatei (`novelmaker.db.lock`) neben der Datenbank sorgt für eine Warnung, wenn sie noch woanders offen ist; Konfliktkopien von Dropbox/OneDrive werden ebenfalls gemeldet. Die Datenbank läuft ohne WAL-Datei, damit nach jedem Speichern der komplette Stand in der einen Datei steht.
- **Sicherungen** (Ordner frei wählbar, Standard `data/backups/`, die letzten N bleiben): beim Start, wenn sich die Datei seit der letzten Sicherung geändert hat; beim Beenden; vor dem Löschen eines Romans oder einer Serie; per Klick (Daten → Jetzt sichern). In den Romaneinstellungen gibt es zusätzlich eine Gesamtsicherung als JSON.
- **Autosave:** Texte werden 0,8 s nach der letzten Eingabe gespeichert, beim Durchschreiben spätestens alle 3 s.
- **Wiederherstellen:** Novelmaker beenden, eine Sicherung in den Datenbank-Ordner kopieren und in `novelmaker.db` umbenennen.

## Tastenkürzel

| Tasten | Aktion |
|---|---|
| `/` am Anfang einer leeren Zeile | Befehlsmenü (Beat, Notiz, Rahmen, Weiterschreiben) |
| `Strg+Umschalt+B` | Beat einfügen |
| `Strg+Alt+N` | Versteckte Notiz einfügen |
| `Strg+Enter` im Beat | Generieren |
| `Strg+Klick` auf einen hervorgehobenen Namen | Kodex-Eintrag öffnen |
| `Strg+S` | Speichern (Romaneinstellungen, Prompt-Editor) |
| `Strg+Z` / `Strg+Y` | Rückgängig / Wiederholen (holt auch einen gelöschten Rahmen zurück) |
| `Esc` | Dialoge und Menüs schließen, Fokusmodus beenden |

Auf macOS `Cmd` statt `Strg`.

## Konfiguration

| Umgebungsvariable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3000` | Port von Server und Oberfläche |
| `HOST` | `localhost` | Adresse, auf der der Server lauscht |
| `NOVELMAKER_DATA` | `data/` im Programmordner | Ordner für `config.json`, die Datenbank (sofern nicht verschoben) und Sicherungen |
| `NOVELMAKER_OPEN` | nicht gesetzt | `1` öffnet nach dem Start den Browser (setzt `start.bat`) |

## Entwicklung

```sh
npm run dev        # Hot-Reload: Oberfläche auf http://localhost:5173, API auf Port 3000
npm test           # vitest (shared + server)
npm run typecheck  # TypeScript für alle drei Pakete
npm run i18n       # prüft die Übersetzungsdateien
```

```
start.bat             startet Server + Browser (installiert/baut bei Bedarf)
shared/               Prompt-Engine, Kodex-Erkennung, Baustein-Prompts, Novelcrafter-Codec, i18n, Typen (Browser + Server)
server/               Fastify, SQLite (better-sqlite3), LLM-Client (OpenAI-kompatibel, Streaming), Jobs, Import/Export
web/                  React, TipTap, CodeMirror, Tailwind
scripts/              Build-Prüfung für start.bat, Übersetzungs-Prüfer
docs/screenshots/     Bilder für diese README
```

### Übersetzungen

Oberflächentexte stehen im Code auf Englisch und dienen als Schlüssel (`t('Save')`). Jede andere Sprache hat eine JSON-Datei, die den englischen Text auf die Übersetzung abbildet: `shared/src/i18n/locales/{de,es,uk,it,fr}.json`.

- **In der App:** **Einstellungen → Allgemein → Beim Übersetzen von Novelmaker helfen …** öffnet eine Tabelle mit dem englischen Text, einer anderen Sprache zum Vergleich und deiner Übersetzung. Sie filtert fehlende Texte und kaputte Platzhalter, speichert direkt in die Sprachdatei und kann eine Sprachdatei herunterladen oder einlesen. Sie ist für Leute gedacht, die beim Übersetzen helfen; im normalen Gebrauch braucht man sie nicht.
- **Von Hand** (ohne Programmierkenntnisse): den Wert in der JSON-Datei ändern. Platzhalter wie `{n}` oder `{name}` und Tags wie `<b>…</b>` bleiben, wie sie sind. Mehrzahlformen lassen sich als `{ "one": "…", "few": "…", "many": "…", "other": "…" }` schreiben (die Regeln kommen aus `Intl.PluralRules`). `npm run i18n` meldet fehlende Schlüssel und kaputte Platzhalter.
- In der Tabelle gespeicherte Änderungen gelten sofort. Änderungen direkt in den Dateien wirken beim nächsten Start: `start.bat` baut die Oberfläche dann automatisch neu, sonst `npm run build`.
- **Bessere englische Texte** werden im Code geändert. Damit ändert sich auch der Schlüssel, die anderen Sprachen brauchen also den neuen Schlüssel; `npm run i18n` zeigt, was fehlt.
- **Bessere Prompt-Texte:** für den eigenen Gebrauch einfach die Prompts in der Prompt-Werkstatt bearbeiten; jede Sprache hat ihre eigene Fassung. Was mit Novelmaker ausgeliefert wird, steht in `shared/src/promptlang.ts` (Rahmentexte der Bausteine, Platzhalternamen, Standard-Rollen und -Aufgaben), `shared/src/builtin.ts` (mitgelieferte Prompts) und `shared/src/template/` (Wörter, die die Engine in Prompts schreibt, etwa der Satz zur Perspektive).
- **Eine Sprache ergänzen** geht über dieselbe Tabelle, ohne Programmierkenntnisse:
  1. Unter **Einstellungen → Allgemein → Beim Übersetzen von Novelmaker helfen …** bei *Neue Sprache (Code)* den Sprachcode eingeben (z. B. `pt` oder `pt-BR`) und **Starten** klicken. Die Tabelle hat jetzt eine leere Spalte für die neue Sprache. Mit *Vergleichen mit* lässt sich aus einer Sprache übersetzen, die man besser kann als Englisch.
  2. So viel übersetzen, wie man mag; der Filter *Fehlend* zeigt, was noch offen ist. **Speichern** legt die Sprachdatei an (z. B. `shared/src/i18n/locales/pt.json`). Beim nächsten Mal steht die Sprache unter *Übersetzen in* zur Auswahl, man kann also später weitermachen. **Herunterladen** liefert die Datei zum Weitergeben.
  3. Damit die Sprache in der App auswählbar wird, trägt jemand, der programmiert, sie ein: `Lang`, `LANGS` und `LANGUAGES` in `shared/src/i18n/index.ts` (samt Import der Datei) und die Prompt-Texte pro Sprache in den Dateien oben. TypeScript zeigt jede Stelle an, an der die neue Sprache noch fehlt. Bis dahin bleibt die Übersetzung in ihrer Datei erhalten, es geht nichts verloren.

## Bekannte Grenzen

- **Novelcrafter-Import:** Erzählperspektive und Sprache stehen nicht im Export und müssen danach unter *Roman* gesetzt werden (bei Import in eine Serie werden sie vom vorigen Band übernommen). Szenen ohne Trennlinie zwischen Zusammenfassung und Prosa werden per Heuristik eingeordnet (wenige lange Absätze ohne wörtliche Rede = Zusammenfassung); im Import-Dialog lässt sich das überstimmen.
- **Personas** gibt es nicht; `include("Novelcrafter/Personas")` wird beim Import weggelassen.
- Token-Zahlen vor dem Senden sind Schätzungen (etwa 3,5 Zeichen pro Token). Nach der Generierung zeigt das Protokoll die echten Werte des Anbieters.
- Bei **Reasoning-Modellen** zählt das Nachdenken bei manchen Anbietern zu `max_tokens`. Dann in der Modellsammlung für dieses Modell ein größeres `max_tokens` (oder z. B. `{"reasoning": {"effort": "low"}}`) als Parameter setzen.
