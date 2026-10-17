#!/usr/bin/env node
/*
  ============================================================
  Bot de Telegram -> IA -> confirmación -> Notion
  1) Leé el mensaje, lo interpreta con IA.
  2) Te lo muestra y pide confirmación (botones ✅ / ❌).
  3) Si confirmás, crea la actividad en Notion (Borrador).

  Variables de entorno:
    TELEGRAM_BOT_TOKEN      (obligatoria)
    GEMINI_API_KEY          (obligatoria) clave de Google Gemini
    NOTION_TOKEN            (obligatoria)
    NOTION_DATABASE_ID      (opcional)
    ALLOWED_TELEGRAM_IDS    (opcional) ids autorizados, separados por coma
  ============================================================
*/

const fs = require("fs");
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

async function tg(method, payload) {
  const res = await fetch(TGAPI + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  return res.json();
}

async function getUpdates(offset) {
  const url = TGAPI + "/getUpdates" + (offset != null ? "?offset=" + offset : "");
  const res = await fetch(url);
  const d = await res.json();
  return d.result || [];
}

function autorizado(msg) {
  if (ALLOWED.length === 0) return true;
  const uid = String(msg.from && msg.from.id);
  const cid = String(msg.chat && msg.chat.id);
  return ALLOWED.includes(uid) || ALLOWED.includes(cid);
}

/* ---------- Traer el texto de un link ---------- */
async function textoDeLink(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AgendaCCIPS/1.0)" } });
    if (!r.ok) return "";
    const html = await r.text();
    const ogT = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || [])[1] || "";
    const ogD = (html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i) || [])[1] || "";
    let t = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    return [ogT, ogD].filter(Boolean).join(" — ") + "\n" + t.slice(0, 2500);
  } catch (e) { return ""; }
}

/* ---------- IA: interpretar ---------- */
async function aiExtract(texto) {
  const hoy = new Date();
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const fechaHoy = hoy.toISOString().slice(0, 10) + " (" + dias[hoy.getDay()] + ")";

  const links = texto.match(/https?:\/\/[^\s]+/g) || [];
  let contextoLink = "";
  for (const l of links.slice(0, 2)) {
    const t = await textoDeLink(l);
    if (t) contextoLink += "\n\n[Contenido del link " + l + "]\n" + t;
  }

  const sistema =
    "Sos el asistente de la Agenda de la Cámara de Comercio, Industria, Producción y Servicios de Pehuajó (CCIPS). " +
    "Recibís un mensaje (puede ser informal, desordenado, cortado, con errores de tipeo, con emojis o con links) " +
    "y tenés que interpretarlo CON CRITERIO para armar los datos de UNA actividad. " +
    "No seas literal: entendé la intención. Completá lo que puedas inferir; NO inventes datos que no surjan del mensaje.";
  const usuario =
    "Hoy es " + fechaHoy + ". Usá esa fecha para interpretar expresiones relativas ('el jueves', 'la semana que viene', 'el 5/11', 'mañana').\n" +
    "Devolvé SOLO un objeto JSON válido, sin texto extra, con estas claves:\n" +
    '- "nombre": título claro y corto (string)\n' +
    '- "fecha": YYYY-MM-DD (string; "" si no se puede determinar)\n' +
    '- "hora": HH:MM de inicio (string; "" si no)\n' +
    '- "lugar": lugar (string; "" si no)\n' +
    '- "tipo": "Curso","Charla","Evento","Asamblea","Feria","Reunión" u "Otro"\n' +
    '- "descripcion": 1 a 3 oraciones con el detalle (string; "" si no hay)\n' +
    '- "linkInscripcion": link para anotarse, si hay (string; "" si no)\n' +
    "Mensaje:\n\"\"\"\n" + texto + "\n\"\"\"" + contextoLink;

  if (!GEMINI) throw new Error("La IA no está configurada (falta GEMINI_API_KEY).");
  let out = "";
  let ultimoError = "";
  const modelos = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-1.5-flash"];
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
      break;
    }
    ultimoError = JSON.stringify((d && d.error) || d);
  }
  if (!out) throw new Error("Gemini: " + ultimoError.slice(0, 200));

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
  props["Privado"] = { checkbox: false };

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
    "📋 *Esto entendí:*",
    "",
    "📌 " + (datos.nombre || "(sin título)"),
    datos.fecha ? "📅 " + datos.fecha + (datos.hora ? "  🕐 " + datos.hora : "") : "📅 (no detecté la fecha)",
    datos.lugar ? "📍 " + datos.lugar : "",
    datos.tipo ? "🏷️ " + datos.tipo : "",
    datos.linkInscripcion ? "🔗 " + datos.linkInscripcion : "",
    datos.descripcion ? "\n📝 " + datos.descripcion : ""
  ].filter(Boolean).join("\n");
}

/* ---------- main ---------- */
async function main() {
  const updates = await getUpdates();
  const pend = cargarPend();
  let cambio = false;

  if (updates.length === 0) { console.log("Sin mensajes nuevos."); return; }
  const maxId = Math.max(...updates.map(u => u.update_id));

  for (const u of updates) {
    /* --- Botón pulsado --- */
    if (u.callback_query) {
      const cq = u.callback_query;
      const data = cq.data || "";
      const chatId = cq.message.chat.id;
      const mid = cq.message.message_id;
      await tg("answerCallbackQuery", { callback_query_id: cq.id });

      const key = data.slice(data.indexOf(":") + 1);
      const p = pend[key];

      if (data.startsWith("ok:")) {
        if (!p) { await tg("sendMessage", { chat_id: chatId, text: "⚠️ Ese borrador ya no está disponible. Mandá el mensaje de nuevo." }); continue; }
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
        await tg("editMessageText", { chat_id: chatId, message_id: mid, text: "❌ Cancelado. Si algo estaba mal, mandá el mensaje corregido.", parse_mode: "Markdown" });
      }
      continue;
    }

    /* --- Mensaje de texto --- */
    const msg = u.message || u.edited_message;
    if (!msg) continue;
    const chatId = msg.chat.id;
    const texto = (msg.text || msg.caption || "").trim();
    if (!texto) continue;

    if (texto === "/start" || texto === "/help" || texto.toLowerCase() === "ayuda") {
      await tg("sendMessage", { chat_id: chatId, text:
        "👋 ¡Hola! Soy el bot de la Agenda de la Cámara de Comercio (CCIPS Pehuajó).\n\n" +
        "Mandame la info de una actividad como salga (texto informal, datos sueltos o el link del evento). " +
        "Te muestro lo que entendí y, si confirmás, la cargo en Notion como borrador." });
      continue;
    }

    if (!autorizado(msg)) {
      await tg("sendMessage", { chat_id: chatId, text: "⛔ No estás autorizado para cargar actividades." });
      continue;
    }

    await tg("sendMessage", { chat_id: chatId, text: "🤖 Leyendo e interpretando…" });

    try {
      const datos = await aiExtract(texto);
      const resumen = resumenDe(datos);
      const key = "p" + Date.now() + Math.floor(Math.random() * 1000);
      pend[key] = { datos: datos, resumen: resumen };
      cambio = true;

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
    } catch (e) {
      await tg("sendMessage", { chat_id: chatId, text: "⚠️ No pude interpretarlo. Probá describiendo qué es, cuándo y dónde.\n\n(Detalle: " + String(e.message).slice(0, 200) + ")" });
    }
  }

  // Limpiar borradores viejos (más de 2 días)
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
