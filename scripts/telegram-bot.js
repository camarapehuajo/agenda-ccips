#!/usr/bin/env node
/*
  ============================================================
  Bot de Telegram -> IA -> confirmación -> Notion
  1) Interpreta el mensaje y te muestra el resumen.
  2) Si respondés corrigiendo, ACTUALIZA el borrador (no crea otro).
  3) Con ✅ lo carga en Notion (Borrador); con ❌ lo descarta.

  Variables de entorno:
    TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, NOTION_TOKEN
    NOTION_DATABASE_ID (opcional), ALLOWED_TELEGRAM_IDS (opcional)
  ============================================================
*/

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, execSync } = require("child_process");
const TG = process.env.TELEGRAM_BOT_TOKEN || "";
const NOTION = process.env.NOTION_TOKEN || "";
const GEMINI = process.env.GEMINI_API_KEY || "";
const DB = process.env.NOTION_DATABASE_ID || "3fc854fe-4e5d-81a1-ad13-ca69cf62f675";
const ALLOWED = (process.env.ALLOWED_TELEGRAM_IDS || "").split(",").map(s => s.trim()).filter(Boolean);

if (!TG) { console.error("ERROR: falta TELEGRAM_BOT_TOKEN"); process.exit(1); }
if (!NOTION) { console.error("ERROR: falta NOTION_TOKEN"); process.exit(1); }

const TGAPI = "https://api.telegram.org/bot" + TG;
const PEND = "pendientes.json";

function cargarPend() { try { return JSON.parse(fs.readFileSync(PEND, "utf8")); } catch (e) { return {}; } }
function guardarPend(o) { fs.writeFileSync(PEND, JSON.stringify(o, null, 2) + "\n"); }
function draftDeChat(pend, chatId) {
  for (const k of Object.keys(pend)) { if (String(pend[k].chat) === String(chatId)) return k; }
  return null;
}

async function tg(method, payload) {
  const res = await fetch(TGAPI + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  return res.json();
}
async function getMe() {
  const res = await fetch(TGAPI + "/getMe");
  const d = await res.json();
  if (!d.ok) throw new Error("getMe: " + d.error_code + " " + d.description);
  return d.result;
}
async function getUpdates(offset) {
  const res = await fetch(TGAPI + "/getUpdates" + (offset != null ? "?offset=" + offset : ""));
  const d = await res.json();
  if (!d.ok) throw new Error("getUpdates: " + d.error_code + " " + d.description);
  return d.result || [];
}
function autorizado(msg) {
  if (ALLOWED.length === 0) return true;
  const uid = String(msg.from && msg.from.id);
  const cid = String(msg.chat && msg.chat.id);
  return ALLOWED.includes(uid) || ALLOWED.includes(cid);
}

/* ---------- Leer links y PDFs ---------- */
function extraerPdf(buf) {
  const tmp = path.join(os.tmpdir(), "ccips-" + Date.now() + "-" + Math.floor(Math.random() * 10000) + ".pdf");
  fs.writeFileSync(tmp, buf);
  try {
    let txt = "";
    try {
      txt = execFileSync("pdftotext", ["-layout", tmp, "-"], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
    } catch (e) {
      execSync("sudo apt-get update -qq && sudo apt-get install -y -qq poppler-utils", { stdio: "ignore" });
      txt = execFileSync("pdftotext", ["-layout", tmp, "-"], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
    }
    return String(txt || "").trim().slice(0, 12000);
  } catch (e) {
    console.error("No pude extraer el PDF: " + e.message);
    return "";
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
}

async function textoDeDocumento(doc) {
  if (!doc || !/pdf/i.test(doc.mime_type || "")) return "";
  try {
    const f = await tg("getFile", { file_id: doc.file_id });
    if (!f.ok) {
      console.error("Telegram getFile: " + f.error_code + " " + f.description);
      return "";
    }
    const r = await fetch("https://api.telegram.org/file/bot" + TG + "/" + f.result.file_path);
    if (!r.ok) return "";
    const buf = Buffer.from(await r.arrayBuffer());
    return extraerPdf(buf);
  } catch (e) {
    console.error("PDF: " + e.message);
    return "";
  }
}

async function textoDeLink(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AgendaCCIPS/1.0)" } });
    if (!r.ok) return "";
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/pdf") || /\.pdf(\?|#|$)/i.test(url)) {
      const buf = Buffer.from(await r.arrayBuffer());
      const pdf = extraerPdf(buf);
      return pdf ? "[PDF]\n" + pdf : "";
    }
    const html = await r.text();
    const ogT = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || [])[1] || "";
    const ogD = (html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i) || [])[1] || "";
    let t = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    return [ogT, ogD].filter(Boolean).join(" — ") + "\n" + t.slice(0, 6000);
  } catch (e) { return ""; }
}

