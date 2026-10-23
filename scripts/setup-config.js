#!/usr/bin/env node
/*
  Crea (una sola vez) la base "Configuración Agenda" en Notion.
  Se ejecuta desde GitHub Actions porque el token de Notion vive en los secrets.
  No imprime el token.
*/

const TOKEN = process.env.NOTION_TOKEN || "";
const ACT_DB = process.env.NOTION_DATABASE_ID || "3fc854fe-4e5d-81a1-ad13-ca69cf62f675";
const API = "https://api.notion.com/v1";
const NV = "2022-06-28";

async function notion(path, opts) {
  opts = opts || {};
  const res = await fetch(API + path, {
    method: opts.method || "GET",
    headers: {
      "Authorization": "Bearer " + TOKEN,
      "Notion-Version": NV,
      "Content-Type": "application/json"
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status + " " + text);
  return JSON.parse(text);
}

const rt = s => ({ rich_text: [{ type: "text", text: { content: s } }] });

async function main() {
  if (!TOKEN) throw new Error("Falta NOTION_TOKEN");

  // ¿Ya existe?
  const search = await notion("/search", {
    method: "POST",
    body: { query: "Configuración Agenda", filter: { property: "object", value: "database" } }
  });
  const existing = (search.results || []).find(d =>
    (d.title || []).map(t => t.plain_text).join("").trim() === "Configuración Agenda"
  );
  if (existing) {
    console.log("ESTADO=YA_EXISTE");
    console.log("DB_ID=" + existing.id);
    console.log("DB_URL=" + existing.url);

    // Migración: token de calendario (hash) para no exponer la clave en la URL.
    const formulaCal = '"https://camarapehuajo.github.io/agenda-ccips/cd/" + prop("Token calendario") + ".ics"';
    await notion("/databases/" + existing.id, {
      method: "PATCH",
      body: {
        properties: {
          "Token calendario": { rich_text: {} },
          "Link calendario": { formula: { expression: formulaCal } }
        }
      }
    });
    console.log("MIGRADA=SI");
    return;
  }

  // Padre de la base de Actividades
  const acts = await notion("/databases/" + ACT_DB);
  const parent = acts.parent || {};
  console.log("PARENT_TYPE=" + (parent.type || ""));
  console.log("PARENT_ID=" + (parent.page_id || ""));

  const parentObj = parent.type === "page_id"
    ? { type: "page_id", page_id: parent.page_id }
    : { type: "workspace", workspace: true };

  const formulaWeb = '"https://camarapehuajo.github.io/agenda-ccips/?cd=1&k=" + prop("Clave")';
  const formulaCal = '"https://camarapehuajo.github.io/agenda-ccips/cd/" + prop("Clave") + ".ics"';

  const db = await notion("/databases", {
    method: "POST",
    body: {
      parent: parentObj,
      title: [{ type: "text", text: { content: "Configuración Agenda" } }],
      properties: {
        "Nombre": { title: {} },
        "Clave": { rich_text: {} },
        "Nombre calendario": { rich_text: {} },
        "Link web": { formula: { expression: formulaWeb } },
        "Link calendario": { formula: { expression: formulaCal } }
      }
    }
  });

  console.log("ESTADO=CREADA");
  console.log("DB_ID=" + db.id);
  console.log("DB_URL=" + db.url);

  const row = await notion("/pages", {
    method: "POST",
    body: {
      parent: { database_id: db.id },
      properties: {
        "Nombre": { title: [{ type: "text", text: { content: "Agenda CD" } }] },
        "Clave": rt("cd-2026-verde"),
        "Nombre calendario": rt("Agenda CD 2026")
      }
    }
  });

  console.log("ROW_ID=" + row.id);
  console.log("ROW_URL=" + row.url);
}

main().catch(e => {
  console.error("ERROR: " + e.message);
  process.exit(1);
});
