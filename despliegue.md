# Guía de despliegue — Agenda CCIPS Pehuajó

Esta guía explica, paso a paso y sin asumir que sabés de código ni de DNS, cómo:

1. Importar y configurar el conector en **n8n** (gratis, self-hosted).
2. Hacer lo mismo con **Make** (alternativa sin JSON).
3. Alojar la web (`index.html` + `actividades.js`) en **GitHub Pages** o **Netlify**, y ponerla en un subdominio de `ccipspehuajo.ar`.
4. Asegurar que el conector escriba `actividades.js` en el mismo lugar que `index.html`.
5. Checklist de puesta en producción.

---

## Antes de empezar — qué necesitás

- Una cuenta de **Notion** con la base **"Actividades"** ya creada (con las columnas: Nombre, Fecha, Lugar, Imagen, Tipo, Privado, Link de inscripción, y —opcionales— Descripción y Ubicación).
- Una **integración interna de Notion** (es el "token" que usa el conector para leer tu base). Es gratis.
- Una cuenta de **GitHub** (gratis) si vas a usar GitHub Pages, **o** una cuenta de **Netlify**.
- (Opcional) Acceso al panel DNS de `ccipspehuajo.ar` para el subdominio.

---

## 1. Conector con n8n (self-hosted gratis)

n8n es una herramienta de automatización. La versión "self-hosted" la instalás en tu propia máquina o servidor y no pagás nada.

### 1.1 Crear la integración de Notion (el "token")

1. Andá a https://www.notion.so/my-integrations → botón **"New integration"** (Nueva integración).
2. Nombre: `Agenda CCIPS`. Workspace: el de la Cámara. Type: **Internal**.
3. Anotá el **Internal Integration Token** que te muestra (empieza con `secret_` o `ntn_`). Es tu "token". Guardalo en un lugar seguro.
4. Volvé a Notion, abrí tu base **"Actividades"**, botón `...` (arriba a la derecha) → **Connections / Conectar con** → seleccioná la integración `Agenda CCIPS`. Esto le da permiso para leer esa base.
5. Anotá el **ID de la base**: abrí la base en el navegador, la URL es algo como `https://www.notion.so/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX?v=...`. El `database_id` es ese bloque de 32 caracteres **antes del `?`**.

### 1.2 Instalar n8n

Opción más simple (si tenés Docker en la PC/servidor):

```bash
docker run -d --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
```

Después abrí `http://localhost:5678` en el navegador y creá tu usuario.

> También podés usar el plan cloud de n8n (n8n.io) con 5 workflows gratis, sin instalar nada.

### 1.3 Importar el workflow

1. En n8n, andá a **Workflows** → **Import from File**.
2. Elegí el archivo `n8n-workflow.json` de este proyecto.
3. Te aparece un workflow con 6 nodos en línea (más 3 notas amarillas de ayuda).

### 1.4 Configurar la credencial de Notion

1. Hacé click en el nodo **"Notion - Obtener actividades"**.
2. En el campo **Credential / Credencial**, elegí **"Create new"** → **Notion API**.
3. Pegá el **token** de la integración (el de `secret_...` o `ntn_...`).
4. En el campo **Database ID** del nodo, pegá el `database_id` de tu base (reemplazá `REEMPLAZAR_AQUI_DATABASE_ID`).

### 1.5 Configurar GitHub (token, repo y ruta)

1. Abrí el nodo **"Transformar filas a actividades.js"** (es el bloque de código).
2. Arriba del código hay un bloque `CONFIG`. Reemplazá los 4 valores:
   - `githubToken`: un **token de GitHub** con permiso de escritura. Creálo en GitHub → *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate*. Elegí **solo tu repo** y marcá el permiso **Contents → Read and write**.
   - `githubOwner`: tu usuario u organización (ej: `ccipspehuajo`).
   - `githubRepo`: el nombre del repo (ej: `agenda-web`).
   - `githubPath`: la ruta del archivo **dentro** del repo (normalmente `actividades.js`).
3. Guardá el nodo.

### 1.6 Probar y activar

1. Botón **"Execute workflow"** (Ejecutar) arriba a la derecha. Mirá que todos los nodos queden en verde.
2. Entrá a tu repo en GitHub y verificá que `actividades.js` se haya subido con el contenido `window.ACTIVIDADES = [...]`.
3. Activalo con el interruptor **Active** (arriba). Desde ahora corre solo cada 15 minutos.

---

## 2. Alternativa con Make (sin JSON)

Make (ex Integromat) se arma con "módulos" visuales, sin importar archivos. La lógica es idéntica:

