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
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const TOKEN = process.env.NOTION_TOKEN || "";
const DB_ID = process.env.NOTION_DATABASE_ID || "3fc854fe-4e5d-81a1-ad13-ca69cf62f675";
const CONFIG_DB_ID = process.env.NOTION_CONFIG_DB_ID || "402854fe-4e5d-81c3-b1e0-f86333aff588";

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
function normalizarHora(h) {
  const s = String(h || "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{1,2})\s*[.:,hH]\s*(\d{2})/);
  if (m) return pad(Number(m[1])) + ":" + m[2];
  m = s.match(/^(\d{1,2})\s*(hs?|horas?)?$/i);
  if (m) return pad(Number(m[1])) + ":00";
  return s;
}
function addDays(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function addHours(d, n) { const x = new Date(d.getTime()); x.setHours(x.getHours() + n); return x; }
function fmtLocal(d) { return "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00"; }
function fmtDateOnly(d) { return "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
function fmtUTC(d) { return "" + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + "00Z"; }
function icsEsc(s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,"); }

// Escribe el archivo solo si el contenido cambió (evita commits vacíos).
function writeIfChanged(file, content) {
  try {
    if (fs.readFileSync(file, "utf8") === content) return false;
  } catch (e) { /* el archivo todavía no existe */ }
  fs.writeFileSync(file, content);
  return true;
}

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

async function fetchConfig() {
  try {
    const data = await notion("/databases/" + CONFIG_DB_ID + "/query", {
      method: "POST",
      body: JSON.stringify({ page_size: 1 })
    });
    const page = (data.results || [])[0];
    if (!page) return null;
    const pr = page.properties || {};
    return {
      page,
      clave: rt(pr["Clave"]),
      nombreCal: rt(pr["Nombre calendario"]) || "Agenda CD",
      tokenActual: rt(pr["Token calendario"])
    };
  } catch (e) {
    console.error("Configuración Agenda: " + e.message);
    return null;
  }
}

function normalizarClave(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Token público del calendario: hash de la clave. No expone la clave en el repo.
function tokenCalendario(clave) {
  return crypto.createHash("sha256").update("ccips-cd-cal:" + clave).digest("hex").slice(0, 24);
}

function buildICS(acts, editado, calName) {
  const L = [];
  L.push("BEGIN:VCALENDAR");
  L.push("VERSION:2.0");
  L.push("PRODID:-//CCIPS Pehuajo//Agenda//ES");
  L.push("CALSCALE:GREGORIAN");
  L.push("X-WR-CALNAME:" + icsEsc(calName));
  L.push("X-WR-TIMEZONE:America/Argentina/Buenos_Aires");
  L.push("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
  L.push("X-PUBLISHED-TTL:PT1H");
  for (const a of acts) {
    if (!a.fecha) continue;
    const d = parseDate(a.fecha);
    L.push("BEGIN:VEVENT");
    L.push("UID:" + a.id + "@ccipspehuajo.ar");
    // DTSTAMP estable: usa la última edición en Notion, no la hora de ejecución.
    const ultimaEdicion = editado.get(a.id);
    const stamp = ultimaEdicion ? new Date(ultimaEdicion) : parseDate(a.fecha);
    L.push("DTSTAMP:" + fmtUTC(stamp));
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
  return L.join("\r\n") + "\r\n";
}

// Cifra la agenda completa (públicas + privadas) con la clave de Notion.
// Sal y IV derivados del contenido: mismo contenido => mismo archivo (sin commits vacíos).
function encryptData(acts, clave) {
  const plain = JSON.stringify(acts);
  const salt = crypto.createHash("sha256").update("ccips-cd-salt:" + clave).digest().subarray(0, 16);
  const iv = crypto.createHash("sha256").update("ccips-cd-iv:" + clave + ":" + plain).digest().subarray(0, 12);
  const key = crypto.pbkdf2Sync(clave, salt, 200000, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    alg: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iter: 200000,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: data.toString("base64")
  }, null, 2) + "\n";
}

function deleteOldICS(keep) {
  if (!fs.existsSync("cd")) return;
  for (const f of fs.readdirSync("cd")) {
    if (f.toLowerCase().endsWith(".ics") && f !== keep) {
      fs.unlinkSync(path.join("cd", f));
    }
  }
}

async function updateNotionToken(config, token) {
  if (!config || config.tokenActual === token) return;
  await notion("/pages/" + config.page.id, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        "Token calendario": { rich_text: [{ type: "text", text: { content: token } }] }
      }
    })
  });
  config.tokenActual = token;
}

async function updateNotionClave(config, clave) {
  if (!config || config.clave === clave) return;
  await notion("/pages/" + config.page.id, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        "Clave": { rich_text: [{ type: "text", text: { content: clave } }] }
      }
    })
  });
  config.clave = clave;
}