/* ---------- IA ---------- */
async function aiExtract(texto, anterior) {
  const hoy = new Date();
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const fechaHoy = hoy.toISOString().slice(0, 10) + " (" + dias[hoy.getDay()] + ")";

  const links = texto.match(/https?:\/\/[^\s]+/g) || [];
  let contextoLink = "";
  for (const l of links.slice(0, 2)) {
    const t = await textoDeLink(l);
    if (t) contextoLink += "\n\n[Contenido del link " + l + "]\n" + t;
  }

  const esquema =
    "Devolvé SOLO un objeto JSON válido, sin texto extra, con estas claves:\n" +
    '- "nombre": título claro y corto (string)\n' +
    '- "fecha": YYYY-MM-DD (string; "" si no se puede determinar)\n' +
    '- "hora": HH:MM de inicio (string; "" si no)\n' +
    '- "lugar": lugar (string; "" si no)\n' +
    '- "tipo": "Curso","Charla","Evento","Asamblea","Feria","Reunión" u "Otro"\n' +
    '- "descripcion": 1 a 3 oraciones con el detalle (string; "" si no hay)\n' +
    '- "linkInscripcion": link para anotarse, si hay (string; "" si no)\n';

  const sistema =
    "Sos el asistente de la Agenda de la Cámara de Comercio, Industria, Producción y Servicios de Pehuajó (CCIPS). " +
    "Interpretás mensajes (informales, cortados, con links) para armar los datos de UNA actividad. " +
    "No seas literal: entendé la intención. No inventes datos que no surjan del texto. " +
    "Si te paso DATOS ACTUALES y una CORRECCIÓN, devolvés esos datos actualizados (no una actividad nueva).";

  let usuario;
  if (anterior) {
    usuario = "Hoy es " + fechaHoy + ".\n" +
      "DATOS ACTUALES de la actividad (JSON):\n" + JSON.stringify(anterior) + "\n\n" +
      "El usuario está corrigiendo o agregando esto:\n\"\"\"\n" + texto + "\n\"\"\"\n\n" +
      "Devolvé el JSON ACTUALIZADO (mismas claves) aplicando los cambios. Lo que no se menciona, dejalo igual.\n" + esquema;
  } else {
    usuario = "Hoy es " + fechaHoy + ". Usá esa fecha para expresiones relativas ('el jueves', 'la semana que viene', 'el 5/11', 'mañana').\n" +
      esquema + "\nMensaje:\n\"\"\"\n" + texto + "\n\"\"\"" + contextoLink;
  }

  if (!GEMINI) throw new Error("La IA no está configurada (falta GEMINI_API_KEY).");
  let out = "", errores = [];
  const modelos = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-flash-latest"];
  for (const mo of modelos) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + mo + ":generateContent?key=" + GEMINI, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ parts: [{ text: usuario }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
      })
    });
    const d = await res.json();
    if (d && d.candidates && d.candidates[0]) {
      out = (((d.candidates[0].content || {}).parts || [])[0] || {}).text || "";
      console.log("Gemini: " + mo);
      break;
    }
    const err = (d && d.error) || d;
    const msg = (err && (err.message || JSON.stringify(err))) || "sin respuesta";
    errores.push(mo + ": " + String(msg).slice(0, 160));
    console.error("Gemini " + mo + ": " + String(msg).slice(0, 200));
  }
  if (!out) throw new Error("Gemini: " + errores.join(" | ").slice(0, 500));

  const m = out.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("La IA no devolvió JSON: " + out.slice(0, 150));
  return JSON.parse(m[0]);
}

