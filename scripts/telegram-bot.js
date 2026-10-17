#!/usr/bin/env node
/*
  ============================================================
  Bot de Telegram -> IA -> Notion
  Lee los mensajes nuevos del bot, los interpreta con IA y
  crea la actividad en la base "Actividades" de Notion (Borrador).
  Lo ejecuta GitHub Actions.

  Variables de entorno:
    TELEGRAM_BOT_TOKEN      (obligatoria) token del bot de Telegram
    NOTION_TOKEN            (obligatoria) token de la integración de Notion
    NOTION_DATABASE_ID      (opcional)    id de la base "Actividades"
    ALLOWED_TELEGRAM_IDS    (opcional)    ids de Telegram autorizados, separados por coma
    GEMINI_API_KEY          (opcional)    si está, usa Gemini; si no, usa GitHub Models
    GITHUB_TOKEN            (lo pone GitHub Actions) para GitHub Models
  ============================================================
*/

const TG = process.env.TELEGRAM_BOT_TOKEN || "";
const NOTION = process.env.NOTION_TOKEN || "";
const DB = process.env.NOTION_DATABASE_ID || "3fc854fe-4e5d-81a1-ad13-ca69cf62f675";
const ALLOWED = (process.env.ALLOWED_TELEGRAM_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
const GEMINI = process.env.GEMINI_API_KEY || "";
const GH_TOKEN = process.env.GITHUB_TOKEN || "";

if (!TG) { console.error("ERROR: falta TELEGRAM_BOT_TOKEN"); process.exit(1); }
if (!NOTION) { console.error("ERROR: falta NOTION_TOKEN"); process.exit(1); }

const TGAPI = "https://api.telegram.org/bot" + TG;

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
  if (ALLOWED.length === 0) return true; // sin lista blanca: todos pueden (configurar ALLOWED_TELEGRAM_IDS)
  const uid = String(msg.from && msg.from.id);
  const cid = String(msg.chat && msg.chat.id);
  return ALLOWED.includes(uid) || ALLOWED.includes(cid);
}

/* ---------- IA: extraer los datos del mensaje ---------- */
async function aiExtract(text) {
  const hoy = new Date().toISOString().slice(0, 10);
  const prompt =
    "Sos un asistente que extrae datos de actividades a partir de mensajes en español " +
    "(de la Cámara de Comercio de Pehuajó, Argentina).\n" +
    "Hoy es " + hoy + ".\n" +
    "Devolvé SOLO un objeto JSON válido, sin texto extra ni explicaciones, con estas claves:\n" +
    '- "nombre": título corto de la actividad (string)\n' +
    '- "fecha": fecha en formato YYYY-MM-DD (string; "" si no se menciona)\n' +
    '- "hora": hora en formato HH:MM (string; "" si no se menciona)\n' +
    '- "lugar": lugar (string; "" si no se menciona)\n' +
    '- "tipo": uno de "Curso","Charla","Evento","Asamblea","Feria","Reunión","Otro"\n' +
    '- "descripcion": 1 a 3 oraciones con el detalle útil (string)\n' +
    "Mensaje:\n\"\"\"\n" + text + "\n\"\"\"";

  let out = "";
  if (GEMINI) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
    });
    const d = await res.json();
    out = ((((d.candidates || [])[0] || {}).content || {}).parts || [])[0]?.text || "";
    if (!out && d.error) throw new Error("Gemini: " + (d.error.message || JSON.stringify(d.error)));
  } else {
    const res = await fetch("https://models.inference.ai.azure.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + GH_TOKEN },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0, messages: [{ role: "user", content: prompt }] })
    });
    const d = await res.json();
    out = (((d.choices || [])[0] || {}).message || {}).content || "";
    if (!out && d.error) throw new Error("GitHub Models: " + JSON.stringify(d.error));
  }

  const m = out.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("La IA no devolvió JSON. Respuesta: " + out.slice(0, 200));
  return JSON.parse(m[0]);
}

/* ---------- Notion: crear la actividad ---------- */
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
  props["ID"] = rt(a.id || slug(a.nombre));
  props["Estado"] = { select: { name: "Borrador" } };
  props["Privado"] = { checkbox: false };

  const body = JSON.stringify({ parent: { database_id: DB }, properties: props });
  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: { "Authorization": "Bearer " + NOTION, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body
  });
  const d = await res.json();
  if (!res.ok) throw new Error("Notion: " + JSON.stringify(d));
  return d.id;
}

/* ---------- main ---------- */
async function main() {
  const updates = await getUpdates();
  if (updates.length === 0) { console.log("Sin mensajes nuevos."); return; }

  const maxId = Math.max(...updates.map(u => u.update_id));
  let procesados = 0;

  for (const u of updates) {
    const msg = u.message || u.edited_message;
    if (!msg || !msg.text) continue;
    const chatId = msg.chat.id;
    const texto = msg.text.trim();

    if (texto === "/start" || texto === "/help") {
      await tg("sendMessage", { chat_id: chatId, text:
        "👋 ¡Hola! Soy el bot de la Agenda de la Cámara.\n\n" +
        "Mandame un mensaje con los datos de la actividad (qué, cuándo, dónde) y la cargo en Notion como borrador.\n\n" +
        "Ejemplo:\n«Charla de seguridad e higiene el 5 de noviembre a las 19 h en el Salón de la Cámara. Gratis para socios.»" });
      continue;
    }

    if (!autorizado(msg)) {
      await tg("sendMessage", { chat_id: chatId, text: "⛔ No estás autorizado para cargar actividades. Avísale al administrador." });
      continue;
    }

    await tg("sendMessage", { chat_id: chatId, text: "🤖 Interpretando el mensaje…" });

    try {
      const datos = await aiExtract(texto);
      datos.id = slug(datos.nombre);
      await crearEnNotion(datos);
      procesados++;
      const detalle = [
        "✅ *Actividad cargada en Notion* (estado: Borrador)",
        "",
        "📌 " + (datos.nombre || "-"),
        datos.fecha ? "📅 " + datos.fecha + (datos.hora ? "  🕐 " + datos.hora : "") : "",
        datos.lugar ? "📍 " + datos.lugar : "",
        datos.tipo ? "🏷️ " + datos.tipo : "",
        "",
        "_Revisala en Notion y, si está bien, arrastrala a \"Publicada\" para que aparezca en la web._"
      ].filter(Boolean).join("\n");
      await tg("sendMessage", { chat_id: chatId, text: detalle, parse_mode: "Markdown" });
    } catch (e) {
      await tg("sendMessage", { chat_id: chatId, text: "⚠️ No pude interpretarlo. Probá con un mensaje más claro (qué, cuándo, dónde).\n\nDetalle técnico: " + String(e.message).slice(0, 200) });
    }
  }

  // Confirmar los updates ya procesados
  await getUpdates(maxId + 1);
  console.log("Mensajes procesados: " + procesados);
}

main().catch(e => { console.error(e); process.exit(1); });
