#!/usr/bin/env node
/*
  ============================================================
  Sincroniza la base "Actividades" de Notion con la web.
  Genera dos archivos en la raíz del repositorio:
    - actividades.js   (datos para la landing)
    - agenda.ics       (feed de calendario suscripto)
  Lo ejecuta GitHub Actions automáticamente cada 15 minutos.

  Variables de entorno:
    NOTION_TOKEN         (obligatoria)  token de la integración de Notion
    NOTION_DATABASE_ID   (opcional)     id de la base "Actividades"
  ============================================================
*/

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.NOTION_TOKEN || "";
const DB_ID = process.env.NOTION_DATABASE_ID || "3fc854fe-4e5d-81a1-ad13-ca69cf62f675";

if (!TOKEN) { console.error("ERROR: falta la variable NOTION_TOKEN"); process.exit(1); }

const API = "https://api.notion.com/v1";
const NV = "2022-06-28";

async function notion(p, opts) {
  opts = opts || {};
  const res = await fetch(API + p, {
    method: opts.method || "GET",
    headers: Object.assign({
      "Authorization": "Bearer " + TOKEN,
      "Notion-Version": NV,
      "Content-Type": "application/json"
    }, opts.headers || {}),
    body: opts.body
  });
  const t = await res.text();
  if (!res.ok) throw new Error(res.status + " " + t);
  return JSON.parse(t);
}

async function fetchAll() {
  let out = [], cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notion("/databases/" + DB_ID + "/query", { method: "POST", body: JSON.stringify(body) });
    out = out.concat(data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}

const rt  = p => ((p && p.rich_text) || []).map(x => x.plain_text).join("").trim();
const ttl = p => ((p && p.title) || []).map(x => x.plain_text).join("").trim();
const slug = s => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "actividad";
const fileUrl = p => { const f = ((p && p.files) || [])[0]; if (!f) return ""; return f.type === "external" ? ((f.external || {}).url || "") : ((f.file || {}).url || ""); };

const pad = n => (n < 10 ? "0" : "") + n;
function parseDate(s) { const p = (s || "").split("-").map(Number); return new Date(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1); }
function addDays(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function addHours(d, n) { const x = new Date(d.getTime()); x.setHours(x.getHours() + n); return x; }
function fmtLocal(d) { return "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00"; }
function fmtDateOnly(d) { return "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
function fmtUTC(d) { return "" + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + "00Z"; }
function icsEsc(s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,"); }

async function downloadImage(url, id) {
  try {
    const r = await fetch(url);
    if (!r.ok) return "";
    const buf = Buffer.from(await r.arrayBuffer());
    const m = (url.split("?")[0].match(/\.(png|jpe?g|gif|webp|avif)$/i) || [])[1] || "jpg";
    const ext = m.toLowerCase().replace("jpeg", "jpg");
    const dir = "img";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const name = id + "." + ext;
    fs.writeFileSync(path.join(dir, name), buf);
    return "img/" + name;
  } catch (e) { return ""; }
}

async function main() {
  const pages = await fetchAll();
  const acts = [];

  for (const p of pages) {
    const pr = p.properties || {};
    const estado = ((pr["Estado"] || {}).select || {}).name || "";
    // Solo se publican las que están en "Publicada" o "Finalizada"
    if (estado !== "Publicada" && estado !== "Finalizada") continue;

    const nombre = ttl(pr["Nombre"]);
    if (!nombre) continue;

    const id = rt(pr["ID"]) || slug(nombre);
    const fecha = ((((pr["Fecha"] || {}).date) || {}).start || "").slice(0, 10);
    const hora = rt(pr["Hora"]);
    const lugar = rt(pr["Lugar"]);
    const tipo = ((pr["Tipo"] || {}).select || {}).name || "Otro";
    const descripcion = rt(pr["Descripción"]);
    const linkInscripcion = (pr["Link de inscripción"] || {}).url || "";
    const ubicacion = (pr["Ubicación"] || {}).url || "";
    const privado = !!(pr["Privado"] || {}).checkbox;

    let imagen = fileUrl(pr["Imagen"]);
    if (imagen) imagen = await downloadImage(imagen, id);

    acts.push({ id, nombre, fecha, hora, lugar, tipo, imagen, descripcion, linkInscripcion, ubicacion, privado });
  }

  acts.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));

  // 1) actividades.js
  fs.writeFileSync("actividades.js", "window.ACTIVIDADES = " + JSON.stringify(acts, null, 2) + ";\n");

  // 2) agenda.ics (solo públicas, para el calendario suscripto)
  const L = [];
  L.push("BEGIN:VCALENDAR");
  L.push("VERSION:2.0");
  L.push("PRODID:-//CCIPS Pehuajo//Agenda//ES");
  L.push("CALSCALE:GREGORIAN");
  L.push("METHOD:PUBLISH");
  L.push("X-WR-CALNAME:Agenda CCIPS Pehuajó");
  for (const a of acts) {
    if (a.privado || !a.fecha) continue;
    const d = parseDate(a.fecha);
    L.push("BEGIN:VEVENT");
    L.push("UID:" + a.id + "@ccipspehuajo.ar");
    L.push("DTSTAMP:" + fmtUTC(new Date()));
    if (a.hora) {
      const st = new Date(d.getTime());
      const hm = String(a.hora).split(":");
      st.setHours(Number(hm[0]) || 0, Number(hm[1]) || 0, 0, 0);
      L.push("DTSTART:" + fmtLocal(st));
      L.push("DTEND:" + fmtLocal(addHours(st, 1)));
    } else {
      L.push("DTSTART;VALUE=DATE:" + fmtDateOnly(d));
      L.push("DTEND;VALUE=DATE:" + fmtDateOnly(addDays(d, 1)));
    }
    L.push("SUMMARY:" + icsEsc(a.nombre));
    if (a.descripcion) L.push("DESCRIPTION:" + icsEsc(a.descripcion));
    if (a.lugar) L.push("LOCATION:" + icsEsc(a.lugar));
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  fs.writeFileSync("agenda.ics", L.join("\r\n") + "\r\n");

  console.log("OK: " + acts.length + " actividades sincronizadas (" + acts.filter(a => !a.privado).length + " públicas).");
}

main().catch(e => { console.error(e); process.exit(1); });
