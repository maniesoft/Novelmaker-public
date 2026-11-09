# Novelmaker

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Українська](README.uk.md) · [Italiano](README.it.md) · **Français**

Une application locale pour écrire des romans, avec l’aide de l’IA intégrée au manuscrit. Novelmaker s’utilise dans votre navigateur sur `localhost` et conserve tout dans un seul fichier SQLite sur votre ordinateur. Il fonctionne avec les modèles d’IA de votre choix : via OpenRouter, ou avec un modèle qui tourne sur votre propre machine (Ollama, LM Studio, KoboldCpp…).

![Vue d’écriture : la structure à gauche, la scène au milieu avec les noms de personnages et de lieux mis en évidence, une fiche du codex pour « Isolde Venn », les notes épinglées et le panneau de scène à droite](docs/screenshots/writing.png)

<sub>Toutes les captures d’écran montrent des données de démonstration inventées.</sub>

## Sommaire

- [Pourquoi Novelmaker existe](#pourquoi-novelmaker-existe)
- [Ce qu’est Novelmaker](#ce-quest-novelmaker)
- [Tour d’horizon des fonctionnalités](#tour-dhorizon-des-fonctionnalités)
- [Langues](#langues)
- [Prise en main](#prise-en-main)
- [Fonctionnement](#fonctionnement)
- [Importer des romans](#importer-des-romans)
- [Référence des prompts](#référence-des-prompts)
- [Données, sauvegardes et plusieurs ordinateurs](#données-sauvegardes-et-plusieurs-ordinateurs)
- [Raccourcis clavier](#raccourcis-clavier)
- [Configuration](#configuration)
- [Développement](#développement)
- [Limites connues](#limites-connues)

## Pourquoi Novelmaker existe

L’idée de Novelmaker vient de [Novelcrafter](https://www.novelcrafter.com) : une application d’écriture dans laquelle l’IA travaille directement dans le manuscrit. Je voulais simplement la même chose, sans site web et sans abonnement.

Mon plus gros problème, c’était le rythme de mon écriture. Aux périodes où l’écriture venait facilement, pendant lesquelles j’utilisais beaucoup Novelcrafter, succédaient des périodes où je n’écrivais rien du tout, et l’abonnement continuait de courir. La plupart du temps, j’avais la flemme ou j’oubliais de le suspendre. Avec Novelmaker, vous ne payez que votre fournisseur d’IA, et seulement pour ce que vous générez réellement. Avec un modèle local, vous ne payez rien du tout.

Un grand merci et un immense bravo à Novelcrafter. Novelmaker ne cherche en aucun cas à lui faire concurrence. Je l’ai construit pour moi, et toute personne qui aimerait l’utiliser est la bienvenue.

Novelmaker n’a pas de serveur sur Internet : vos données restent donc sur votre ordinateur (à l’exception des prompts que vous envoyez à votre fournisseur d’IA). Cela signifie aussi :

- **Les sauvegardes sont votre affaire.** Novelmaker fait automatiquement des copies de sauvegarde, mais sur votre propre disque. En garder une copie ailleurs (un autre disque, un dossier dans le cloud) relève de votre responsabilité.
- **Apportez vos propres clés.** Il vous faut une clé API à vous, p. ex. pour OpenRouter, ou un modèle qui tourne sur votre propre machine.

## Ce qu’est Novelmaker

Novelmaker s’adresse aux personnes qui écrivent des œuvres de fiction longues et qui veulent l’aide de l’IA **dans le manuscrit** plutôt que dans une fenêtre de chat séparée. Vous écrivez. Quand vous voulez que l’IA rédige un passage, vous laissez une instruction dans le texte, appelée *beat* (par exemple « Mara pose une question sur le livre de comptes disparu ; il change de sujet »), et vous cliquez sur *Générer*. Novelmaker construit le prompt pour vous. Il y met le texte qui précède le curseur, les résumés des scènes précédentes et uniquement les entrées du codex (personnages, lieux, univers) qui comptent pour cette scène. Vous lisez le résultat et décidez de ce que vous gardez.

Les principes de Novelmaker :

- **Local et privé.** Un seul utilisateur, pas de compte, pas de service cloud propre. Votre texte ne quitte votre ordinateur que dans les prompts que vous envoyez au fournisseur d’IA que vous avez configuré.
- **Le modèle de votre choix.** Toute API compatible OpenAI fonctionne : OpenRouter (des centaines de modèles, avec leurs prix), Ollama, LM Studio, KoboldCpp ou votre propre serveur.
- **Transparent.** Vous voyez exactement ce qui part vers l’IA (le prompt final, la sélection du codex avec ses raisons) et ce que cela coûte, avant de cliquer et après.
- **Le dernier mot vous revient.** Les réponses de l’IA ne remplacent jamais votre texte en silence. Vous les acceptez, les mettez de côté comme variante, les régénérez ou les jetez. Avant chaque modification acceptée, Novelmaker enregistre une version de la scène.
- **Multilingue.** Interface et prompts intégrés en anglais, allemand, espagnol, ukrainien, italien et français. Votre roman peut être écrit dans n’importe quelle langue que votre modèle connaît (voir [Langues](#langues)).

Hors du périmètre : plusieurs utilisateurs, authentification, hébergement sur Internet, service de synchronisation. Les clés API sont stockées en clair dans la base de données locale : n’exposez donc pas le serveur au-delà de `localhost`.

## Tour d’horizon des fonctionnalités

### Bibliothèque, romans et séries

![Bibliothèque avec une série en deux tomes et deux romans indépendants, chacun avec sa couverture](docs/screenshots/library.png)

Un roman peut être indépendant ou constituer un tome d’une série. Les entrées du codex peuvent appartenir à un seul tome ou à toute la série : les personnages passent ainsi d’un livre à l’autre. Chaque roman peut avoir une couverture (importez une image ou faites-la glisser). Vous pouvez transformer un roman indépendant en série, l’ajouter à une série existante ou l’en retirer.

### Écriture

La vue principale (capture d’écran en haut) comporte trois parties :

- **Structure :** actes, chapitres et scènes, que l’on réorganise par glisser-déposer. Les actes et les scènes sont facultatifs. Un livre sans actes et avec un seul texte par chapitre apparaît exactement ainsi.
- **Éditeur :** une scène à la fois, ou tout le manuscrit en texte continu. Enregistrement automatique, nombre de mots, mode concentration, mode sombre. *Diviser* commence une nouvelle scène ou un nouveau chapitre à la position du curseur.
- **Colonnes latérales :** le panneau de scène (titre, résumé, point de vue, étiquettes, versions, contexte IA) et une colonne d’éléments **épinglés** : entrées du codex, extraits ou autres scènes que vous voulez garder sous les yeux pendant que vous écrivez.

Les noms et alias du codex sont soulignés dans le texte. Au survol, une fiche s’affiche, et *Ctrl+clic* ouvre l’entrée juste au-dessus du texte. Chaque scène peut avoir son propre **point de vue** (personnage POV et perspective narrative) ; par défaut, elle suit celui du roman. Les **notes masquées** restent dans le texte pour vous, mais ne font pas partie du manuscrit et ne sont jamais envoyées à l’IA.

### Beats et variantes

![Un beat avec son instruction, le choix du prompt et du modèle, le passage généré avec Accepter/Mettre de côté/Régénérer/Rejeter, et en dessous une variante précédente mise de côté dans un cadre en pointillés](docs/screenshots/beat-variants.png)

Un **beat** est un bloc d’instruction à l’intérieur de la scène. Vous choisissez le prompt, le modèle et des options comme la longueur (« Mots : 400 »). La réponse s’affiche au fur et à mesure sous le beat. Ensuite :

- **Accepter** insère le texte dans la scène (une version de la scène est d’abord enregistrée).
- **Mettre de côté** conserve la réponse comme variante numérotée dans un **cadre** sous le beat, pour que vous puissiez réessayer et comparer. Les cadres peuvent être repliés, recevoir un titre, être dissous en texte normal ou supprimés. Par défaut, ils sont *masqués pour l’IA* : ni envoyés dans les prompts, ni comptés, ni exportés.
- **Régénérer** ou **Rejeter**.

### Le menu « / »

<img src="docs/screenshots/slash-menu.png" alt="Menu de commandes après avoir tapé / dans une ligne vide : Beat, Note, Cadre, Continuer à écrire" width="560">

Tapez `/` au début d’une ligne vide pour insérer un beat, une note ou un cadre, ou pour que l’IA continue à écrire à partir de là. La saisie filtre la liste (`/no` → Note).

### Réécrire, raccourcir, développer

![Fenêtre Réécrire avec le passage sélectionné à gauche et la version de l’IA à droite](docs/screenshots/rewrite.png)

Sélectionnez du texte et choisissez **Réécrire**, **Raccourcir**, **Développer** ou **Instruction…** (votre propre instruction, p. ex. « plus de tension, des phrases plus courtes »). Vous voyez l’avant et l’après côte à côte et pouvez accepter, mettre de côté ou régénérer. **Continuer à écrire** (barre d’outils ou `/`) rédige le passage suivant à partir du curseur.

### Connaître le coût avant de cliquer

<img src="docs/screenshots/cost-estimate.png" alt="Fiche au survol avec les tokens estimés en entrée et en réponse, le coût total, le coût maximal si max_tokens est atteint, le prix par million de tokens et le remplissage de la fenêtre de contexte" width="560">

Chaque bouton *Générer* affiche une estimation (p. ex. « ≈ 1.50 ¢ »). Au survol, vous voyez le détail : tokens d’entrée et de réponse, coût, le maximum si `max_tokens` est atteint, le prix du modèle et le taux de remplissage de la fenêtre de contexte. Après l’appel, les chiffres réels du fournisseur s’affichent et sont conservés dans le journal.

### Codex

![Page du codex avec les entrées regroupées par type et l’éditeur du personnage « Mara Quill »](docs/screenshots/codex.png)

Personnages, lieux, objets, univers, intrigues secondaires, tomes et tout le reste. Chaque entrée a des alias, une description qui est envoyée à l’IA, des notes privées qui ne le sont pas, des champs personnalisés, des tags et des relations. La reconnaissance gère les formes fléchies et les possessifs (« Mara’s » → Mara), et vous pouvez rendre une entrée sensible à la casse pour les noms qui sont aussi des mots courants. L’**inclusion** détermine quand une entrée entre dans un prompt :

- **En cas de mention** (par défaut) : l’entrée est incluse dès que son nom ou un alias apparaît près du curseur.
- **Toujours :** p. ex. un guide de style ou les règles du monde.
- **Jamais :** seulement quand un prompt la demande explicitement, p. ex. une liste de mots interdits.

### Voir ce que voit l’IA

<img src="docs/screenshots/ai-context.png" alt="Colonne des éléments épinglés à côté de l’onglet IA du panneau de scène, qui liste les entrées du codex qu’un beat inclurait, chacune avec sa raison (toujours, POV, épinglée, mentionnée) et son nombre de tokens" width="560">

L’onglet **IA** du panneau de scène liste les entrées du codex qu’un beat inclurait et pourquoi (toujours, personnage POV, épinglée, mentionnée), avec leur nombre de tokens. Les entrées qui ne tiennent pas dans le budget de tokens sont barrées. *Afficher le prompt complet* (ou *Aperçu* à côté de n’importe quel bouton Générer) montre le prompt final en entier.

### Plan et résumés

![Vue Plan : les chapitres sous forme de cartes avec des résumés de scènes modifiables et les entrées du codex mentionnées dans chaque scène](docs/screenshots/plan.png)

Le plan présente les chapitres et les scènes sous forme de cartes avec des résumés modifiables. Les résumés alimentent « l’histoire jusqu’ici » que reçoivent les prompts de beat. **Générer les résumés** s’exécute comme tâche en arrière-plan, avec une estimation du coût et un suivi de la progression : scènes → chapitres → tome. Le résumé d’un tome devient une entrée du codex au niveau de la série : le livre suivant « sait » ainsi ce qui s’est passé avant.

### Chat

![Chat sur le roman avec des chapitres et des entrées du codex joints comme contexte](docs/screenshots/chat.png)

Des chats enregistrés pour chaque roman, avec un contexte que vous choisissez vous-même : actes, chapitres ou scènes (texte complet ou résumé), entrées du codex, extraits, le roman entier ou du texte libre. Les réponses peuvent être copiées, enregistrées comme extrait ou comme entrée du codex, ou **transformées en beats dans une scène**. Sont intégrés un chat libre et **Critique honnête**, qui donne un retour de lecture sans détour sur les scènes, les chapitres ou le roman que vous joignez.

### Atelier de prompts

![Éditeur de prompts avec un texte de rôle et de style contenant des pastilles de variables, des blocs de contexte à cocher et un aperçu en direct du prompt final pour une vraie scène](docs/screenshots/prompt-workshop.png)

Les prompts se construisent à partir de **blocs**, sans code : un texte de rôle et de style, des blocs de contexte que vous cochez, une tâche et des options que vous choisissez au moment de l’exécution. Les variables comme *Personnage POV* ou *Temps du récit* apparaissent sous forme de pastilles. L’aperçu en direct affiche le prompt appliqué à une vraie scène de votre roman. Voir [Référence des prompts](#référence-des-prompts).

### Modèles et fournisseurs

![Collection de modèles « Fiction » avec quatre modèles d’OpenRouter et d’Ollama et des paramètres par défaut facultatifs pour chaque modèle](docs/screenshots/model-collections.png)

Ajoutez OpenRouter (avec votre clé API) ou un serveur local, chargez sa liste de modèles, puis rassemblez vos modèles préférés dans des **collections de modèles** pour que le sélecteur de modèle reste court. Chaque modèle peut avoir des paramètres par défaut (p. ex. `{"temperature": 0.9}`). Les collections peuvent être importées depuis Novelcrafter et exportées vers Novelcrafter.

### Import et export

<img src="docs/screenshots/import.png" alt="Fenêtre d’import pour un fichier zip : titre, série cible, nombre de chapitres et de scènes trouvés, entrées du codex et extraits à importer" width="480">

Importez des fichiers Word, Markdown ou texte brut, ou un zip contenant le manuscrit, un dossier de codex et des extraits, y compris des exports complets de Novelcrafter (voir [Importer des romans](#importer-des-romans)). Avant tout import, la fenêtre montre ce qui a été trouvé, et le livre peut rejoindre une série existante comme tome suivant. Exportez le roman entier, ou seulement un acte, un chapitre ou une scène, en Word (.docx) ou en Markdown, ou copiez-le en texte formaté (les titres et l’italique sont conservés quand vous collez dans Word). Les prompts et les collections de modèles peuvent être échangés avec Novelcrafter.

### Mode sombre et mode concentration

![Vue du manuscrit en mode sombre](docs/screenshots/dark-mode.png)

### Et aussi

- **Recherche** dans les scènes, le codex et les extraits.
- **Extraits :** notes libres et documentation, utilisables comme contexte pour l’IA.
- **Versions :** instantanés des scènes, créés automatiquement avant les modifications de l’IA, et restaurables.
- **Journal :** chaque génération avec les messages finaux, la réponse, les tokens, le coût et la durée.

## Langues

Novelmaker prend entièrement en charge six langues : **anglais (English), allemand (Deutsch), espagnol (Español), ukrainien (Українська), italien (Italiano) et français**.

| Quoi | Fonctionnement |
|---|---|
| **Interface** | **Paramètres → Général → Langue.** L’anglais est utilisé au premier démarrage. Le choix est enregistré dans la base de données : il vous suit donc sur d’autres ordinateurs. Les messages du serveur (erreurs, tâches en arrière-plan) utilisent la même langue. |
| **Prompts intégrés** | Chaque prompt intégré existe dans les six langues. Chaque prompt, y compris les vôtres, peut avoir une version par langue. L’atelier de prompts affiche une barre de langues (EN DE ES UK IT FR) ; s’il manque une version, il se rabat sur une autre et propose de la copier. |
| **Langue du roman** | Se règle pour chaque roman, indépendamment de la langue de l’interface. Elle indique à l’IA dans quelle langue écrire : vous pouvez donc écrire dans n’importe quelle langue que votre modèle connaît. Les textes que Novelmaker ajoute lui-même aux prompts (la phrase sur le point de vue, des libellés comme « Chapitre 3 ») suivent la langue du roman pour les six langues ci-dessus, et sont en anglais sinon. |
| **Reconnaissance du codex** | Fonctionne avec tous les alphabets (accents, umlauts, cyrillique). Les terminaisons automatiques (possessif *’s*, allemand *-s/-n/-en*) sont réglées pour l’anglais et l’allemand. Pour les langues à nombreuses désinences casuelles, comme l’ukrainien, ajoutez les formes fléchies comme alias. |
| **Ce README** | English, Deutsch, Español, Українська, Italiano, Français (liens en haut). |

Les captures d’écran de toutes les versions de ce README montrent l’interface en anglais. Si vous souhaitez améliorer une traduction ou ajouter une langue, **Paramètres → Général → Aider à traduire Novelmaker…** ouvre un tableau prévu pour cela ; les détails se trouvent sous [Traductions](#traductions).

## Prise en main

### Prérequis

[Node.js](https://nodejs.org) 22 ou plus récent. Rien d’autre : la base de données est un fichier, et l’interface web est compilée au premier démarrage.

### Lancement

**Windows :** double-cliquez sur `start.bat`. Le premier démarrage installe les dépendances et compile l’interface (cela prend une minute ou deux), puis votre navigateur ouvre <http://localhost:3000>. Aux démarrages suivants, l’interface n’est recompilée que si le code source a changé.

**macOS, Linux ou manuellement :**

```sh
npm install
npm run build
npm start          # serveur + interface sur http://localhost:3000
```

**Arrêt :** choisissez **Données → Quitter Novelmaker** dans l’en-tête, fermez la fenêtre de la console ou appuyez sur `Ctrl+C` dans celle-ci. Dans les trois cas, une sauvegarde est d’abord effectuée.

### Premiers pas

1. **Paramètres → Général :** choisissez la langue de l’interface. L’anglais est la langue par défaut.
2. **Paramètres → Fournisseurs d’IA :** ajoutez OpenRouter (saisissez votre clé API) et/ou un serveur local, puis cliquez sur *Charger / tester les modèles*.
3. **Paramètres → Collections de modèles :** rassemblez les modèles que vous voulez utiliser et définissez une collection par défaut.
4. **Bibliothèque → Nouveau roman**, ou **Importer** un manuscrit existant.
5. **Roman** (dans la barre supérieure du roman) : réglez la langue, le temps du récit, le point de vue et le personnage POV. Les *Instructions supplémentaires pour l’IA* sont ajoutées à chaque prompt de beat et de chat.
6. Écrivez. Pour obtenir l’aide de l’IA, tapez `/` dans une ligne vide, choisissez *Beat*, décrivez ce qui doit se passer et appuyez sur *Générer* (ou `Ctrl+Entrée`).
7. Facultatif : **Données → Emplacement et sauvegardes** déplace la base de données dans un dossier Dropbox ou OneDrive, pour que vous puissiez travailler sur plusieurs ordinateurs.

## Fonctionnement

### Architecture

```
Navigateur (http://localhost:3000)
  React · TipTap (éditeur de texte) · CodeMirror (éditeur de prompts)
        │  REST + Server-Sent Events pour le streaming
        ▼
Serveur Node.js (Fastify)
  ├─ base de données SQLite : un seul fichier qui contient tout
  ├─ moteur de prompts et reconnaissance du codex (même code que dans le navigateur)
  └─ client LLM ──▶ OpenRouter · Ollama · LM Studio · KoboldCpp · toute API compatible OpenAI
```

Le serveur est nécessaire pour deux raisons : les navigateurs ne peuvent souvent pas joindre directement les serveurs d’IA locaux (CORS), et un seul fichier de base de données est plus facile à sauvegarder et à déplacer que le stockage du navigateur. Le paquet `shared/` (moteur de prompts, reconnaissance du codex, types) s’exécute à la fois dans le navigateur et sur le serveur. Ainsi, l’aperçu en direct et la mise en évidence des noms se comportent exactement comme la vraie génération.

### Comment un roman est enregistré

- **Série → Roman (tome) → Acte → Chapitre → Scène.** En interne, tous les niveaux existent toujours. L’interface masque le niveau des actes quand il n’y a qu’un seul acte, et le niveau des scènes quand un chapitre n’a qu’une seule scène.
- **Le texte des scènes** est enregistré sous forme de document structuré (JSON ProseMirror), avec une copie en texte brut. Les beats, les notes masquées et les cadres sont des blocs du même document, mais ne font pas partie du manuscrit : ils ne sont ni comptés, ni exportés, ni envoyés à l’IA comme texte du récit.
- **Les entrées du codex** se trouvent au niveau de la série (partagées par tous les tomes) ou au niveau du tome. Une entrée de tome portant le même nom prend le pas sur l’entrée de la série.
- Sont également enregistrés : les prompts (une version par langue d’interface), les fournisseurs, les collections de modèles, les chats, les extraits, les versions des scènes et le journal des générations.

### Ce qui se passe quand vous cliquez sur Générer

1. Le navigateur envoie le prompt et le modèle à utiliser, vos options (p. ex. *Mots : 400*, contexte supplémentaire) et l’endroit où vous vous trouvez : scène, beat, position du curseur ou sélection.
2. Le serveur rassemble ce que demandent les blocs du prompt, par exemple les informations sur le roman, le texte avant et après le curseur, la fin de la scène précédente, les résumés de toutes les scènes précédentes (« l’histoire jusqu’ici ») et le contexte que vous avez ajouté.
3. **Sélection du codex :** il parcourt la scène et le beat à la recherche de noms et d’alias, ajoute les entrées réglées sur *toujours*, le personnage POV et les entrées épinglées, les classe par priorité (toujours > POV > épinglées > mentionnées > reste) et s’arrête au budget de tokens défini dans les paramètres du roman.
4. **Rendu :** les blocs du prompt sont compilés en messages de chat (system / user / assistant), puis remplis par le moteur de templates.
5. **Streaming :** `max_tokens` est déduit de l’option *Mots*, sauf si la collection de modèles le fixe. La requête part vers le fournisseur, et la réponse revient au navigateur token par token.
6. **Votre décision :** accepter, mettre de côté, régénérer ou rejeter. Chaque appel est journalisé avec les messages finaux, la réponse, les tokens, le coût et la durée.

L’**estimation du coût** exécute les étapes 1 à 4 sans appeler le modèle. Les tokens d’entrée sont estimés à environ 3,5 caractères par token. La longueur de la réponse vient de *Mots*, de *Longueur* (résumés) ou du texte sélectionné (réécriture). Les prix viennent de la liste de modèles du fournisseur : OpenRouter les fournit, et les serveurs locaux sont considérés comme gratuits.

### Prompts : des blocs, pas du code

Un prompt Novelmaker se compose de quatre parties (rôle et style, blocs de contexte, tâche, options) et ne demande aucune programmation. Quand vous l’enregistrez, Novelmaker le compile en messages pour son moteur de templates. Le même moteur exécute les prompts importés de Novelcrafter, qui utilisent un petit langage de script. Les détails se trouvent dans la [Référence des prompts](#référence-des-prompts).

## Importer des romans

**Bibliothèque → Importer** accepte Word (`.docx`), Markdown (`.md`), texte brut (`.txt`) ou un zip. Avant l’import, une fenêtre montre ce qui a été trouvé. Vous pouvez aussi y choisir une série existante ; le roman en devient alors le tome suivant.

- **Par défaut, tout est de la prose.** Les titres divisent le texte en chapitres (deux niveaux de titre : acte + chapitre ; trois : acte / chapitre / scène). `* * *` ou une ligne horizontale commence une nouvelle scène. Dans les fichiers texte, des lignes comme « Chapter 2: Title », « Prologue » ou « Epilogue » deviennent des chapitres, et « Part 1 » devient un acte.
- **Structure du zip :**

  ```
  Novel.zip
    Manuscript.docx   (ou .md/.txt ; plusieurs fichiers = un chapitre chacun, triés par numéro)
    Context/          une entrée du codex par fichier ; les sous-dossiers Characters/, Locations/, Objects/, Lore/, Subplots/ déterminent le type
    Snippets/         un extrait par fichier
  ```

  Les noms de dossiers allemands (`Kontext/`, `Figuren/`, `Orte/`, `Notizen/`, …) fonctionnent aussi.
- Les fichiers Markdown de `Context/` peuvent commencer par un en-tête comme `aliases: Anni, Mme Berg`, `type: character`, `always: true` (ou `never: true`). Les autres lignes comme `Âge: 31` deviennent des champs personnalisés.
- **Export Novelcrafter :** un zip complet de Novelcrafter est reconnu automatiquement (la case *Export Novelcrafter* est cochée). Le résumé et la prose de chaque scène sont séparés au niveau de la ligne de démarcation, et le codex, les extraits et les chats sont repris des dossiers Novelcrafter. Les scènes sans cette ligne sont classées automatiquement ; vous pouvez modifier ce classement dans la fenêtre.
- Les fichiers Word exportés par Novelmaker peuvent être réimportés avec la même structure.

## Référence des prompts

### Prompts en blocs

| Partie | Contenu |
|---|---|
| **Rôle et style** | Texte libre : qui est l’IA et comment elle doit écrire (« Tu es une éditrice honnête… », tout un guide de style, ce qu’il faut éviter). |
| **Blocs de contexte** | Cochez ce que l’IA doit recevoir : les instructions supplémentaires du roman, les mots interdits (les alias d’une entrée du codex), les informations sur le roman, le codex, l’histoire jusqu’ici, le résumé de la scène, le contexte choisi à l’exécution, la fin de la scène précédente (*n* mots, éventuellement uniquement avec le même personnage POV), le texte avant le curseur (*n* mots, éventuellement comme modèle de style), le texte après le curseur, le texte sélectionné et, pour les résumés, le texte à résumer. Seuls les blocs adaptés au type de prompt sont proposés. |
| **Tâche** | Texte libre : ce que l’IA doit faire (dans le chat : les règles pour les réponses). |
| **Options** | Champs choisis à l’exécution, p. ex. *Mots : 200 / 400 / 600*. *Mots* limite aussi la longueur de la réponse ; *Longueur* fait de même pour les résumés. |

Les **variables** apparaissent sous forme de pastilles. Insérez-les avec *Variable* ou en tapant `{{` : *Beat*, *Instruction*, *Perspective*, *Personnage POV*, *Langue du roman*, *Temps du récit*, *Titre du roman*, *Auteur*, *Série*, *Tome*, *Chapitre*, *Scène*, ainsi que chaque option (p. ex. `{{Mots}}`). Elles sont enregistrées en texte brut sous la forme `{{Nom}}`.

**Nouveau** crée un prompt avec *tous* les blocs de son type, préréglés de façon judicieuse ; décochez ce dont vous n’avez pas besoin. Vous n’avez pas à décider de l’ordre. Le rôle et les instructions deviennent le message système, suivis du contexte, du texte avant le curseur comme modèle de style (le modèle le traite comme sa propre réponse précédente) et enfin de la tâche. Dans le chat, tout va dans le message système. L’aperçu en direct montre exactement ce qui sera envoyé.

Types de prompts : *Beat → prose*, *Continuer à écrire*, *Modifier le texte* (réécrire, raccourcir, développer, instruction personnalisée), *Résumé* (scène, chapitre, tome), *Chat* et *Composant* (éléments réutilisables pour les prompts script).

### Prompts script (importés)

Les prompts importés de Novelcrafter restent des prompts script et s’exécutent sans modification. **Convertir en blocs** crée une copie en blocs si le prompt n’utilise que des schémas courants ; sinon, Novelmaker indique les parties qui n’ont pas d’équivalent en blocs. Les composants `Novelmaker/Codex`, `…/AdditionalContext`, `…/AdditionalInstructions`, `…/Chat/DefaultContext` et `…/Chat/DefaultInstructions` sont intégrés à cet effet, et les références à `Novelcrafter/…` sont réécrites vers eux à l’import.

```
{novel.title}   {wordsBefore(1500)}   {pov.character(scene.previous)}
{#if condition} … {#elseif condition} … {#else} … {#endif}
{! commentaire !}
"texte" ou 'texte', nombres, + (concaténation), is, is not, in, and, or, not
```

Les expressions peuvent s’étendre sur plusieurs lignes. Dans `#if`, une valeur est vraie si elle n’est pas vide. Les noms des fonctions et des champs `input` ne sont pas sensibles à la casse. Les fonctions inconnues produisent un avertissement au lieu d’une erreur. Les lignes qui ne contiennent que `{#if}`/`{#endif}`/des commentaires disparaissent avec leur saut de ligne. Les messages vides sont supprimés, et les messages consécutifs du même rôle sont fusionnés.

<details>
<summary>Liste des fonctions</summary>

| Groupe | Fonctions |
|---|---|
| Roman | `novel.title`, `novel.author`, `novel.description`, `novel.summary`, `novel.language`, `novel.tense`, `novel.instructions`, `novel.hasSeries`, `novel.volume`, `novel.outline`, `novel.chapterSummaries`, `novel.fullText`, `novel.wordCount` |
| Série | `series.title`, `series.description`, `series.volumes` |
| Point de vue | `pov`, `pov.character(scene?)`, `pov.name(scene?)`, `pov.type(scene?)` |
| Scène | `scene`, `scene.title(scene?)`, `scene.summary(scene?)`, `scene.fullText(scene?)`, `scene.previous(scene?)`, `scene.next(scene?)`, `scene.number(scene?)`, `scene.labels(scene?)`, `scene.wordCount(scene?)`, `scene.chapter(scene?)`, `storySoFar`, `previousScenes(n)` |
| Chapitre | `chapter`, `chapter.title(chapter?)`, `chapter.summary(chapter?)`, `chapter.fullText(chapter?)`, `chapter.number(chapter?)`, `chapter.scenes(chapter?)`, `chapter.sceneSummaries(chapter?)`, `chapter.previous(chapter?)`, `chapter.next(chapter?)` |
| Acte | `act`, `act.title(act?)`, `act.summary(act?)`, `act.fullText(act?)`, `act.number(act?)`, `act.chapters(act?)` |
| Texte | `message`, `textBefore`, `textAfter`, `wordsBefore(n)`, `wordsAfter(n)`, `isStartOfText`, `selection`, `lastWords(text, n)`, `firstWords(text, n)`, `wordCount(text)`, `upper`, `lower`, `trim` |
| Codex | `codex.context`, `codex.global`, `codex.mentioned`, `codex.get(name, …)`, `codex.aliases(name)`, `codex.name/description/type(entry)`, `codex.field(entry, key)`, `codex.characters`, `codex.locations`, `codex.objects`, `codex.lore`, `codex.subplots`, `codex.volumes`, `codex.all`, `codex.byTag(tag)` |
| Extraits | `snippet.get(title)`, `snippet.text(snippet)` |
| Composition | `include("Component")`, `input("Name")`, `local("name", value?)` |
| Listes et format | `without(list, list2)`, `join(list, separator?)`, `count`, `first`, `last`, `list(…)`, `asXml`, `asMarkdown`, `asText` |
| Logique | `and(…)`, `or(…)`, `not(a)`, `isEmpty(a)`, `isNotEmpty(a)`, `is(a, b)`, `contains(list\|text, value)`, `if(cond, then, else?)`, `default(value, fallback)` |

Les propriétés peuvent être chaînées, p. ex. `{scene.previous.summary}` ou `{pov.character.name}`. Par défaut, les entrées du codex, les scènes, etc. sont rendues en XML (`<character name="…" aliases="…">…</character>`) ; les paramètres du roman proposent aussi Markdown ou texte brut.

</details>

## Données, sauvegardes et plusieurs ordinateurs

- **Base de données :** par défaut `data/novelmaker.db`, un seul fichier qui contient tout (y compris les clés API en clair).
- **Emplacement** (Données → Emplacement et sauvegardes) : par exemple un dossier Dropbox ou OneDrive, pour travailler sur plusieurs ordinateurs. Novelmaker y déplace le fichier, ou utilise une base de données qui s’y trouve déjà (p. ex. celle de votre deuxième ordinateur). Aucun redémarrage n’est nécessaire. Le choix est enregistré pour chaque ordinateur dans `data/config.json`.
- **Plusieurs ordinateurs :** ne travaillez que sur un seul à la fois, et quittez Novelmaker avant de changer d’ordinateur. Un fichier de verrou (`novelmaker.db.lock`) à côté de la base de données déclenche un avertissement si elle est encore ouverte ailleurs, et les copies de conflit de Dropbox/OneDrive sont également signalées. La base de données fonctionne sans fichier WAL : après chaque enregistrement, l’état complet se trouve donc dans ce seul fichier.
- **Sauvegardes** (dossier au choix, par défaut `data/backups/`, les N dernières sont conservées) : au démarrage si le fichier a changé depuis la dernière sauvegarde, à la fermeture, avant la suppression d’un roman ou d’une série, et à la demande (Données → Sauvegarder maintenant). Les paramètres du roman proposent aussi un export JSON complet.
- **Enregistrement automatique :** le texte est enregistré 0,8 s après votre dernière frappe, et au moins toutes les 3 s tant que vous continuez à taper.
- **Restauration :** quittez Novelmaker, copiez une sauvegarde dans le dossier de la base de données et renommez-la en `novelmaker.db`.

## Raccourcis clavier

| Touches | Action |
|---|---|
| `/` au début d’une ligne vide | Menu de commandes (beat, note, cadre, continuer à écrire) |
| `Ctrl+Maj+B` | Insérer un beat |
| `Ctrl+Alt+N` | Insérer une note masquée |
| `Ctrl+Entrée` dans un beat | Générer |
| `Ctrl+clic` sur un nom mis en évidence | Ouvrir l’entrée du codex |
| `Ctrl+S` | Enregistrer (paramètres du roman, éditeur de prompts) |
| `Ctrl+Z` / `Ctrl+Y` | Annuler / rétablir (fait aussi revenir un cadre supprimé) |
| `Échap` | Fermer les fenêtres et les menus, quitter le mode concentration |

Sous macOS, utilisez `Cmd` au lieu de `Ctrl`.

## Configuration

| Variable d’environnement | Par défaut | Signification |
|---|---|---|
| `PORT` | `3000` | Port du serveur et de l’interface |
| `HOST` | `localhost` | Adresse sur laquelle le serveur écoute |
| `NOVELMAKER_DATA` | `data/` dans le dossier du programme | Dossier pour `config.json`, la base de données (sauf si elle a été déplacée) et les sauvegardes |
| `NOVELMAKER_OPEN` | non définie | `1` ouvre le navigateur après le démarrage (`start.bat` la définit) |

## Développement

```sh
npm run dev        # rechargement à chaud : interface sur http://localhost:5173, API sur le port 3000
npm test           # vitest (shared + server)
npm run typecheck  # TypeScript pour les trois paquets
npm run i18n       # vérifie les fichiers de traduction
```

```
start.bat             lance le serveur + le navigateur (installe/compile si nécessaire)
shared/               moteur de prompts, reconnaissance du codex, prompts en blocs, codec Novelcrafter, i18n, types (navigateur + serveur)
server/               Fastify, SQLite (better-sqlite3), client LLM (compatible OpenAI, streaming), tâches, import/export
web/                  React, TipTap, CodeMirror, Tailwind
scripts/              vérification du build pour start.bat, vérificateur de traductions
docs/screenshots/     images de ce README
```

### Traductions

Les textes de l’interface sont écrits en anglais dans le code et servent de clés (`t('Save')`). Chaque autre langue a un fichier JSON qui associe le texte anglais à sa traduction : `shared/src/i18n/locales/{de,es,uk,it,fr}.json`.

- **Dans l’application :** **Paramètres → Général → Aider à traduire Novelmaker…** ouvre un tableau avec le texte anglais, une autre langue pour comparaison et votre traduction. Il permet de filtrer les textes manquants et les variables cassées, enregistre directement dans le fichier de langue et permet de télécharger ou d’importer un fichier de langue. Il est destiné aux personnes qui aident aux traductions ; il n’est pas nécessaire pour un usage normal.
- **À la main** (aucune programmation nécessaire) : modifiez la valeur dans le fichier JSON. Laissez telles quelles les variables comme `{n}` ou `{name}` et les balises comme `<b>…</b>`. Les pluriels peuvent s’écrire `{ "one": "…", "few": "…", "many": "…", "other": "…" }` (les règles viennent de `Intl.PluralRules`). `npm run i18n` signale les clés manquantes et les variables cassées.
- Les modifications enregistrées dans le tableau s’appliquent immédiatement. Celles apportées directement aux fichiers prennent effet au démarrage suivant : `start.bat` recompile automatiquement l’interface ; sinon, lancez `npm run build`.
- **De meilleurs textes anglais** se modifient dans le code. La clé change avec eux, donc les autres langues ont aussi besoin de la nouvelle clé ; `npm run i18n` liste ce qui manque.
- **De meilleurs textes de prompts :** pour votre propre usage, modifiez simplement les prompts dans l’atelier de prompts ; chaque langue a sa propre version. Ce qui est livré avec Novelmaker se trouve dans `shared/src/promptlang.ts` (habillage des blocs, noms des variables, rôles et tâches par défaut), `shared/src/builtin.ts` (prompts intégrés) et `shared/src/template/` (mots que le moteur écrit dans les prompts, comme la phrase sur le point de vue).
- **Ajouter une langue** se fait avec le même tableau, sans programmer :
  1. Dans **Paramètres → Général → Aider à traduire Novelmaker…**, saisissez le code de la langue dans *Nouvelle langue (code)* (par ex. `pt` ou `pt-BR`) et cliquez sur **Démarrer**. Le tableau affiche alors une colonne vide pour la nouvelle langue. Avec *Comparer avec*, vous pouvez traduire à partir d’une langue que vous connaissez mieux que l’anglais.
  2. Traduisez autant que vous le souhaitez ; le filtre *Manquantes* montre ce qui reste. **Enregistrer** crée le fichier de langue (par ex. `shared/src/i18n/locales/pt.json`). La fois suivante, la langue apparaît dans *Traduire en*, vous pouvez donc reprendre plus tard. **Télécharger** vous donne le fichier à envoyer.
  3. Pour que la langue soit sélectionnable dans l’application, il faut intervenir dans le code : l’enregistrer dans `Lang`, `LANGS` et `LANGUAGES` dans `shared/src/i18n/index.ts` (y compris l’import du fichier) et écrire les textes de prompts propres à cette langue dans les fichiers ci-dessus. TypeScript signale chaque endroit où la nouvelle langue manque encore. D’ici là, la traduction reste dans son fichier et rien n’est perdu.

## Limites connues

- **Import Novelcrafter :** la perspective narrative et la langue ne font pas partie de l’export et doivent être réglées ensuite sous *Roman* (lors d’un import dans une série, elles sont reprises du tome précédent). Les scènes sans ligne de démarcation entre résumé et prose sont classées par une heuristique (quelques longs paragraphes sans dialogue = résumé), que vous pouvez corriger dans la fenêtre d’import.
- Les **personas** ne sont pas prises en charge ; `include("Novelcrafter/Personas")` est supprimé à l’import.
- Les nombres de tokens avant l’envoi sont des estimations (environ 3,5 caractères par token). Après la génération, le journal affiche les chiffres réels du fournisseur.
- Avec les **modèles de raisonnement**, certains fournisseurs comptent la réflexion dans `max_tokens`. Dans ce cas, définissez un `max_tokens` plus grand (ou p. ex. `{"reasoning": {"effort": "low"}}`) comme paramètre de ce modèle dans sa collection.