1. **Trigger**: módulo **Tools → Basic trigger → "Run once"** o **Schedule / Scheduler** (cada 15 min).
2. **Leer Notion**: módulo **Notion → Search objects** (o "List database items"). Elegí tu base "Actividades". Make pide que conectes tu cuenta de Notion (usa la misma integración interna de la sección 1.1).
3. **Transformar**: módulo **Tools → Set variable** o un **"Iterator + Array aggregator"**. Necesitás armar el texto del archivo. Lo más simple es usar el módulo **HTTP → Make a request** contra la API de GitHub (como en n8n) y armar el JSON con la función `JSON.stringify` desde un **"Data store"** o un módulo **"Tools → Text parser → Compose a string"**.
4. **Subir a GitHub**: módulo **HTTP → Make a request**:
   - Método `PUT`.
   - URL `https://api.github.com/repos/USUARIO/REPO/contents/actividades.js`.
   - Header `Authorization: Bearer TU_TOKEN`.
   - Body JSON: `{ "message": "update", "content": "<base64 del archivo>", "branch": "main" }`.
   - Para el `base64`, usá la función `base64(...)` de Make sobre el texto armado.
   - Para actualizar (no solo crear), primero consultás el archivo con un `GET` y reutilizás el `sha` que devuelve (igual que en n8n).

> Make es más visual que n8n para quien no toca código, pero armar el `actividades.js` como texto requiere algunos pasos extra con la API de GitHub. Si podés, quedate con n8n.

---

## 3. Alojar la web

La web son solo **dos archivos**: `index.html` y `actividades.js`. Cualquier hosting estático sirve.

### 3.1 GitHub Pages (gratis, paso a paso)

1. Creá un repositorio público en GitHub (ej: `agenda-web`).
2. Subí `index.html` a la raíz del repo (botón **Add file → Upload files**, o arrastrá el archivo).
3. Andá a **Settings → Pages**.
4. En **Source**, elegí **Deploy from a branch**, rama **main**, carpeta **/ (root)**. Guardá.
5. Esperá 1–2 minutos. Te da una URL tipo `https://TUUSUARIO.github.io/agenda-web/`.
6. Verificá que cargue la agenda. (Si todavía no corriste el conector, `actividades.js` no existe y la agenda sale vacía — es normal. Corré el conector una vez y listo.)

### 3.2 Netlify (drag & drop)

1. Entrá a https://app.netlify.com/drop.
2. Arrastrá la **carpeta `web`** completa (que contiene `index.html` y `actividades.js`).
3. Netlify publica al instante y te da una URL tipo `https://algo-random.netlify.app`.
4. Si querés actualizarlo, arrastrá de nuevo los archivos, o conectá tu repo de GitHub (opción "Import from Git") para que se publique solo en cada cambio.

### 3.3 Subdominio `agenda.ccipspehuajo.ar`

Un subdominio es "una dirección más" de tu dominio. No comprás nada nuevo, solo apuntás un nombre al servidor donde está la web.

**Qué significa "apuntar" (en simple):** el dominio es un cartel de calle; el DNS es la guía que dice "la calle `agenda.ccipspehuajo.ar` está en tal servidor". Para que `agenda.ccipspehuajo.ar` muestre tu web, le decís al DNS a qué servidor ir.

**Paso a paso (con GitHub Pages):**

1. En el panel de tu dominio (donde contrataste `ccipspehuajo.ar`), andá a la sección **DNS** / **Zonas DNS**.
2. Creá un registro de tipo **CNAME**:
   - Nombre/Host: `agenda`
   - Valor/Destino: `TUUSUARIO.github.io`
3. En GitHub, en **Settings → Pages → Custom domain**, escribí `agenda.ccipspehuajo.ar` y guardá.
4. Esperá a que se propague (5 min a 24 h, normalmente minutos).
5. Activá **Enforce HTTPS** en GitHub Pages para que tenga candado (tarda unos minutos en emitir el certificado).

**Paso a paso (con Netlify):**

1. En Netlify → tu sitio → **Domain settings → Add custom domain** → escribí `agenda.ccipspehuajo.ar`.
2. Netlify te dice qué registro DNS crear (normalmente un **CNAME** `agenda` → `TU-sitio.netlify.app`).
3. Creá ese CNAME en el panel DNS de tu dominio.
4. Netlify emite el certificado HTTPS solo.

**¿Y si quiero `ccipspehuajo.ar/agenda` (un subdirectorio, no subdominio)?**

- Es más simple a veces: en Netlify podés hacer *redirects*, o directamente publicás la carpeta bajo una ruta. Lo más prolijo y recomendado para una web separada es el **subdominio** (`agenda.ccipspehuajo.ar`), porque la agenda queda en su propio hosting estático sin tocar el WordPress del sitio principal.
- Si el sitio principal de la Cámara está en WordPress, también podés **subir `index.html` y `actividades.js` por FTP a una carpeta** del servidor (ej: `/public_html/agenda/`), y la URL queda `ccipspehuajo.ar/agenda/`. En ese caso leé la sección 4 (FTP).

---

## 4. Que el conector escriba `actividades.js` en el MISMO lugar que `index.html`

