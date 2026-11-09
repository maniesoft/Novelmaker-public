# Novelmaker

[English](README.md) · [Deutsch](README.de.md) · **Español** · [Українська](README.uk.md) · [Italiano](README.it.md) · [Français](README.fr.md)

Una aplicación de escritura local para novelas, con la ayuda de la IA integrada en el manuscrito. Novelmaker se ejecuta en tu navegador en `localhost` y guarda todo en un único archivo SQLite en tu ordenador. Funciona con los modelos de IA que tú elijas: a través de OpenRouter o con un modelo que se ejecute en tu propio equipo (Ollama, LM Studio, KoboldCpp, …).

![Vista de escritura: a la izquierda el esquema, en el centro la escena con nombres de personajes y lugares resaltados, una tarjeta del códice de «Isolde Venn», y a la derecha notas ancladas y el panel de la escena](docs/screenshots/writing.png)

<sub>Todas las capturas de pantalla muestran datos de ejemplo inventados.</sub>

## Contenido

- [Por qué existe Novelmaker](#por-qué-existe-novelmaker)
- [Qué es Novelmaker](#qué-es-novelmaker)
- [Recorrido por las funciones](#recorrido-por-las-funciones)
- [Idiomas](#idiomas)
- [Cómo empezar](#cómo-empezar)
- [Cómo funciona](#cómo-funciona)
- [Importar novelas](#importar-novelas)
- [Referencia de prompts](#referencia-de-prompts)
- [Datos, copias de seguridad y varios ordenadores](#datos-copias-de-seguridad-y-varios-ordenadores)
- [Atajos de teclado](#atajos-de-teclado)
- [Configuración](#configuración)
- [Desarrollo](#desarrollo)
- [Limitaciones conocidas](#limitaciones-conocidas)

## Por qué existe Novelmaker

La idea de Novelmaker viene de [Novelcrafter](https://www.novelcrafter.com): una aplicación de escritura en la que la IA trabaja directamente dentro del manuscrito. Yo solo quería tenerlo sin página web y sin suscripción.

Mi mayor problema era el ritmo con el que escribo. A las fases de facilidad creativa, en las que usaba mucho Novelcrafter, les seguían fases en las que no escribía nada en absoluto, y la suscripción seguía corriendo. La mayoría de las veces me daba pereza pausarla o se me olvidaba. Con Novelmaker solo pagas a tu proveedor de IA, y solo por lo que realmente generas. Con un modelo local no pagas nada.

Muchísimas gracias y todo mi reconocimiento a Novelcrafter. Novelmaker no pretende competir con ellos en ningún sentido. Lo hice para mí, y cualquiera que quiera usarlo es bienvenido.

Novelmaker no tiene ningún servidor en internet, así que tus datos se quedan en tu ordenador (salvo los prompts que envías a tu proveedor de IA). Eso también significa:

- **Las copias de seguridad son cosa tuya.** Novelmaker hace copias de seguridad automáticamente, pero en tu propio disco. Guardar una copia en otro sitio (otro disco, una carpeta en la nube) es tarea tuya.
- **Trae tus propias claves.** Necesitas tu propia clave de API, p. ej., para OpenRouter, o un modelo que se ejecute en tu propio equipo.

## Qué es Novelmaker

Novelmaker es para quienes escriben ficción larga y quieren la ayuda de la IA **dentro del manuscrito** en lugar de en una ventana de chat aparte. Tú escribes. Cuando quieres que la IA redacte un pasaje, dejas una instrucción en el texto, llamada *beat* (por ejemplo, «Mara pregunta por el libro de cuentas desaparecido; él cambia de tema»), y haces clic en *Generar*. Novelmaker construye el prompt por ti. Incluye el texto anterior al cursor, los resúmenes de las escenas anteriores y solo aquellas entradas del códice (personajes, lugares, trasfondo) que importan para esta escena. Lees el resultado y decides qué conservar.

En qué se basa:

- **Local y privado.** Un solo usuario, sin cuenta, sin servicio en la nube propio. Tu texto solo sale de tu ordenador como parte de los prompts que envías al proveedor de IA que hayas configurado.
- **Tú eliges el modelo.** Funciona cualquier API compatible con OpenAI: OpenRouter (cientos de modelos, con precios), Ollama, LM Studio, KoboldCpp o tu propio servidor.
- **Transparente.** Ves exactamente qué se envía a la IA (el prompt final, la selección del códice con sus motivos) y cuánto cuesta, antes de hacer clic y después.
- **La autoría sigue siendo tuya.** El texto de la IA nunca sustituye el tuyo sin avisar. Lo aplicas, lo guardas aparte como variante, lo vuelves a generar o lo descartas. Antes de cada cambio aplicado, Novelmaker guarda una versión de la escena.
- **Multilingüe.** Interfaz y prompts integrados en inglés, alemán, español, ucraniano, italiano y francés. Tu novela puede estar en cualquier idioma que conozca tu modelo (consulta [Idiomas](#idiomas)).

Fuera de su alcance: varios usuarios, inicio de sesión, alojamiento en internet, un servicio de sincronización. Las claves de API se guardan en texto plano en la base de datos local, así que no expongas el servidor más allá de `localhost`.

## Recorrido por las funciones

### Biblioteca, novelas y series

![Biblioteca con una serie de dos volúmenes y dos novelas independientes, cada una con su portada](docs/screenshots/library.png)

Una novela puede ser independiente o un volumen de una serie. Las entradas del códice pueden pertenecer a un volumen o a toda la serie, así que los personajes pasan de un libro a otro. Cada novela puede tener una portada (súbela o arrastra una imagen). Puedes convertir una novela independiente en una serie, añadirla a una serie existente o volver a sacarla.

### Escribir

La vista principal (captura de arriba) tiene tres partes:

- **Esquema:** actos, capítulos y escenas, que se reordenan arrastrando y soltando. Los actos y las escenas son opcionales. Un libro sin actos y con un texto por capítulo se ve exactamente así.
- **Editor:** una escena cada vez, o todo el manuscrito como texto continuo. Guardado automático, recuento de palabras, modo concentración, modo oscuro. *Dividir* empieza una escena o un capítulo nuevos en el cursor.
- **Columnas laterales:** el panel de la escena (título, resumen, perspectiva, etiquetas, versiones, contexto de IA) y una columna de elementos **anclados**: entradas del códice, fragmentos u otras escenas que quieres tener a la vista mientras escribes.

Los nombres y alias del códice aparecen subrayados en el texto. Al pasar el ratón por encima aparece una tarjeta, y *Ctrl+clic* abre la entrada justo encima del texto. Cada escena puede tener su propia **perspectiva** (personaje POV y perspectiva narrativa); por defecto sigue la de la novela. Las **notas ocultas** se quedan en el texto para ti, pero no forman parte del manuscrito y nunca se envían a la IA.

### Beats y variantes

![Un beat con su instrucción y la selección de prompt y modelo, el pasaje generado con Aplicar/Guardar aparte/Volver a generar/Descartar y, debajo, una variante anterior guardada aparte en un marco discontinuo](docs/screenshots/beat-variants.png)

Un **beat** es un bloque de instrucciones dentro de la escena. Eliges el prompt, el modelo y opciones como la longitud («Palabras: 400»). La respuesta va apareciendo debajo del beat. Después:

- **Aplicar** pone el texto en la escena (antes se guarda una versión de la escena).
- **Guardar aparte** conserva la respuesta como variante numerada en un **marco** bajo el beat, para que puedas volver a intentarlo y comparar. Los marcos se pueden plegar, titular, disolver en texto normal o eliminar. Por defecto están *ocultos para la IA*: no se envían en los prompts, no se cuentan y no se exportan.
- **Volver a generar** o **Descartar**.

### El menú «/»

<img src="docs/screenshots/slash-menu.png" alt="Menú de comandos tras escribir / en una línea vacía: Beat, Nota, Marco, Seguir escribiendo" width="560">

Escribe `/` al principio de una línea vacía para insertar un beat, una nota o un marco, o para que la IA siga escribiendo desde ahí. Si sigues escribiendo, la lista se filtra (`/no` → Nota).

### Reescribir, acortar, ampliar

![Diálogo de reescritura con el pasaje seleccionado a la izquierda y la versión de la IA a la derecha](docs/screenshots/rewrite.png)

Selecciona texto y elige **Reescribir**, **Acortar**, **Ampliar** o **Instrucción…** (tu propia instrucción, p. ej., «más tensión, frases más cortas»). Ves el antes y el después uno al lado del otro y puedes aplicar, guardar aparte o volver a generar. **Seguir escribiendo** (barra de herramientas o `/`) redacta el siguiente pasaje a partir del cursor.

### Conoce el coste antes de hacer clic

<img src="docs/screenshots/cost-estimate.png" alt="Tarjeta emergente con los tokens estimados de entrada y de respuesta, el coste total, el coste máximo con max_tokens, el precio por millón de tokens y el uso de la ventana de contexto" width="560">

Cada botón *Generar* muestra una estimación (p. ej., «≈ 1.50 ¢»). Al pasar el ratón por encima ves los detalles: tokens de entrada y de respuesta, coste, el máximo con `max_tokens`, el precio del modelo y cuánto se llena la ventana de contexto. Después de la llamada se muestran las cifras reales del proveedor, que se guardan en el registro.

### Códice

![Página del códice con las entradas agrupadas por tipo y el editor del personaje «Mara Quill»](docs/screenshots/codex.png)

Personajes, lugares, objetos, trasfondo, subtramas, volúmenes y cualquier otra cosa. Cada entrada tiene alias, una descripción que se envía a la IA, notas privadas que no se envían, campos propios, etiquetas y relaciones. El reconocimiento tiene en cuenta las formas flexionadas y los posesivos (en inglés, «Mara's» → Mara), y puedes hacer que una entrada distinga mayúsculas y minúsculas para nombres que también son palabras corrientes. La **inclusión** decide cuándo se incluye una entrada en un prompt:

- **Al mencionarse** (predeterminado): se incluye en cuanto su nombre o un alias aparece cerca del cursor.
- **Siempre:** p. ej., una guía de estilo o las reglas del mundo.
- **Nunca:** solo cuando un prompt la pide expresamente, p. ej., una lista de palabras prohibidas.

### Mira lo que ve la IA

<img src="docs/screenshots/ai-context.png" alt="Columna de elementos anclados junto a la pestaña IA del panel de la escena, con las entradas del códice que incluiría un beat, cada una con su motivo (siempre, POV, anclado, mencionado) y su número de tokens" width="560">

La pestaña **IA** del panel de la escena muestra qué entradas del códice incluiría un beat y por qué (siempre, personaje POV, anclado, mencionado), con el número de tokens. Las entradas que no caben en el presupuesto de tokens aparecen tachadas. *Mostrar el prompt completo* (o *Vista previa* junto a cualquier botón Generar) muestra el prompt final completo.

### Plan y resúmenes

![Vista del plan: capítulos como tarjetas con resúmenes de escena editables y las entradas del códice que menciona cada escena](docs/screenshots/plan.png)

El plan muestra capítulos y escenas como tarjetas con resúmenes editables. Los resúmenes alimentan la «historia hasta ahora» que reciben los prompts de beat. **Generar resúmenes** se ejecuta como tarea en segundo plano, con estimación de coste y progreso: escenas → capítulos → volumen. El resumen de un volumen se convierte en una entrada del códice a nivel de serie, así el siguiente libro «sabe» lo que pasó antes.

### Chat

![Chat sobre la novela con capítulos y entradas del códice adjuntos como contexto](docs/screenshots/chat.png)

Chats guardados por novela, con el contexto que eliges tú: actos, capítulos o escenas (texto completo o resumen), entradas del códice, fragmentos, la novela entera o texto libre. Las respuestas se pueden copiar, guardar como fragmento o como entrada del códice, o **convertir en beats dentro de una escena**. Vienen integrados un chat libre y **Reseña sincera**, que da una opinión de lector sin rodeos sobre las escenas, los capítulos o la novela que adjuntes.

### Taller de prompts

![Editor de prompts con el texto de rol y estilo con chips de marcadores, bloques de contexto que se pueden marcar y una vista previa en vivo del prompt final para una escena real](docs/screenshots/prompt-workshop.png)

Los prompts se construyen con **bloques**, sin código: un texto de rol y estilo, bloques de contexto que marcas, una tarea y opciones que eliges al ejecutarlo. Los marcadores como *Personaje POV* o *Tiempo verbal* aparecen como chips. La vista previa en vivo genera el prompt con una escena real de tu novela. Consulta la [Referencia de prompts](#referencia-de-prompts).

### Modelos y proveedores

![Colección de modelos «Fiction» con cuatro modelos de OpenRouter y Ollama y parámetros predeterminados opcionales por modelo](docs/screenshots/model-collections.png)

Añade OpenRouter (con tu clave de API) o un servidor local, carga su lista de modelos y luego reúne tus modelos favoritos en **colecciones de modelos** para que el selector de modelos siga siendo corto. Cada modelo puede llevar parámetros predeterminados (p. ej., `{"temperature": 0.9}`). Las colecciones se pueden importar desde Novelcrafter y exportar a Novelcrafter.

### Importar y exportar

<img src="docs/screenshots/import.png" alt="Diálogo de importación de un archivo zip: título, serie de destino, número de capítulos y escenas encontrados, entradas del códice y fragmentos que se van a importar" width="480">

Importa Word, Markdown, texto plano o un zip con el manuscrito, una carpeta del códice y fragmentos, incluidas exportaciones completas de Novelcrafter (consulta [Importar novelas](#importar-novelas)). El diálogo muestra lo que se ha encontrado antes de importar nada, y el libro puede unirse a una serie existente como su siguiente volumen. Exporta la novela entera o un solo acto, capítulo o escena como Word (.docx) o Markdown, o cópiala como texto con formato (los títulos y las cursivas se conservan al pegar en Word). Los prompts y las colecciones de modelos se pueden intercambiar con Novelcrafter.

### Modo oscuro y modo concentración

![Vista del manuscrito en modo oscuro](docs/screenshots/dark-mode.png)

### Además

- **Búsqueda** en escenas, códice y fragmentos.
- **Fragmentos:** notas libres e investigación, que se pueden usar como contexto para la IA.
- **Versiones:** instantáneas de las escenas, creadas automáticamente antes de los cambios de la IA y restaurables.
- **Registro:** cada generación con los mensajes finales, la respuesta, los tokens, el coste y la duración.

## Idiomas

Novelmaker admite seis idiomas en todas sus partes: **inglés (English), alemán (Deutsch), español, ucraniano (Українська), italiano y francés (Français)**.

| Qué | Cómo funciona |
|---|---|
| **Interfaz** | **Ajustes → General → Idioma.** En el primer inicio se usa el inglés. La elección se guarda en la base de datos, así que te acompaña a otros ordenadores. Los mensajes del servidor (errores, tareas en segundo plano) usan el mismo idioma. |
| **Prompts integrados** | Cada prompt integrado existe en los seis idiomas. Cada prompt, incluidos los tuyos, puede tener una versión por idioma. El taller de prompts muestra una barra de idiomas (EN DE ES UK IT FR); si falta una versión, recurre a otra y ofrece copiarla. |
| **Idioma de la novela** | Se configura por novela, con independencia del idioma de la interfaz. Le indica a la IA en qué idioma escribir, así que puedes escribir en cualquier idioma que conozca tu modelo. Los textos que Novelmaker añade por su cuenta a los prompts (la frase sobre la perspectiva, etiquetas como «Capítulo 3») siguen el idioma de la novela en los seis idiomas mencionados y, en los demás, están en inglés. |
| **Reconocimiento del códice** | Funciona con cualquier alfabeto (acentos, diéresis, cirílico). Las terminaciones automáticas (el posesivo *'s* del inglés, *-s/-n/-en* del alemán) están pensadas para el inglés y el alemán. Para idiomas con muchas terminaciones de caso, como el ucraniano, añade las formas flexionadas como alias. |
| **Este README** | English, Deutsch, Español, Українська, Italiano, Français (enlaces arriba). |

Las capturas de pantalla de todas las versiones de este README muestran la interfaz en inglés. Si quieres mejorar una traducción o añadir un idioma, **Ajustes → General → Ayudar a traducir Novelmaker…** abre una tabla para ello; más detalles en [Traducciones](#traducciones).

## Cómo empezar

### Requisitos

[Node.js](https://nodejs.org) 22 o posterior. Nada más: la base de datos es un archivo y la interfaz web se compila en el primer inicio.

### Iniciar

**Windows:** haz doble clic en `start.bat`. El primer inicio instala las dependencias y compila la interfaz (tarda uno o dos minutos); después, tu navegador abre <http://localhost:3000>. En los inicios siguientes, la interfaz solo se vuelve a compilar si el código fuente ha cambiado.

**macOS, Linux o a mano:**

```sh
npm install
npm run build
npm start          # servidor + interfaz en http://localhost:3000
```

**Para cerrar:** elige **Datos → Cerrar Novelmaker** en la cabecera, cierra la ventana de la consola o pulsa `Ctrl+C` en ella. En los tres casos se hace antes una copia de seguridad.

### Primeros pasos

1. **Ajustes → General:** elige el idioma de la interfaz. El inglés es el predeterminado.
2. **Ajustes → Proveedores de IA:** añade OpenRouter (introduce tu clave de API) y/o un servidor local; luego haz clic en *Cargar / probar modelos*.
3. **Ajustes → Colecciones de modelos:** reúne los modelos que quieres usar y marca una colección como predeterminada.
4. **Biblioteca → Novela nueva**, o **Importar** un manuscrito existente.
5. **Novela** (en la barra superior de la novela): configura el idioma, el tiempo verbal, la perspectiva y el personaje POV. Las *Instrucciones adicionales para la IA* se incluyen en cada prompt de beat y de chat.
6. Escribe. Para pedir ayuda a la IA, escribe `/` en una línea vacía, elige *Beat*, describe lo que debe pasar y pulsa *Generar* (o `Ctrl+Enter`).
7. Opcional: **Datos → Ubicación y copias de seguridad** traslada la base de datos a una carpeta de Dropbox o OneDrive, para que puedas trabajar en varios ordenadores.

## Cómo funciona

### Arquitectura

```
Navegador (http://localhost:3000)
  React · TipTap (editor de texto) · CodeMirror (editor de prompts)
        │  REST + Server-Sent Events para el streaming
        ▼
Servidor Node.js (Fastify)
  ├─ base de datos SQLite: un archivo con todo
  ├─ motor de prompts y reconocimiento del códice (el mismo código que en el navegador)
  └─ cliente LLM ──▶ OpenRouter · Ollama · LM Studio · KoboldCpp · cualquier API compatible con OpenAI
```

El servidor hace falta por dos motivos: los navegadores a menudo no pueden acceder directamente a los servidores de IA locales (CORS), y un único archivo de base de datos es más fácil de respaldar y trasladar que el almacenamiento del navegador. El paquete `shared/` (motor de prompts, reconocimiento del códice, tipos) se ejecuta tanto en el navegador como en el servidor. Así, la vista previa en vivo y el resaltado de nombres se comportan exactamente igual que la generación real.

### Cómo se guarda una novela

- **Serie → Novela (volumen) → Acto → Capítulo → Escena.** Internamente siempre existen todos los niveles. La interfaz oculta el nivel de acto cuando solo hay un acto, y el nivel de escena cuando un capítulo tiene una sola escena.
- **El texto de las escenas** se guarda como documento estructurado (JSON de ProseMirror) más una copia en texto plano. Los beats, las notas ocultas y los marcos son bloques del mismo documento, pero no forman parte del manuscrito: no se cuentan, no se exportan y no se envían a la IA como texto de la historia.
- **Las entradas del códice** están a nivel de serie (compartidas por todos los volúmenes) o a nivel de volumen. Una entrada de volumen con el mismo nombre prevalece sobre la de la serie.
- También se guardan: prompts (una versión por idioma de la interfaz), proveedores, colecciones de modelos, chats, fragmentos, versiones de escenas y el registro de generaciones.

### Qué pasa al hacer clic en Generar

1. El navegador envía qué prompt y qué modelo usar, tus opciones (p. ej., *Palabras: 400*, contexto adicional) y dónde estás: escena, beat, posición del cursor o selección.
2. El servidor reúne lo que piden los bloques del prompt, por ejemplo, los datos de la novela, el texto antes y después del cursor, el final de la escena anterior, los resúmenes de todas las escenas anteriores («historia hasta ahora») y cualquier contexto que hayas añadido.
3. **Selección del códice:** busca nombres y alias en la escena y en el beat, añade las entradas configuradas como *siempre*, el personaje POV y las entradas ancladas, las ordena por prioridad (siempre > POV > anclado > mencionado > resto) y se detiene al llegar al presupuesto de tokens fijado en los ajustes de la novela.
4. **Renderizado:** los bloques del prompt se compilan en mensajes de chat (system / user / assistant) y el motor de plantillas los rellena.
5. **Streaming:** `max_tokens` se deriva de la opción *Palabras*, salvo que la colección de modelos lo fije. La petición va al proveedor y la respuesta vuelve al navegador token a token.
6. **Tu decisión:** aplicar, guardar aparte, volver a generar o descartar. Cada llamada queda registrada con los mensajes finales, la respuesta, los tokens, el coste y la duración.

La **estimación de coste** ejecuta los pasos 1–4 sin llamar al modelo. Los tokens de entrada se estiman a unos 3,5 caracteres por token. La longitud de la respuesta sale de *Palabras*, de *Longitud* (resúmenes) o del texto seleccionado (reescritura). Los precios vienen de la lista de modelos del proveedor: OpenRouter los proporciona y los servidores locales cuentan como gratuitos.

### Prompts: bloques, no código

Un prompt de Novelmaker consta de cuatro partes (rol y estilo, bloques de contexto, tarea, opciones) y no requiere programar. Al guardarlo, Novelmaker lo compila en mensajes para su motor de plantillas. El mismo motor ejecuta los prompts importados de Novelcrafter, que usan un pequeño lenguaje de script. Los detalles están en la [Referencia de prompts](#referencia-de-prompts).

## Importar novelas

**Biblioteca → Importar** acepta Word (`.docx`), Markdown (`.md`), texto plano (`.txt`) o un zip. Antes de importar, un diálogo muestra lo que se ha encontrado. Ahí también puedes elegir una serie existente; la novela pasa entonces a ser su siguiente volumen.

- **Por defecto, todo es prosa.** Los títulos dividen el texto en capítulos (dos niveles de título: acto + capítulo; tres: acto / capítulo / escena). `* * *` o una línea horizontal empieza una escena nueva. En los archivos de texto, las líneas como «Chapter 2: Title», «Prologue» o «Epilogue» se convierten en capítulos y «Part 1» en un acto.
- **Estructura del zip:**

  ```
  Novel.zip
    Manuscript.docx   (o .md/.txt; varios archivos = un capítulo cada uno, ordenados por número)
    Context/          una entrada del códice por archivo; las subcarpetas Characters/, Locations/, Objects/, Lore/, Subplots/ fijan el tipo
    Snippets/         un fragmento por archivo
  ```

  También funcionan los nombres de carpeta en alemán (`Kontext/`, `Figuren/`, `Orte/`, `Notizen/`, …).
- Los archivos Markdown de `Context/` pueden empezar con una cabecera como `aliases: Anni, Sra. Berg`, `type: character`, `always: true` (o `never: true`). Otras líneas, como `Edad: 31`, se convierten en campos propios.
- **Exportación de Novelcrafter:** un zip completo de Novelcrafter se reconoce automáticamente (se marca la casilla *Exportación de Novelcrafter*). El resumen y la prosa de cada escena se separan en la línea divisoria, y el códice, los fragmentos y los chats se toman de las carpetas de Novelcrafter. Las escenas sin línea se clasifican automáticamente; puedes cambiarlo en el diálogo.
- Los archivos Word exportados por Novelmaker se pueden volver a importar con el mismo esquema.

## Referencia de prompts

### Prompts de bloques

| Parte | Contenido |
|---|---|
| **Rol y estilo** | Texto libre: quién es la IA y cómo debe escribir («Eres una correctora honesta…», toda una guía de estilo, cosas que evitar). |
| **Bloques de contexto** | Marca lo que debe recibir la IA: las instrucciones adicionales de la novela, las palabras prohibidas (los alias de una entrada del códice), la información de la novela, el códice, la historia hasta ahora, el resumen de la escena, el contexto elegido al ejecutar, el final de la escena anterior (*n* palabras, opcionalmente solo con el mismo personaje POV), el texto antes del cursor (*n* palabras, opcionalmente como modelo de estilo), el texto después del cursor, el texto seleccionado y, en los resúmenes, el texto que hay que resumir. Solo se ofrecen los bloques que encajan con el tipo de prompt. |
| **Tarea** | Texto libre: lo que debe hacer la IA (en el chat: reglas para las respuestas). |
| **Opciones** | Campos que se eligen al ejecutar, p. ej., *Palabras: 200 / 400 / 600*. *Palabras* también limita la longitud de la respuesta; *Longitud* hace lo mismo en los resúmenes. |

Los **marcadores** aparecen como chips. Se insertan con *Marcador* o escribiendo `{{`: *Beat*, *Instrucción*, *Perspectiva*, *Personaje POV*, *Idioma de la novela*, *Tiempo verbal*, *Título de la novela*, *Autor*, *Serie*, *Volumen*, *Capítulo*, *Escena*, además de cada opción (p. ej., `{{Palabras}}`). Se guardan simplemente como `{{Nombre}}`.

**Nuevo** crea un prompt con *todos* los bloques de su tipo, con valores iniciales razonables; desmarca lo que no necesites. El orden no lo decides tú. El rol y las instrucciones pasan a ser el mensaje de sistema, seguidos del contexto, el texto antes del cursor como modelo de estilo (el modelo lo trata como su propia respuesta anterior) y, por último, la tarea. En el chat, todo va en el mensaje de sistema. La vista previa en vivo muestra exactamente lo que se enviará.

Tipos de prompt: *Beat → prosa*, *Seguir escribiendo*, *Editar texto* (reescribir, acortar, ampliar, instrucción propia), *Resumen* (escena, capítulo, volumen), *Chat* y *Componente* (partes reutilizables para los prompts de script).

### Prompts de script (importados)

Los prompts importados de Novelcrafter siguen siendo prompts de script y se ejecutan sin cambios. **Convertir en bloques** crea una copia en bloques si el prompt solo usa patrones habituales; si no, Novelmaker indica las partes que no tienen equivalente en bloques. Los componentes `Novelmaker/Codex`, `…/AdditionalContext`, `…/AdditionalInstructions`, `…/Chat/DefaultContext` y `…/Chat/DefaultInstructions` vienen integrados para esto, y las referencias a `Novelcrafter/…` se reescriben para que apunten a ellos al importar.

```
{novel.title}   {wordsBefore(1500)}   {pov.character(scene.previous)}
{#if condición} … {#elseif condición} … {#else} … {#endif}
{! comentario !}
"texto" o 'texto', números, + (concatenación), is, is not, in, and, or, not
```

Las expresiones pueden ocupar varias líneas. En `#if`, un valor es verdadero si no está vacío. Los nombres de funciones y de entradas no distinguen mayúsculas y minúsculas. Las funciones desconocidas producen una advertencia en lugar de un error. Las líneas que solo contienen `{#if}`/`{#endif}`/comentarios desaparecen junto con su salto de línea. Los mensajes vacíos se descartan y los mensajes consecutivos del mismo rol se fusionan.

<details>
<summary>Lista de funciones</summary>

| Grupo | Funciones |
|---|---|
| Novela | `novel.title`, `novel.author`, `novel.description`, `novel.summary`, `novel.language`, `novel.tense`, `novel.instructions`, `novel.hasSeries`, `novel.volume`, `novel.outline`, `novel.chapterSummaries`, `novel.fullText`, `novel.wordCount` |
| Serie | `series.title`, `series.description`, `series.volumes` |
| Perspectiva | `pov`, `pov.character(scene?)`, `pov.name(scene?)`, `pov.type(scene?)` |
| Escena | `scene`, `scene.title(scene?)`, `scene.summary(scene?)`, `scene.fullText(scene?)`, `scene.previous(scene?)`, `scene.next(scene?)`, `scene.number(scene?)`, `scene.labels(scene?)`, `scene.wordCount(scene?)`, `scene.chapter(scene?)`, `storySoFar`, `previousScenes(n)` |
| Capítulo | `chapter`, `chapter.title(chapter?)`, `chapter.summary(chapter?)`, `chapter.fullText(chapter?)`, `chapter.number(chapter?)`, `chapter.scenes(chapter?)`, `chapter.sceneSummaries(chapter?)`, `chapter.previous(chapter?)`, `chapter.next(chapter?)` |
| Acto | `act`, `act.title(act?)`, `act.summary(act?)`, `act.fullText(act?)`, `act.number(act?)`, `act.chapters(act?)` |
| Texto | `message`, `textBefore`, `textAfter`, `wordsBefore(n)`, `wordsAfter(n)`, `isStartOfText`, `selection`, `lastWords(text, n)`, `firstWords(text, n)`, `wordCount(text)`, `upper`, `lower`, `trim` |
| Códice | `codex.context`, `codex.global`, `codex.mentioned`, `codex.get(name, …)`, `codex.aliases(name)`, `codex.name/description/type(entry)`, `codex.field(entry, key)`, `codex.characters`, `codex.locations`, `codex.objects`, `codex.lore`, `codex.subplots`, `codex.volumes`, `codex.all`, `codex.byTag(tag)` |
| Fragmentos | `snippet.get(title)`, `snippet.text(snippet)` |
| Composición | `include("Component")`, `input("Name")`, `local("name", value?)` |
| Listas y formato | `without(list, list2)`, `join(list, separator?)`, `count`, `first`, `last`, `list(…)`, `asXml`, `asMarkdown`, `asText` |
| Lógica | `and(…)`, `or(…)`, `not(a)`, `isEmpty(a)`, `isNotEmpty(a)`, `is(a, b)`, `contains(list\|text, value)`, `if(cond, then, else?)`, `default(value, fallback)` |

Las propiedades se pueden encadenar, p. ej., `{scene.previous.summary}` o `{pov.character.name}`. Por defecto, las entradas del códice, las escenas, etc. se representan como XML (`<character name="…" aliases="…">…</character>`); los ajustes de la novela también ofrecen Markdown o texto plano.

</details>

## Datos, copias de seguridad y varios ordenadores

- **Base de datos:** por defecto `data/novelmaker.db`, un archivo con todo (incluidas las claves de API en texto plano).
- **Ubicación** (Datos → Ubicación y copias de seguridad): por ejemplo, una carpeta de Dropbox o OneDrive, para trabajar en varios ordenadores. Novelmaker mueve allí el archivo, o usa una base de datos que ya exista allí (p. ej., en tu segundo ordenador). No hace falta reiniciar. La elección se guarda por ordenador en `data/config.json`.
- **Varios ordenadores:** trabaja solo en uno a la vez y cierra Novelmaker antes de cambiar. Un archivo de bloqueo (`novelmaker.db.lock`) junto a la base de datos hace que aparezca una advertencia si sigue abierta en otro sitio, y también se avisa de las copias en conflicto de Dropbox/OneDrive. La base de datos funciona sin archivo WAL, así que después de cada guardado el estado completo está en ese único archivo.
- **Copias de seguridad** (carpeta configurable, por defecto `data/backups/`, se conservan las últimas N): al iniciar, si el archivo ha cambiado desde la última copia; al cerrar; antes de eliminar una novela o una serie; y cuando quieras (Datos → Hacer copia ahora). Los ajustes de la novela también ofrecen una exportación completa en JSON.
- **Guardado automático:** el texto se guarda 0,8 s después de que dejes de escribir, y al menos cada 3 s mientras sigues escribiendo.
- **Restaurar:** cierra Novelmaker, copia una copia de seguridad en la carpeta de la base de datos y cámbiale el nombre a `novelmaker.db`.

## Atajos de teclado

| Teclas | Acción |
|---|---|
| `/` al principio de una línea vacía | Menú de comandos (beat, nota, marco, seguir escribiendo) |
| `Ctrl+Shift+B` | Insertar beat |
| `Ctrl+Alt+N` | Insertar nota oculta |
| `Ctrl+Enter` en un beat | Generar |
| `Ctrl+clic` en un nombre resaltado | Abrir la entrada del códice |
| `Ctrl+S` | Guardar (ajustes de la novela, editor de prompts) |
| `Ctrl+Z` / `Ctrl+Y` | Deshacer / rehacer (también recupera un marco eliminado) |
| `Esc` | Cerrar diálogos y menús, salir del modo concentración |

En macOS, usa `Cmd` en lugar de `Ctrl`.

## Configuración

| Variable de entorno | Valor predeterminado | Significado |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor y de la interfaz |
| `HOST` | `localhost` | Dirección en la que escucha el servidor |
| `NOVELMAKER_DATA` | `data/` en la carpeta del programa | Carpeta para `config.json`, la base de datos (si no se ha movido) y las copias de seguridad |
| `NOVELMAKER_OPEN` | sin definir | `1` abre el navegador tras el inicio (`start.bat` la define) |

## Desarrollo

```sh
npm run dev        # recarga en caliente: interfaz en http://localhost:5173, API en el puerto 3000
npm test           # vitest (shared + server)
npm run typecheck  # TypeScript para los tres paquetes
npm run i18n       # comprueba los archivos de traducción
```

```
start.bat             inicia servidor + navegador (instala/compila cuando hace falta)
shared/               motor de prompts, reconocimiento del códice, prompts de bloques, códec de Novelcrafter, i18n, tipos (navegador + servidor)
server/               Fastify, SQLite (better-sqlite3), cliente LLM (compatible con OpenAI, streaming), tareas, importación/exportación
web/                  React, TipTap, CodeMirror, Tailwind
scripts/              comprobación de compilación para start.bat, comprobador de traducciones
docs/screenshots/     imágenes para este README
```

### Traducciones

Los textos de la interfaz están escritos en inglés en el código y sirven como claves (`t('Save')`). Cada uno de los demás idiomas tiene un archivo JSON que asigna a cada texto inglés su traducción: `shared/src/i18n/locales/{de,es,uk,it,fr}.json`.

- **En la aplicación:** **Ajustes → General → Ayudar a traducir Novelmaker…** abre una tabla con el texto en inglés, otro idioma para comparar y tu traducción. Filtra los textos que faltan y los marcadores rotos, guarda directamente en el archivo de idioma y permite descargar o importar un archivo de idioma. Está pensada para quienes ayudan con las traducciones; para el uso normal no hace falta.
- **A mano** (no hace falta programar): cambia el valor en el archivo JSON. Deja tal cual los marcadores como `{n}` o `{name}` y las etiquetas como `<b>…</b>`. Los plurales se pueden escribir como `{ "one": "…", "few": "…", "many": "…", "other": "…" }` (las reglas vienen de `Intl.PluralRules`). `npm run i18n` informa de las claves que faltan y de los marcadores rotos.
- Los cambios guardados en la tabla se aplican de inmediato. Los cambios hechos directamente en los archivos se aplican en el siguiente inicio: `start.bat` vuelve a compilar la interfaz automáticamente; si no, ejecuta `npm run build`.
- **Mejores textos en inglés:** se cambian en el código. La clave cambia con ellos, así que los demás idiomas también necesitan la clave nueva; `npm run i18n` muestra lo que falta.
- **Mejores textos de prompts:** para tu propio uso, simplemente edita los prompts en el taller de prompts; cada idioma tiene su propia versión. Lo que viene con Novelmaker está en `shared/src/promptlang.ts` (textos que enmarcan los bloques, nombres de los marcadores, roles y tareas predeterminados), en `shared/src/builtin.ts` (prompts integrados) y en `shared/src/template/` (palabras que el motor escribe en los prompts, como la frase sobre la perspectiva).
- **Añadir un idioma** se hace con la misma tabla, sin programar:
  1. En **Ajustes → General → Ayudar a traducir Novelmaker…**, escribe el código del idioma en *Idioma nuevo (código)* (p. ej., `pt` o `pt-BR`) y haz clic en **Iniciar**. La tabla muestra ahora una columna vacía para el idioma nuevo. Con *Comparar con* puedes traducir desde un idioma que conozcas mejor que el inglés.
  2. Traduce todo lo que quieras; el filtro *Sin traducir* muestra lo que falta. **Guardar** crea el archivo de idioma (p. ej., `shared/src/i18n/locales/pt.json`). La próxima vez el idioma aparece en *Traducir a*, así que puedes seguir más adelante. **Descargar** te da el archivo para enviarlo.
  3. Para que el idioma se pueda seleccionar en la aplicación, alguien con conocimientos de programación lo registra: `Lang`, `LANGS` y `LANGUAGES` en `shared/src/i18n/index.ts` (incluida la importación del archivo) y los textos de prompts de ese idioma en los archivos mencionados arriba. TypeScript señala todos los sitios en los que todavía falta el idioma nuevo. Hasta entonces, la traducción se conserva en su archivo y no se pierde nada.

## Limitaciones conocidas

- **Importación de Novelcrafter:** la perspectiva narrativa y el idioma no forman parte de la exportación y hay que configurarlos después en *Novela* (al importar en una serie, se toman del volumen anterior). Las escenas sin línea divisoria entre resumen y prosa se clasifican con una heurística (pocos párrafos largos sin diálogo = resumen), que puedes corregir en el diálogo de importación.
- Las **Personas** de Novelcrafter no son compatibles; `include("Novelcrafter/Personas")` se descarta al importar.
- Los recuentos de tokens antes del envío son estimaciones (unos 3,5 caracteres por token). Después de la generación, el registro muestra las cifras reales del proveedor.
- Con los **modelos de razonamiento**, algunos proveedores cuentan el razonamiento dentro de `max_tokens`. En ese caso, define un `max_tokens` mayor (o, p. ej., `{"reasoning": {"effort": "low"}}`) como parámetro de ese modelo en su colección.