/* ---------- Notion ---------- */
const slug = s => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "actividad";

async function crearEnNotion(a) {
  const props = {};
  const rt = v => ({ rich_text: [{ text: { content: String(v) } }] });
  props["Nombre"] = { title: [{ text: { content: a.nombre || "Actividad" } }] };
  if (a.fecha) props["Fecha"] = { date: { start: a.fecha } };
  if (a.hora) props["Hora"] = rt(a.hora);
  if (a.lugar) props["Lugar"] = rt(a.lugar);
  props["Tipo"] = { select: { name: a.tipo || "Otro" } };
  if (a.descripcion) props["Descripción"] = rt(a.descripcion);
  if (a.linkInscripcion) props["Link de inscripción"] = { url: a.linkInscripcion };
  props["ID"] = rt(a.id || slug(a.nombre));
  props["Estado"] = { select: { name: "Borrador" } };

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: { "Authorization": "Bearer " + NOTION, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: JSON.stringify({ parent: { database_id: DB }, properties: props })
  });
  const d = await res.json();
  if (!res.ok) throw new Error("Notion: " + JSON.stringify(d));
  return d;
}

function resumenDe(datos) {
  return [
    "📋 *Esto entendí:*", "",
    "📌 " + (datos.nombre || "(sin título)"),
    datos.fecha ? "📅 " + datos.fecha + (datos.hora ? "  🕐 " + datos.hora : "") : "📅 (no detecté la fecha)",
    datos.lugar ? "📍 " + datos.lugar : "",
    datos.tipo ? "🏷️ " + datos.tipo : "",
    datos.linkInscripcion ? "🔗 " + datos.linkInscripcion : "",
    datos.descripcion ? "\n📝 " + datos.descripcion : ""
  ].filter(Boolean).join("\n");
}

async function mostrarBorrador(chatId, key, datos) {
  const resumen = resumenDe(datos);
  await tg("sendMessage", {
    chat_id: chatId,
    text: resumen + "\n\n¿La cargo en Notion?",
    parse_mode: "Markdown",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[
      { text: "✅ Sí, cargar en Notion", callback_data: "ok:" + key },
      { text: "❌ No", callback_data: "no:" + key }
    ]] }
  });
}

