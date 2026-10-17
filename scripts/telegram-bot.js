#!/usr/bin/env node
/*
  ============================================================
  Bot de Telegram -> IA -> Notion
  Lee los mensajes nuevos del bot, los interpreta con IA y
  crea la actividad en la base "Actividades" de Notion (Borrador).
  Es flexible: acepta mensajes informales, cortados o con links.

  Variables de entorno:
    TELEGRAM_BOT_TOKEN      (obligatoria)
    NOTION_TOKEN            (obligatoria)
    NOTION_DATABASE_ID      (opcional)
    ALLOWED_TELEGRAM_IDS    (opcional) ids autorizados, separados por coma
    GEMINI_API_KEY          (opcional) si está, usa Gemini; si no, GitHub Models
    GITHUB_TOKEN            (lo pone GitHub Actions)
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
  if (ALLOWED.length === 0) return true; // sin lista blanca: todos pueden
  const uid = String(msg.from && msg.from.id);
  const cid = String(msg.chat && msg.chat.id);
  return ALLOWED.includes(uid) || ALLOWED.includes(cid);
}

/* ---------- Traer el texto de un link (best effort) ---------- */
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

/* ---------- IA: interpretar el mensaje ---------- */
async function aiExtract(texto) {
  const hoy = new Date();
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const fechaHoy = hoy.toISOString().slice(0, 10) + " (" + dias[hoy.getDay()] + ")";

  // Si el mensaje trae un link, lo leemos y se lo pasamos a la IA como contexto
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
    "Hoy es " + fechaHoy + ". Usá esa fecha para interpretar expresiones relativas ('el jueves', 'la semana que viene', 'el 5/11', 'mañana', 'el mes que viene').\n" +
    "Devolvé SOLO un objeto JSON válido, sin texto extra, con estas claves:\n" +
    '- "nombre": título claro y corto de la actividad (string)\n' +
    '- "fecha": fecha en formato YYYY-MM-DD (string; "" si no se puede determinar)\n' +
    '- "hora": hora en formato HH:MM de inicio (string; "" si no se menciona)\n' +
    '- "lugar": lugar (string; "" si no se menciona)\n' +
    '- "tipo": uno de "Curso","Charla","Evento","Asamblea","Feria","Reunión","Otro"\n' +
    '- "descripcion": resumen de 1 a 3 oraciones con el detalle útil (string; "" si no hay)\n' +
    '- "linkInscripcion": si el mensaje trae un link para anotarse/inscribirse, ponelo acá (string; "" si no)\n' +
    '- "confianza": "alta", "media" o "baja" según cuán completos estén los datos\n\n' +
    "Mensaje:\n\"\"\"\n" + texto + "\n\"\"\"" + contextoLink;

  let out = "";
  if (GEMINI) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ parts: [{ text: usuario }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
      })
    });
    const d = await res.json();
    out = ((((d.candidates || [])[0] || {}).content || {}).parts || [])[0]?.text || "";
    if (!out && d.error) throw new Error("Gemini: " + (d.error.message || JSON.stringify(d.error)));
  } else {
    const res = await fetch("https://models.inference.ai.azure.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + GH_TOKEN },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.2,
        messages: [{ role: "system", content: sistema }, { role: "user", content: usuario }]
      })
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

/* ---------- main ---------- */
async function main() {
  const updates = await getUpdates();
  if (updates.length === 0) { console.log("Sin mensajes nuevos."); return; }

  const maxId = Math.max(...updates.map(u => u.update_id));
  let procesados = 0;

  for (const u of updates) {
    const msg = u.message || u.edited_message;
    if (!msg) continue;
    const chatId = msg.chat.id;
    const texto = (msg.text || msg.caption || "").trim();
    if (!texto) continue;

    if (texto === "/start" || texto === "/help" || texto.toLowerCase() === "ayuda") {
      await tg("sendMessage", { chat_id: chatId, text:
        "👋 ¡Hola! Soy el bot de la Agenda de la Cámara de Comercio (CCIPS Pehuajó).\n\n" +
        "Mandame la info de una actividad como salga: un texto informal, datos sueltos o el link del evento. Yo la interpreto y la cargo en Notion (queda como borrador).\n\n" +
        "Ejemplos:\n" +
        "• «Charla de seguridad e higiene el jueves que viene a las 19 en el salón, gratis para socios»\n" +
        "• «Curso de marketing digital, 10/11, 18:30, aula taller»\n" +
        "• un link a la publicación del evento" });
      continue;
    }

    if (!autorizado(msg)) {
      await tg("sendMessage", { chat_id: chatId, text: "⛔ No estás autorizado para cargar actividades. Avisale al administrador." });
      continue;
    }

    await tg("sendMessage", { chat_id: chatId, text: "🤖 Leyendo e interpretando…" });

    try {
      const datos = await aiExtract(texto);
      datos.id = slug(datos.nombre);
      await crearEnNotion(datos);
      procesados++;

      const faltan = [];
      if (!datos.fecha) faltan.push("la fecha");
      if (!datos.hora) faltan.push("la hora");
      if (!datos.lugar) faltan.push("el lugar");

      const detalle = [
        "✅ *Cargué la actividad en Notion* (quedó como Borrador)",
        "",
        "📌 " + (datos.nombre || "(sin título)"),
        datos.fecha ? "📅 " + datos.fecha + (datos.hora ? "  🕐 " + datos.hora : "") : "📅 (sin fecha)",
        datos.lugar ? "📍 " + datos.lugar : "",
        datos.tipo ? "🏷️ " + datos.tipo : "",
        datos.linkInscripcion ? "🔗 " + datos.linkInscripcion : "",
        datos.confianza === "baja" ? "\n⚠️ Cargué lo que pude. Revisala en Notion." : "",
        "",
        "_Revisala en Notion y, si está bien, arrastrala a \"Publicada\" para que salga en la web y el calendario._"
      ].filter(Boolean).join("\n");
      await tg("sendMessage", { chat_id: chatId, text: detalle, parse_mode: "Markdown", disable_web_page_preview: true });
    } catch (e) {
      await tg("sendMessage", { chat_id: chatId, text: "⚠️ No pude interpretarlo. Probá describiendo qué es, cuándo y dónde.\n\n(Detalle: " + String(e.message).slice(0, 200) + ")" });
    }
  }

  await getUpdates(maxId + 1);
  console.log("Mensajes procesados: " + procesados);
}

main().catch(e => { console.error(e); process.exit(1); });
