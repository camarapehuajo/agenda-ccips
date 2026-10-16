# Guía paso a paso: Actividades de la CCIPS en Notion

Esta guía te enseña a armar en **Notion** la base de datos de actividades de la Cámara de Comercio CCIPS Pehuajó y su formulario de inscripción, **sin saber nada de programación**. Al terminar, un conector leerá automáticamente Notion y publicará las actividades en la web de la agenda.

Todo lo que cargues acá es lo que verá el público en la agenda. Seguí los pasos en orden.

---

## 1. Crear tu cuenta y workspace en Notion

1. Entrá a [notion.so](https://www.notion.so) desde el navegador (Chrome, Edge, Firefox, cualquiera).
2. Hacé clic en **"Get Notion free"** (o "Registrarse").
3. Elegí registrarte con tu cuenta de Google (recomendado) o con un email y contraseña.
4. Notion te va a pedir un nombre para tu "workspace" (espacio de trabajo). Poné algo como **"Cámara de Comercio CCIPS"**.
5. Elegí el plan **Personal (gratis)**. Es suficiente para empezar.
6. Listo. Ya tenés tu espacio de trabajo. Podés seguir desde la web o instalar la app de escritorio; es lo mismo.

> Tip: con una sola cuenta alcanza. La base de datos que armes la puede usar la Cámara entera más adelante (compartiendo la página).

---

## 2. Crear la base de datos "Actividades"

1. En la barra lateral izquierda, hacé clic en **"+ New page"** (Nueva página).
2. Poné de título **"Actividades"**.
3. Notion te muestra opciones para el contenido. Elegí **"Table"** (Tabla) o, si no aparece, buscá **"Table — Full page"**.
4. Confirmá. Ahora tenés una **base de datos** (una tabla) llamada "Actividades", con una columna vacía "Name".

Esa tabla va a contener **una fila por cada actividad** (curso, charla, evento, asamblea…). Cada columna es una "propiedad" que vamos a definir en el siguiente paso.

---

## 3. Definir las propiedades (columnas)

Las columnas de la tabla deben tener **exactamente** estos nombres y tipos, para que la web pueda leerlas. Notion trae por defecto una columna "Name" (título) y "Tags". Vamos a ajustarlas.

### 3.1. Renombrar el título

1. Hacé clic en el encabezado de la columna **"Name"**.
2. Elegí **"Rename"** y poné **"Nombre"**.
3. Su tipo es **Title** (no se cambia).

### 3.2. Agregar cada propiedad

Para agregar una columna:

1. Hacé clic en el **"+"** a la derecha de la última columna.
2. Elegí el tipo indicado abajo.
3. Escribí el **nombre exacto** de la propiedad.

Repetí para cada una. Podés borrar la columna "Tags" que viene por defecto (clic derecho en el encabezado → "Delete property").

| # | Nombre de la propiedad | Tipo en Notion | Cómo se usa | Equivale a |
|---|---|---|---|---|
| 1 | **Nombre** | Title | Título del evento | `nombre` |
| 2 | **Fecha** | Date | Día del evento. Ver 3.3 | `fecha` |
| 3 | **Hora** | Text | Hora de inicio, ej. "19:00" | `hora` |
| 4 | **Lugar** | Text | Dónde se hace. Vacío si es online | `lugar` |
| 5 | **Tipo** | Select | El tipo de actividad. Ver 3.4 | `tipo` |
| 6 | **Imagen** | Files & media | Una imagen para la tarjeta | `imagen` |
| 7 | **Descripción** | Text | Qué es, de qué trata | `descripcion` |
| 8 | **Link de inscripción** | URL | El enlace del formulario | `linkInscripcion` |
| 9 | **Ubicación** | URL | Link de Google Maps (opcional; muestra "Ver en mapa") | `ubicacion` |
| 10 | **Privado** | Checkbox | Marcado = no se muestra al público | `privado` |

### 3.3. La Fecha (importante)

La propiedad **Fecha** es de tipo **Date**. Al cargar una actividad, hacé clic en esa celda y elegí el día en el calendario. Si querés que también muestre la hora, Notion te deja **activar "Include time"** (incluir hora) dentro del selector de fecha.

> Recomendación simple: usá **Fecha (Date)** solo con el día, y la hora por separado en la columna **Hora** (texto, ej. "19:00"). Es lo más fácil de leer para la web y de completar a mano.

### 3.4. La propiedad Tipo (Select)

Al crear la columna **Tipo** como **Select**, agregá estas opciones **exactas** (sin acentos en la palabra, una opción por línea):

- Curso
- Charla
- Evento
- Asamblea
- Feria
- Reunión
- Otro

Para agregar opciones: creá la propiedad Select y, en cualquier fila, hacé clic en la celda → escribí el nombre → "Create 'Curso'". Repetí hasta tener las 7 opciones.

### 3.5. El `id` (identificador único de cada actividad)

La web necesita un `id` corto y sin espacios para cada actividad (por ejemplo `charla-impuestos`), porque con él se comparte el link directo de cada evento.

Tenés dos formas de manejarlo:

**Opción A (recomendada): una columna "ID" a mano.**
1. Agregá una propiedad de tipo **Text** llamada **"ID"**.
2. Al cargar cada actividad, escribí un identificador corto, en minúsculas, **sin espacios ni acentos**, usando guiones para separar palabras.
   - Ejemplos: `charla-impuestos`, `asamblea-2026`, `feria-emprendedores`, `curso-facturacion`.
3. No repitas nunca un ID entre dos actividades.

**Opción B (avanzada): generar el ID con una fórmula.**
Si preferís que se genere solo, agregá una propiedad de tipo **Formula** llamada **"ID"** y pegá esta fórmula:

```
replaceAll(replaceAll(replaceAll(replaceAll(lower(prop("Nombre")), " ", "-"), "á", "a"), "é", "e"), "í", "i")
```

Esta fórmula toma el Nombre, lo pasa a minúsculas y reemplaza espacios por guiones. No es perfecta con todos los acentos (podés extenderla), pero ahorra trabajo para nombres simples. **Verificá que el resultado no se repita** entre actividades.

> El conector tomará la columna "ID" como el `id`. Elegí **una** de las dos opciones y mantené siempre el mismo nombre de columna: **"ID"**.

---

## 4. Vista "Tablero" (tipo Trello) para el flujo de trabajo

El tablero sirve para saber en qué etapa está cada actividad: si está en preparación (**Borrador**), ya visible al público (**Publicada**) o terminada (**Finalizada**). Arrastrar una tarjeta de una columna a otra cambia su estado.

### 4.1. Agregar la propiedad de estado

1. Agregá una propiedad de tipo **Select** llamada **"Estado"**.
2. Creá estas opciones exactas: **Borrador**, **Publicada**, **Finalizada**.

### 4.2. Crear la vista Tablero

1. Arriba de la tabla, hacé clic en **"+ Add a view"** (Agregar una vista).
2. Elegí **"Board"** (Tablero).
3. Nombre de la vista: **"Tablero"**.
4. En el tablero, Notion pregunta qué propiedad usar como columnas. Elegí **"Estado"**.
5. Confirmá.

Ahora cada tarjeta es una actividad y cada columna es un estado. **Arrastrá** una tarjeta de "Borrador" a "Publicada" para publicarla, o a "Finalizada" cuando termine.

### 4.3. Alternar entre vistas

Arriba a la izquierda de la base podés cambiar entre la vista **Tabla** (para cargar datos) y **Tablero** (para mover el estado). Son la misma base; solo cambia cómo se ve.

---

## 5. Formulario de inscripción (base "Inscripciones")

El formulario permite que la gente se anote a una actividad. Va a escribir en una base separada llamada **"Inscripciones"**, relacionada con "Actividades".

### 5.1. Crear la base "Inscripciones"

1. Hacé clic en **"+ New page"** → título **"Inscripciones"** → elegí **"Table"**.
2. Borrá la columna "Tags" si querés.

### 5.2. Definir sus propiedades

| Nombre de la propiedad | Tipo en Notion |
|---|---|
| **Nombre** | Title |
| **Actividad** | Relation (→ Actividades) |
| **Apellido** | Text |
| **Teléfono** | Phone |
| **Email** | Email |

Para crear la **Actividad (Relation)**:
1. Agregá propiedad tipo **"Relation"**.
2. Notion te pregunta con qué base relacionarla. Elegí **"Actividades"**.
3. Confirmá. Ahora cada inscripción apunta a una actividad de la tabla "Actividades".

### 5.3. Crear la vista "Form"

1. En la base **Inscripciones**, hacé clic en **"+ Add a view"** → elegí **"Form"**.
2. Nombre: **"Formulario"**.
3. Notion muestra un formulario con los campos de las propiedades. Ajustá:
   - **Nombre** → obligatorio.
   - **Apellido** → obligatorio.
   - **Teléfono** → opcional.
   - **Email** → obligatorio.
   - **Actividad** → relación: dejá que la persona elija la actividad (Notion muestra la lista de "Actividades" para seleccionar).
4. Activá la casilla **"Require sign in"** solo si querés que se registren con cuenta de Notion; si no, dejalo sin marcar para que cualquiera complete el formulario.

### 5.4. Compartir el formulario (el link)

1. Con la vista **Form** abierta, hacé clic en **"Share"** (arriba a la derecha).
2. Activá **"Share to web"** (Compartir en la web).
3. Notion genera un enlace público. Ese es el **link de inscripción**.
4. Copiá ese link y pegalo en la columna **"Link de inscripción"** de la actividad correspondiente (paso 3.2, propiedad #8).

### 5.5. Confirmación por mail (opcional, con automatización + Gmail)

Para avisarle a la persona que su inscripción se registró:

1. Arriba a la derecha de la base **Inscripciones**, hacé clic en **"⋯"** → **"Automations"**.
2. Elegí **"New automation"**.
3. **Trigger (disparador):** "When a page is added" (cuando se agrega una página = una inscripción).
4. **Action (acción):** "Send an email" (enviar un email) → elegí **"Gmail"**.
5. Conectá tu cuenta de Gmail cuando lo pida.
6. Completá:
   - **To (Para):** la propiedad **Email** de la inscripción.
   - **Subject (Asunto):** "Inscripción recibida – CCIPS Pehuajó".
   - **Body (Cuerpo):** un texto corto de confirmación, por ejemplo:
     > "¡Gracias por inscribirte! Recibimos tu inscripción a la actividad. Te esperamos. Cámara de Comercio CCIPS Pehuajó."
7. Guardá y activá la automatización.

> La opción "Send an email" con Gmail está disponible en planes de pago. En el plan gratuito podés usar **"Send a notification"** (aviso interno en Notion) como alternativa simple, o saltear este paso.

---

## 6. Eventos privados y link directo

Un evento **privado** no aparece en la agenda pública de la web, pero igual se puede compartir su link directo a personas concretas.

### 6.1. Marcar una actividad como privada

1. En la actividad, marcá la casilla **Privado** (checkbox).
2. Listo: el conector la va a excluir de la lista pública automáticamente.

### 6.2. Compartir el link directo

1. En la misma actividad, copiá el valor de la columna **ID** (ej. `reunion-comision`).
2. El link directo de esa actividad en la web será:
   `https://TU-DOMINIO/#reunion-comision`
   (reemplazá `TU-DOMINIO` por la dirección real de la agenda y `reunion-comision` por el ID de tu actividad).
3. Enviá ese link por mail o WhatsApp solo a quienes corresponda. Quien lo abra verá la actividad, aunque no esté en la lista pública.

> **Importante:** la casilla "Privado" solo oculta la actividad de la lista pública. El link directo con el `#id` funciona siempre que el ID esté bien escrito y sin espacios.

---

## 7. Lista de verificación (qué debe tener cada actividad cargada)

Antes de pasar una actividad a **Publicada**, revisá que cumpla **todo** lo siguiente:

- [ ] **Nombre**: título claro y completo del evento.
- [ ] **ID**: corto, en minúsculas, sin espacios ni acentos, único (ej. `charla-impuestos`).
- [ ] **Fecha**: día correcto (formato AAAA-MM-DD).
- [ ] **Hora**: cargada si el evento tiene hora de inicio (ej. `19:00`).
- [ ] **Lugar**: cargado (o vacío a propósito si es online; en ese caso aclará "Online").
- [ ] **Tipo**: una de las 7 opciones exactas (Curso, Charla, Evento, Asamblea, Feria, Reunión, Otro).
- [ ] **Imagen**: una imagen representativa (opcional pero recomendado).
- [ ] **Descripción**: texto que explique de qué trata, para quién, duración, etc.
- [ ] **Link de inscripción**: el link del formulario (si corresponde inscribirse).
- [ ] **Privado**: marcado **solo si** no debe verse en la agenda pública.
- [ ] **Estado**: en "Publicada" cuando esté lista para mostrar, o "Borrador" mientras se prepara.

---

## Resumen rápido

1. **Cuenta** → creá tu workspace en notion.so.
2. **Base "Actividades"** → tabla con las 10 propiedades del paso 3 (Nombre, Fecha, Hora, Lugar, Tipo, Imagen, Descripción, Link de inscripción, Ubicación, Privado) + la columna **ID**.
3. **Tipo** → Select con 7 opciones exactas.
4. **ID** → columna de texto a mano (recomendado) o fórmula.
5. **Vista Tablero** → con la propiedad **Estado** (Borrador / Publicada / Finalizada); arrastrar cambia el estado.
6. **Base "Inscripciones"** → con relación a "Actividades" + vista **Form** compartida como link público.
7. **Confirmación por mail** → automatización opcional con Gmail.
8. **Privado** → checkbox que oculta de la agenda pública; el link directo usa el `#id`.

Con esto, el conector puede leer "Actividades" y generar la agenda pública automáticamente.