/* ---------- main ---------- */
async function main() {
  const me = await getMe();
  console.log("Bot: @" + me.username);
  const updates = await getUpdates();
  const pend = cargarPend();
  let cambio = false;

  if (updates.length === 0) { console.log("Sin mensajes nuevos."); return; }
  console.log("Updates recibidos: " + updates.length);
  const maxId = Math.max(...updates.map(u => u.update_id));

  for (const u of updates) {
    /* --- Botón --- */
    if (u.callback_query) {
      const cq = u.callback_query;
      const data = cq.data || "";
      const chatId = cq.message.chat.id;
      const mid = cq.message.message_id;
      await tg("answerCallbackQuery", { callback_query_id: cq.id });
      const key = data.slice(data.indexOf(":") + 1);
      const p = pend[key];

      if (data.startsWith("ok:")) {
        if (!p) { await tg("sendMessage", { chat_id: chatId, text: "⚠️ Ese borrador ya no está. Mandá el mensaje de nuevo." }); continue; }
        try {
          p.datos.id = slug(p.datos.nombre);
          await crearEnNotion(p.datos);
          delete pend[key]; cambio = true;
          await tg("editMessageText", { chat_id: chatId, message_id: mid, text: p.resumen + "\n\n✅ *¡Cargada en Notion!* (quedó como Borrador)", parse_mode: "Markdown" });
        } catch (e) {
          await tg("sendMessage", { chat_id: chatId, text: "⚠️ No pude cargarla: " + String(e.message).slice(0, 200) });
        }
      } else if (data.startsWith("no:")) {
        if (p) { delete pend[key]; cambio = true; }
        await tg("editMessageText", { chat_id: chatId, message_id: mid, text: "❌ Cancelado. Mandá el mensaje de nuevo si querés.", parse_mode: "Markdown" });
      }
      continue;
    }

    /* --- Texto --- */
    const msg = u.message || u.edited_message;
    if (!msg) continue;
    const chatId = msg.chat.id;
    let texto = (msg.text || msg.caption || "").trim();
    if (!texto && !msg.document) continue;

    if (texto === "/start" || texto === "/help" || texto.toLowerCase() === "ayuda") {
      await tg("sendMessage", { chat_id: chatId, text:
        "👋 Soy el bot de la Agenda de CCIPS Pehuajó.\n\n" +
        "Mandame la info de una actividad (texto informal, datos sueltos, un link o un PDF). Te muestro lo que entendí y, si confirmás, la cargo en Notion.\n\n" +
        "Si algo está mal, respondé corrigiendo (ej: «la fecha es el 22 y el lugar es el salón») y te vuelvo a mostrar el resumen." });
      continue;
    }
    if (!autorizado(msg)) { await tg("sendMessage", { chat_id: chatId, text: "⛔ No autorizado." }); continue; }

    if (msg.document) {
      const esPdf = /pdf/i.test(msg.document.mime_type || "");
      if (esPdf) {
        await tg("sendMessage", { chat_id: chatId, text: "📄 Leyendo el PDF…" });
        const pdf = await textoDeDocumento(msg.document);
        if (pdf) {
          texto = (texto + "\n\n[Contenido del PDF]\n" + pdf).trim();
        } else if (!texto) {
          await tg("sendMessage", { chat_id: chatId, text: "⚠️ No pude leer el PDF. ¿Es un PDF escaneado? Probá con un PDF que tenga texto o mandame los datos escritos." });
          continue;
        } else {
          await tg("sendMessage", { chat_id: chatId, text: "⚠️ No pude leer el PDF; uso el texto que mandaste." });
        }
      } else if (!texto) {
        await tg("sendMessage", { chat_id: chatId, text: "Por ahora puedo leer texto, links y PDF. Mandame la info escrita o un PDF." });
        continue;
      }
    }
    if (!texto) continue;

    // ¿Hay un borrador pendiente en este chat? -> es una corrección
    const existente = draftDeChat(pend, chatId);
    const anterior = existente ? pend[existente].datos : null;

    await tg("sendMessage", { chat_id: chatId, text: anterior ? "✏️ Actualizando los datos…" : "🤖 Leyendo e interpretando…" });

    try {
      const datos = await aiExtract(texto, anterior);
      if (existente) delete pend[existente];
      const key = "p" + Date.now() + Math.floor(Math.random() * 1000);
      pend[key] = { chat: chatId, datos: datos };
      pend[key].resumen = resumenDe(datos);
      cambio = true;
      await mostrarBorrador(chatId, key, datos);
    } catch (e) {
      await tg("sendMessage", { chat_id: chatId, text: "⚠️ No pude interpretarlo. Probá describiendo qué es, cuándo y dónde.\n\n(Detalle: " + String(e.message).slice(0, 200) + ")" });
    }
  }

  // limpiar borradores viejos (> 2 días)
  const limite = Date.now() - 2 * 24 * 60 * 60 * 1000;
  for (const k of Object.keys(pend)) {
    const t = parseInt(String(k).replace(/^p/, ""), 10);
    if (t && t < limite) { delete pend[k]; cambio = true; }
  }

  await getUpdates(maxId + 1);
  if (cambio) guardarPend(pend);
  console.log("Listo. Borradores pendientes: " + Object.keys(pend).length);
}

main().catch(e => { console.error(e); process.exit(1); });
