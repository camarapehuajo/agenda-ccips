# Agenda CCIPS Pehuajó — Landing + Notion

Web de agenda linda que se alimenta de **Notion** mediante un conector (n8n / Make / Zapier).

## Archivos

| Archivo | Qué es |
|---------|--------|
| `index.html` | La landing (abrilo con doble click o subilo a tu hosting) |
| `actividades.js` | Los datos de las actividades. **Este lo genera el conector.** |
| `agenda.ics` | Feed de calendario con todos los eventos públicos. **Este también lo genera el conector.** |
| `logo` (incrustado) | El logo ya va embebido dentro de `index.html` |

## Cómo funciona

```
Notion (cargás en tablero) ──► Conector ──► actividades.js ──► index.html (landing)
                                  │
                                  └────► agenda.ics ──► suscripción Google / Apple
```

1. En Notion cargás las actividades en una base (vista tablero, tipo Trello).
2. El conector (n8n/Make/Zapier) lee Notion y **genera `actividades.js`** con el formato de abajo.
3. El conector **también genera `agenda.ics`**, un feed de calendario con todos los eventos públicos.
4. `index.html` lee `actividades.js` y arma la agenda sola; los botones "Suscribir calendario" apuntan a `agenda.ics`.

Vos solo tocás Notion. El conector corre solo (cada X minutos, o cuando algo cambia).

## Formato que debe generar el conector

El conector debe escribir un archivo de texto que empiece con:

```js
window.ACTIVIDADES = [ ... ];
```

Y adentro, por cada actividad de Notion:

```js
{
  id: "charla-impuestos",            // id único, sin espacios
  nombre: "Charla: Impuestos 2026",
  fecha: "2026-10-01",               // YYYY-MM-DD
  hora: "19:00",                     // opcional, "" si no hay
  lugar: "Salón de la Cámara",       // opcional
  tipo: "Charla",                    // Curso/Charla/Evento/Asamblea/Feria...
  imagen: "https://.../foto.jpg",    // url, o "" si no hay
  descripcion: "Texto...",           // opcional
  linkInscripcion: "https://...",    // url del formulario, o ""
  ubicacion: "https://maps.google.com/?q=...", // url de Google Maps, o ""
  privado: false                     // true = no aparece en la agenda (solo #id)
}
```

## Cómo armar el conector (n8n / Make / Zapier)

Lo importante es el **último paso**: que escriba el archivo `actividades.js`.

- **n8n (recomendado, gratis y self-host):**
  1. Nodo **Notion** → "Obtener base de datos" (trae las actividades).
  2. Nodo **Function/Code** → transforma a JSON con el formato de arriba.
  3. Nodo **Write File** (FTP/SSH) o **GitHub** → escribe `actividades.js` donde esté alojada la web.
  4. Programa el workflow (cada 5–15 min o por webhook).

- **Make:** mismo concepto: módulo Notion → transformar → subir por FTP/GitHub/Google Drive.

- **Zapier:** más limitado para generar archivos; conviene n8n o Make para este caso.

## Mapeo Notion → campos

| Propiedad en Notion | Campo en actividades.js |
|---------------------|------------------------|
| Nombre (título) | `nombre` |
| Fecha | `fecha` + `hora` |
| Lugar | `lugar` |
| Tipo (select) | `tipo` |
| Imagen (archivo) | `imagen` (url) |
| Descripción (texto) | `descripcion` |
| Link de inscripción (url) | `linkInscripcion` |
| Ubicación (url) | `ubicacion` |
| Solo CD (checkbox) | `privado` |

## Eventos privados

- En Notion marcás la casilla **Solo CD**.
- La actividad **no aparece** en la agenda pública.
- Se comparte con el link directo: `tusitio/#reunion-cd-privada` (el `id` de la actividad).

## Suscribirse al calendario (Google Calendar / Apple iOS)

La landing tiene, en la barra de herramientas, un botón **"📅 Suscribir calendario"** que despliega dos opciones:

- **📅 Google Calendar** — abre Google y suscribe el feed por URL.
- **📱 Apple / iOS** — abre la app Calendario con `webcal://` y suscribe.

Ambos usan el archivo `agenda.ics` que genera el conector (con todos los eventos públicos). La sincronización es **automática**: Google re-consulta el feed cada algunas horas, y iOS lo actualiza a diario, así que las actividades nuevas o editadas en Notion aparecen solas en los calendarios de quienes se suscribieron.

### Configurar la URL del feed

Arriba del todo del `<script>` de `index.html` hay una constante:

```js
var ICS_FEED = "https://TU-DOMINIO/agenda.ics";
```

Reemplazá `TU-DOMINIO` por el dominio real donde queda alojado `agenda.ics` (ej. `https://agenda.ccipspehuajo.ar/agenda.ics`). Mientras quede el placeholder `TU-DOMINIO`, los botones se muestran igual pero abren un link de ejemplo — reemplazalo antes de publicar.

> El `agenda.ics` debe estar en la **misma carpeta** que `index.html` (igual que `actividades.js`), y ser accesible por HTTPS.

## Dónde alojar la web

Cualquier hosting estático sirve (son solo 2 archivos):

- GitHub Pages (gratis)
- Netlify / Vercel (gratis)
- Una carpeta dentro de tu WordPress (ccipspehuajo.ar) servida como archivos estáticos
- Google Drive con un servicio que lo publique

> Tip: si querés tu dominio `ccipspehuajo.ar/agenda`, lo más prolijo es Netlify o Vercel apuntando al subdirectorio.