async function main() {
  const [pages, config] = await Promise.all([fetchAll(), fetchConfig()]);
  const acts = [];
  const editado = new Map(); // id -> last_edited_time (para un DTSTAMP estable)

  for (const p of pages) {
    const pr = p.properties || {};
    const estado = ((pr["Estado"] || {}).select || {}).name || "";
    // Solo se publican las que están en "Publicada" o "Finalizada"
    if (estado !== "Publicada" && estado !== "Finalizada") continue;

    const nombre = ttl(pr["Nombre"]);
    if (!nombre) continue;

    const id = rt(pr["ID"]) || slug(nombre);
    editado.set(id, p.last_edited_time || "");
    const fecha = ((((pr["Fecha"] || {}).date) || {}).start || "").slice(0, 10);
    const hora = normalizarHora(rt(pr["Hora"]));
    const lugar = rt(pr["Lugar"]);
    const tipo = ((pr["Tipo"] || {}).select || {}).name || "Otro";
    const descripcion = rt(pr["Descripción"]);
    const linkInscripcion = (pr["Link de inscripción"] || {}).url || "";
    const ubicacion = (pr["Ubicación"] || {}).url || "";
    const privado = !!(((pr["Solo CD"] || {}).checkbox) || ((pr["Privado"] || {}).checkbox));
    const destacado = !!(pr["Destacado"] || {}).checkbox;

    let imagen = fileUrl(pr["Imagen"]);
    if (imagen) imagen = await downloadImage(imagen, id);

    acts.push({ id, nombre, fecha, hora, lugar, tipo, imagen, descripcion, linkInscripcion, ubicacion, privado, destacado });
  }

  acts.sort((a, b) =>
    (a.fecha || "").localeCompare(b.fecha || "") ||
    (a.hora || "99:99").localeCompare(b.hora || "99:99") ||
    (a.nombre || "").localeCompare(b.nombre || "", "es")
  );

  const publicActs = acts.filter(a => !a.privado);

  // 1) Datos públicos (la web pública no incluye las privadas)
  writeIfChanged("actividades.js", "window.ACTIVIDADES = " + JSON.stringify(publicActs, null, 2) + ";\n");
  writeIfChanged("actividades.json", JSON.stringify(publicActs, null, 2) + "\n");
  writeIfChanged("agenda.ics", buildICS(publicActs, editado, "Agenda CCIPS Pehuajó"));

  // 2) Agenda CD (públicas + privadas), cifrada para la web
  let clave = config ? String(config.clave || "").trim() : "";
  const nombreCal = config ? String(config.nombreCal || "Agenda CD").trim() : "Agenda CD";

  if (clave) {
    const normalizada = normalizarClave(clave);
    if (normalizada !== clave) {
      try {
        await updateNotionClave(config, normalizada);
      } catch (e) {
        console.error("No se pudo normalizar la Clave en Notion: " + e.message);
      }
    }
    clave = normalizada;
    if (clave.length < 6) {
      console.error("Configuración Agenda: la Clave quedó demasiado corta (mínimo 6). No se regeneró la agenda CD.");
      clave = "";
    }
  }

  if (clave) {
    fs.mkdirSync("cd", { recursive: true });
    const token = tokenCalendario(clave);
    const icsName = token + ".ics";

    writeIfChanged(path.join("cd", "agenda.enc.json"), encryptData(acts, clave));
    writeIfChanged(path.join("cd", "agenda.json"), JSON.stringify(acts, null, 2) + "\n");
    writeIfChanged(path.join("cd", icsName), buildICS(acts, editado, nombreCal));
    deleteOldICS(icsName);

    try {
      await updateNotionToken(config, token);
    } catch (e) {
      console.error("No se pudo actualizar Token calendario en Notion: " + e.message);
    }

    console.log("Agenda CD: " + acts.length + " actividades (" + acts.filter(a => a.privado).length + " privadas). Calendario: " + icsName);
  } else if (!config) {
    console.log("Agenda CD: no se encontró la base Configuración Agenda; no se regeneró.");
  } else {
    console.log("Agenda CD: falta una Clave válida en Notion; no se regeneró.");
  }

  console.log("OK: " + acts.length + " actividades sincronizadas (" + publicActs.length + " públicas).");

  // GitHub Actions: deja preparados los archivos de la agenda CD para el commit
  // que hace el workflow después de este script (no modificamos el workflow).
  if (process.env.GITHUB_ACTIONS === "true" && fs.existsSync("cd")) {
    try {
      execFileSync("git", ["add", "-A", "cd"], { stdio: "inherit" });
    } catch (e) {
      console.error("No se pudo preparar cd para el commit: " + e.message);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