Regla de oro: **el conector debe escribir el archivo `actividades.js` exactamente donde está `index.html`**, porque el HTML lo carga con `<script src="actividades.js"></script>` (misma carpeta).

| Cómo alojás la web | Dónde tiene que escribir el conector |
|---|---|
| GitHub Pages | En el repo, en la misma carpeta que `index.html`. En el workflow de n8n, el `githubPath` debe ser `actividades.js` (o `carpeta/actividades.js` si `index.html` está en `carpeta/`). |
| Netlify | Dos opciones: (a) conectá el repo de GitHub a Netlify y usá el mismo `githubPath`; el push a `main` redeposita solo. (b) Si subís por drag & drop, usá la **API de Netlify** o **Deploy hooks** (Netlify → Site settings → Build & deploy → Deploy notifications). |
| FTP (subdirectorio en WordPress) | Cambiá los nodos de GitHub por un nodo **FTP** de n8n (o **SSH**), apuntando a `/public_html/agenda/actividades.js`. |

**Lo importante para GitHub Pages:** como la web se publica desde el repo, si el conector escribe `actividades.js` en la rama `main`, la página se actualiza sola en 1–2 minutos. No hay que tocar nada más.

### 4.1 El feed `agenda.ics` (suscripción Google / iOS)

Además de `actividades.js`, el conector debe **subir un segundo archivo: `agenda.ics`**, en la misma carpeta que `index.html`. Es un feed de calendario (formato ICS) con todos los eventos públicos, y es lo que usan los botones "Suscribir calendario" de la landing.

- Se genera en el mismo nodo de código que `actividades.js` (armando el texto ICS a partir de las actividades de Notion) y se sube con el mismo método (GitHub/FTP) a la misma ruta.
- La landing apunta a ese feed mediante la constante `ICS_FEED` (arriba del `<script>` de `index.html`):

  ```js
  var ICS_FEED = "https://TU-DOMINIO/agenda.ics";
  ```

  Reemplazá `TU-DOMINIO` por la URL real de `agenda.ics` (ej. `https://agenda.ccipspehuajo.ar/agenda.ics`).
- La sincronización es automática en el lado del usuario: **Google Calendar** re-consulta el feed cada algunas horas, y **Apple/iOS** lo actualiza a diario. No hace falta que nadie vuelva a suscribirse ante cada cambio.

**Para GitHub Pages / Netlify:** igual que `actividades.js`, el `agenda.ics` se publica automáticamente al subirse al repo o al deploy, y `ICS_FEED` apunta a esa URL pública (ej. `https://TUUSUARIO.github.io/agenda-web/agenda.ics`).

---

## 5. Checklist de puesta en producción

- [ ] Base **"Actividades"** creada en Notion con las columnas correctas (Nombre, Fecha, Lugar, Imagen, Tipo, Privado, Link de inscripción, Descripción, Ubicación).
- [ ] Integración interna de Notion creada y **conectada** a la base (permiso de lectura).
- [ ] Anotados: token de Notion y `database_id`.
- [ ] Token de GitHub creado con permiso **Contents: read/write** (solo ese repo).
- [ ] Repo de GitHub creado y con `index.html` subido.
- [ ] Workflow de n8n importado y con: credencial Notion, `database_id`, y los 4 valores de `CONFIG` (token GitHub, dueño, repo, ruta).
- [ ] Ejecución de prueba en verde, y `actividades.js` visible en el repo con `window.ACTIVIDADES = [...]`.
- [ ] `agenda.ics` visible junto a `actividades.js` (el feed para la suscripción de calendario).
- [ ] Constante `ICS_FEED` de `index.html` apuntando a la URL real de `agenda.ics` (sin el placeholder `TU-DOMINIO`).
- [ ] Workflow en estado **Active** (corre solo cada 15 min).
- [ ] Web publicada (GitHub Pages / Netlify) y cargando la agenda con datos.
- [ ] Subdominio `agenda.ccipspehuajo.ar` apuntado (CNAME) y con **HTTPS** activo.
- [ ] Prueba de evento **privado**: en Notion marcá una actividad como Privado → no aparece en la agenda, pero sí en su link directo `/#<id>`.
- [ ] Prueba de cambio: editá una actividad en Notion, esperá ≤15 min, verificá que se refleje en la web.
- [ ] (Recomendado) Un segundo administrador con acceso al workflow y a los tokens, para no depender de una sola persona.

---

### Resumen de archivos

| Archivo | Qué es |
|---|---|
| `n8n-workflow.json` | Workflow de n8n listo para importar (Notion → actividades.js → GitHub). |
| `index.html` | La landing (ya está). |
| `actividades.js` | Los datos (lo genera el conector; no editar a mano). |
| `agenda.ics` | Feed de calendario para suscripción (lo genera el conector; no editar a mano). |
| `despliegue.md` | Esta guía. |
