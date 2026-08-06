// ============================================================
// GENERADOR DE REPORTE — Motor de Ejecutabilidad (v2)
// Agrega, SOLO en esta capa de presentación (no toca el motor
// de reglas ya probado): filas expandibles nativas, vista previa
// condicional simulada con el motor de reglas real, panel de
// capas de seguridad, y resumen de estados.
// ============================================================

import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import {
  pacientesSinteticos,
  clasificarPaciente,
  generarShortlist,
  UMBRAL_MARGEN_SEGURO_MIN,
  type Paciente,
  type ResultadoClasificacion,
} from "./motor_ejecutabilidad";

dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const REPORTE_PATH = path.join(process.cwd(), "reporte.html");

function buscarPaciente(paciente_id: string): Paciente | undefined {
  return pacientesSinteticos.find((p) => p.id === paciente_id);
}

const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "verificar_examen_vigente",
    description: "Consulta si el examen preoperatorio de un paciente está vigente y su fecha.",
    input_schema: { type: "object", properties: { paciente_id: { type: "string" } }, required: ["paciente_id"] },
  },
  {
    name: "verificar_equipo_medico",
    description: "Consulta si se requiere relevo de equipo médico y si está confirmado.",
    input_schema: { type: "object", properties: { paciente_id: { type: "string" } }, required: ["paciente_id"] },
  },
  {
    name: "verificar_insumos",
    description: "Consulta si se necesita prótesis y si la reservada es compatible.",
    input_schema: { type: "object", properties: { paciente_id: { type: "string" } }, required: ["paciente_id"] },
  },
  {
    name: "verificar_tiempo_disponible",
    description: "Consulta el margen de tiempo disponible en minutos.",
    input_schema: { type: "object", properties: { paciente_id: { type: "string" } }, required: ["paciente_id"] },
  },
];

function ejecutarTool(nombre: string, input: { paciente_id: string }): object {
  const paciente = buscarPaciente(input.paciente_id);
  if (!paciente) return { error: `Paciente ${input.paciente_id} no encontrado.` };
  switch (nombre) {
    case "verificar_examen_vigente":
      return { vigente: paciente.examen_vigente, fecha: paciente.examen_fecha };
    case "verificar_equipo_medico":
      return { relevo_necesario: paciente.relevo_necesario, relevo_confirmado: paciente.relevo_confirmado };
    case "verificar_insumos":
      return { protesis_necesaria: paciente.protesis_necesaria, protesis_compatible: paciente.protesis_compatible };
    case "verificar_tiempo_disponible":
      return { margen_tiempo_min: paciente.margen_tiempo_min };
    default:
      return { error: `Tool desconocida: ${nombre}` };
  }
}

const SYSTEM_PROMPT = `Eres el asistente de verificación del Motor de Ejecutabilidad.
Verifica la condición de pacientes usando las tools disponibles. Nunca inventes datos.
Nunca diagnostiques ni decidas si un paciente puede operarse — eso lo hace un motor de reglas separado
y luego un profesional de salud. Responde en 1-2 frases claras, en español, en texto plano sin markdown
(nada de asteriscos, títulos ni encabezados), sin repetir números crudos.`;

async function verificarConClaude(paciente_id: string): Promise<string> {
  try {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: `Verifica la condición del paciente ${paciente_id} usando las tools disponibles. Luego dame un resumen breve.` },
    ];
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        tools: toolDefinitions,
        messages,
      });
      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason !== "tool_use") {
        return response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join(" ");
      }
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const resultado = ejecutarTool(block.name, block.input as { paciente_id: string });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(resultado) });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }
    return "No se pudo completar la verificación.";
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    return `Verificación no disponible (${mensaje}). Requiere revisión manual.`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function limpiarTextoClaude(texto: string): string {
  return texto.replace(/\*\*/g, "").replace(/\n{2,}/g, " ").replace(/\s{2,}/g, " ").trim();
}

function pillClass(estado: string): string {
  if (estado === "Ejecutable") return "ok";
  if (estado === "Bloqueada") return "bad";
  return "warn";
}

// ------------------------------------------------------------
// VISTA PREVIA CONDICIONAL
// No inventa nada: toma al paciente real, corrige SOLO el campo
// que hoy lo detiene, y vuelve a correr el motor de reglas real
// para ver a qué estado pasaría. Es una simulación calculada,
// no una promesa ni una acción automática.
// ------------------------------------------------------------

interface VistaPrevia {
  accion: string;
  estadoSiguiente: ResultadoClasificacion["estado"];
  motivoSiguiente: string;
}

function simularResolucion(p: Paciente): VistaPrevia | null {
  const actual = clasificarPaciente(p);
  if (actual.estado === "Ejecutable") return null;

  const hipotetico: Paciente = { ...p };
  let accion = "";

  if (!p.contactable) {
    hipotetico.contactable = true;
    accion = "se contacta al paciente";
  } else if (!p.examen_vigente) {
    hipotetico.examen_vigente = true;
    accion = "se renueva el examen preoperatorio";
  } else if (p.relevo_necesario && !p.relevo_confirmado) {
    hipotetico.relevo_confirmado = true;
    accion = "se confirma el relevo de equipo médico";
  } else if (p.protesis_necesaria && !p.protesis_compatible) {
    hipotetico.protesis_compatible = true;
    accion = "se verifica o reemplaza la prótesis";
  } else if (p.cambio_clinico_reportado) {
    hipotetico.cambio_clinico_reportado = false;
    accion = "un profesional confirma que el cambio clínico no impide la cirugía";
  } else if (!p.transporte_confirmado) {
    hipotetico.transporte_confirmado = true;
    accion = "se confirma el transporte del paciente";
  } else if (p.margen_tiempo_min < UMBRAL_MARGEN_SEGURO_MIN) {
    hipotetico.margen_tiempo_min = UMBRAL_MARGEN_SEGURO_MIN;
    accion = "se libera más tiempo de preparación";
  } else {
    return null;
  }

  const siguiente = clasificarPaciente(hipotetico);
  return { accion, estadoSiguiente: siguiente.estado, motivoSiguiente: siguiente.motivo };
}

// ------------------------------------------------------------
// Filas expandibles (usa <details>/<summary> nativo — sin JS,
// sin riesgo de bugs de eventos, funciona en cualquier navegador)
// ------------------------------------------------------------

function filaTabla(p: Paciente, r: ResultadoClasificacion): string {
  const equidad = r.motivo.toLowerCase().includes("equidad")
    ? `<span class="tag-equidad">⚖ regla de equidad</span>`
    : "";

  const tarea = r.tarea_pendiente
    ? `<div class="detail-line"><span class="label">Tarea pendiente</span>${escapeHtml(r.tarea_pendiente)}</div>`
    : "";

  const preview = simularResolucion(p);
  const previewHtml = preview
    ? `<div class="preview-box">
         <div class="preview-tag">💡 vista previa (simulada por el motor de reglas)</div>
         <p>Si ${escapeHtml(preview.accion)} → pasaría a <span class="pill-inline ${pillClass(preview.estadoSiguiente)}">${preview.estadoSiguiente}</span>. ${escapeHtml(preview.motivoSiguiente)}</p>
       </div>`
    : `<div class="preview-box ok-box"><p>Ya cumple todos los requisitos críticos.</p></div>`;

  return `
    <details class="row-details">
      <summary>
        <div class="row">
          <div class="col-id pid">${p.id}</div>
          <div class="col-name">${escapeHtml(p.nombre)} ${equidad}</div>
          <div class="col-prio prio">${p.prioridad}</div>
          <div class="col-dias prio">${p.antiguedad_dias}</div>
          <div class="col-estado"><span class="status-pill ${pillClass(r.estado)}">${r.estado}</span></div>
        </div>
      </summary>
      <div class="row-expand">
        <div class="detail-line"><span class="label">Motivo</span>${escapeHtml(r.motivo)}</div>
        ${tarea}
        ${previewHtml}
      </div>
    </details>`;
}

function tarjetaVerificacion(p: Paciente, r: ResultadoClasificacion, resumenClaude: string): string {
  const tarea = r.tarea_pendiente
    ? `<div class="tarea">→ Tarea: ${escapeHtml(r.tarea_pendiente)}</div>`
    : "";
  return `
    <div class="verify-card">
      <div class="head">
        <div><div class="pid">${p.id}</div><div class="name">${escapeHtml(p.nombre)}</div></div>
        <span class="status-pill ${pillClass(r.estado)}">${r.estado}</span>
      </div>
      <div class="layer">
        <div class="who">Claude, vía tools</div>
        <p>${escapeHtml(limpiarTextoClaude(resumenClaude))}</p>
      </div>
      <div class="layer">
        <div class="who motor">Motor de reglas</div>
        <p>${escapeHtml(r.motivo)}</p>
        ${tarea}
      </div>
    </div>`;
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

async function main() {
  const shortlist = generarShortlist(pacientesSinteticos);
  const clasificaciones = shortlist.map((p) => ({ paciente: p, resultado: clasificarPaciente(p) }));

  const ganadorEntry = clasificaciones.find((e) => e.resultado.estado === "Ejecutable");
  const bloqueadoEntry = clasificaciones.find((e) => e.resultado.estado === "Bloqueada");

  if (!ganadorEntry) {
    console.log("No hay ningún paciente Ejecutable en este momento — revisa los datos sintéticos.");
    return;
  }

  console.log(`Verificando con Claude: ${ganadorEntry.paciente.id} (ganador)...`);
  const resumenGanador = await verificarConClaude(ganadorEntry.paciente.id);

  let tarjetaBloqueadoHtml = "";
  if (bloqueadoEntry) {
    console.log(`Verificando con Claude: ${bloqueadoEntry.paciente.id} (caso bloqueado)...`);
    const resumenBloqueado = await verificarConClaude(bloqueadoEntry.paciente.id);
    tarjetaBloqueadoHtml = tarjetaVerificacion(bloqueadoEntry.paciente, bloqueadoEntry.resultado, resumenBloqueado);
  }

  const filasTabla = clasificaciones.map((e) => filaTabla(e.paciente, e.resultado)).join("");
  const fechaGenerado = new Date().toLocaleString("es-CL");

  const conteo: Record<string, number> = { Ejecutable: 0, "Requiere revisión": 0, Bloqueada: 0 };
  for (const e of clasificaciones) {
    conteo[e.resultado.estado] = (conteo[e.resultado.estado] ?? 0) + 1;
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Motor de Ejecutabilidad — Reporte de verificación</title>
<style>
  :root {
    --bg: #0B1220; --surface: #141B2E; --surface-2: #1B2440; --border: #263156;
    --text: #EDEFF3; --text-dim: #8B93A7; --accent: #4FD1C5;
    --ok: #34D399; --ok-bg: rgba(52,211,153,0.12);
    --warn: #FBBF24; --warn-bg: rgba(251,191,36,0.12);
    --bad: #F87171; --bad-bg: rgba(248,113,113,0.12);
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin:0; background: radial-gradient(1200px 600px at 50% -10%, #101a33 0%, var(--bg) 55%); color: var(--text); font-family: var(--sans); padding: 32px 20px 64px; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 980px; margin: 0 auto; }
  .top { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:28px; flex-wrap:wrap; gap:8px; }
  .top h1 { font-size:15px; letter-spacing:.08em; text-transform:uppercase; color:var(--text-dim); font-weight:600; margin:0; }
  .top .meta { font-family: var(--mono); font-size:12px; color: var(--text-dim); }
  .board { background: linear-gradient(180deg, var(--surface-2), var(--surface)); border:1px solid var(--border); border-radius:14px; padding:28px 32px; margin-bottom:36px; position:relative; overflow:hidden; }
  .board::before { content:""; position:absolute; inset:0; background: linear-gradient(120deg, rgba(79,209,197,0.08), transparent 55%); pointer-events:none; }
  .board .eyebrow { font-family: var(--mono); font-size:12px; letter-spacing:.12em; color: var(--accent); text-transform:uppercase; margin-bottom:10px; }
  .board .winner-row { display:flex; align-items:center; gap:22px; flex-wrap:wrap; }
  .board .winner-id { font-family: var(--mono); font-size:40px; font-weight:700; letter-spacing:-.01em; color:var(--text); margin-right:4px; }
  .board .winner-name { font-size:16px; color: var(--text-dim); }
  .status-pill { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:999px; font-family: var(--mono); font-size:12px; font-weight:600; letter-spacing:.03em; text-transform:uppercase; white-space:nowrap; }
  .status-pill.ok { background: var(--ok-bg); color: var(--ok); }
  .status-pill.warn { background: var(--warn-bg); color: var(--warn); }
  .status-pill.bad { background: var(--bad-bg); color: var(--bad); }
  .status-pill::before { content:""; width:6px; height:6px; border-radius:50%; background: currentColor; }
  .pill-inline { display:inline-block; padding:1px 8px; border-radius:999px; font-family: var(--mono); font-size:11px; font-weight:700; text-transform:uppercase; }
  .pill-inline.ok { background: var(--ok-bg); color: var(--ok); }
  .pill-inline.warn { background: var(--warn-bg); color: var(--warn); }
  .pill-inline.bad { background: var(--bad-bg); color: var(--bad); }
  .board .sub { margin-top:14px; font-size:13px; color: var(--text-dim); line-height:1.5; }
  h2.section-title { font-size:13px; letter-spacing:.08em; text-transform:uppercase; color: var(--text-dim); font-weight:600; margin:0 0 14px; }
  .verify-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:36px; }
  @media (max-width:720px) { .verify-grid { grid-template-columns:1fr; } }
  .verify-card { background: var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px; }
  .verify-card .head { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
  .verify-card .pid { font-family: var(--mono); font-size:18px; font-weight:700; }
  .verify-card .name { font-size:12px; color: var(--text-dim); margin-top:2px; }
  .layer { padding:12px 0; border-top:1px solid var(--border); }
  .layer:first-of-type { border-top:none; padding-top:0; }
  .layer .who { font-family: var(--mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color: var(--accent); margin-bottom:6px; }
  .layer .who.motor { color: var(--text-dim); }
  .layer p { margin:0; font-size:13.5px; line-height:1.55; color: var(--text); }
  .layer .tarea { margin-top:8px; font-size:12.5px; color: var(--warn); }

  /* Barra resumen */
  .summary-bar { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
  .summary-chip { font-family: var(--mono); font-size:12px; padding:6px 12px; border-radius:8px; border:1px solid var(--border); background: var(--surface); color: var(--text-dim); }
  .summary-chip b { color: var(--text); }
  .summary-chip.ok { border-color: rgba(52,211,153,0.35); } .summary-chip.warn { border-color: rgba(251,191,36,0.35); } .summary-chip.bad { border-color: rgba(248,113,113,0.35); }

  /* Lista con filas expandibles nativas */
  .list { display:flex; flex-direction:column; border:1px solid var(--border); border-radius:12px; overflow:hidden; }
  .row-details { border-bottom:1px solid var(--border); background: var(--surface); }
  .row-details:last-child { border-bottom:none; }
  .row-details summary { cursor:pointer; list-style:none; }
  .row-details summary::-webkit-details-marker { display:none; }
  .row { display:flex; align-items:center; gap:12px; padding:12px 18px; font-size:13px; }
  .row.header { background: var(--surface-2); font-family: var(--mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color: var(--text-dim); cursor:default; }
  .row::before { content:"›"; display:inline-block; width:10px; color: var(--text-dim); transition: transform .15s ease; }
  .row-details[open] .row::before { transform: rotate(90deg); }
  .row.header::before { content:""; }
  .row > * { flex: 0 0 auto; }
  .row .col-id { width:80px; } .row .col-name { width:220px; flex:1 1 auto; min-width:140px; display:flex; align-items:center; gap:8px; }
  .row .col-prio { width:110px; } .row .col-dias { width:70px; } .row .col-estado { width:190px; }
  .row .pid { font-family: var(--mono); font-weight:700; }
  .row .prio { color: var(--text-dim); font-family: var(--mono); font-size:12px; }
  .tag-equidad { font-family: var(--mono); font-size:10px; color: var(--accent); background: rgba(79,209,197,0.1); padding:2px 7px; border-radius:6px; white-space:nowrap; }

  .row-expand { padding:4px 18px 18px 40px; background: var(--surface-2); font-size:13px; }
  .detail-line { margin-bottom:8px; line-height:1.5; }
  .detail-line .label { display:block; font-family: var(--mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color: var(--text-dim); margin-bottom:3px; }
  .preview-box { margin-top:10px; padding:12px 14px; border-radius:8px; background: rgba(79,209,197,0.06); border:1px dashed rgba(79,209,197,0.35); }
  .preview-box.ok-box { background: var(--ok-bg); border:1px solid rgba(52,211,153,0.3); }
  .preview-tag { font-family: var(--mono); font-size:10px; letter-spacing:.06em; text-transform:uppercase; color: var(--accent); margin-bottom:6px; }
  .preview-box p { margin:0; font-size:13px; line-height:1.5; color: var(--text); }

  /* Panel de capas de seguridad */
  .security-panel { margin-top:36px; border:1px solid var(--border); border-radius:12px; padding:22px 26px; background: var(--surface); }
  .security-panel h2 { margin:0 0 14px; }
  .security-item { display:flex; gap:12px; padding:10px 0; border-top:1px solid var(--border); }
  .security-item:first-of-type { border-top:none; padding-top:0; }
  .security-item .icon { font-family: var(--mono); color: var(--accent); font-size:13px; flex:0 0 auto; }
  .security-item .txt b { color: var(--text); }
  .security-item .txt { font-size:13px; color: var(--text-dim); line-height:1.5; }

  footer { margin-top:40px; text-align:center; font-size:11.5px; color: var(--text-dim); font-family: var(--mono); }
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <h1>Motor de Ejecutabilidad · Línea 02 — Descompresión</h1>
    <div class="meta">generado ${fechaGenerado}</div>
  </div>

  <div class="board">
    <div class="eyebrow">Cupo quirúrgico liberado</div>
    <div class="winner-row">
      <div class="winner-id">${ganadorEntry.paciente.id}</div>
      <div class="winner-name">${escapeHtml(ganadorEntry.paciente.nombre)} · Prioridad ${ganadorEntry.paciente.prioridad} · ${ganadorEntry.paciente.antiguedad_dias} días en espera</div>
      <span class="status-pill ok">Ejecutable</span>
    </div>
    <div class="sub">${escapeHtml(ganadorEntry.resultado.motivo)} Validación humana pendiente.</div>
  </div>

  <h2 class="section-title">Verificación en vivo — Claude interpreta, el motor de reglas decide</h2>
  <div class="verify-grid">
    ${tarjetaVerificacion(ganadorEntry.paciente, ganadorEntry.resultado, resumenGanador)}
    ${tarjetaBloqueadoHtml}
  </div>

  <h2 class="section-title">Shortlist completa (${clasificaciones.length} pacientes sintéticos) · clic en una fila para ver el detalle</h2>
  <div class="summary-bar">
    <span class="summary-chip ok"><b>${conteo["Ejecutable"]}</b> Ejecutable</span>
    <span class="summary-chip warn"><b>${conteo["Requiere revisión"]}</b> Requiere revisión</span>
    <span class="summary-chip bad"><b>${conteo["Bloqueada"]}</b> Bloqueada</span>
  </div>
  <div class="list">
    <div class="row-details"><div class="row header">
      <div class="col-id">ID</div><div class="col-name">Nombre</div><div class="col-prio">Prioridad</div><div class="col-dias">Días</div><div class="col-estado">Estado</div>
    </div></div>
    ${filasTabla}
  </div>

  <div class="security-panel">
    <h2 class="section-title">Capas de seguridad del sistema</h2>
    <div class="security-item">
      <div class="icon">01</div>
      <div class="txt"><b>Guardia de privacidad.</b> Rechaza cualquier identificador que no tenga formato sintético (P-XXX) antes de procesar cualquier dato.</div>
    </div>
    <div class="security-item">
      <div class="icon">02</div>
      <div class="txt"><b>Fallback seguro.</b> Si la verificación con Claude no está disponible, ningún caso se marca "Ejecutable" por defecto — se degrada a "Requiere revisión".</div>
    </div>
    <div class="security-item">
      <div class="icon">03</div>
      <div class="txt"><b>Log de auditoría.</b> Cada evaluación queda registrada con timestamp en <code>audit_log.jsonl</code>, de forma trazable y verificable.</div>
    </div>
    <div class="security-item">
      <div class="icon">04</div>
      <div class="txt"><b>Qué mide "margen de tiempo".</b> Es el tiempo mínimo de coordinación administrativa que necesita el equipo de gestión (SOME) para reasignar el cupo — bloquear pabellón, avisar al equipo quirúrgico, confirmar la reserva. No es tiempo de preparación clínica del paciente, que sigue su propio protocolo aparte.</div>
    </div>
  </div>

  <footer>DATOS 100% SINTÉTICOS · NINGÚN PACIENTE REAL · AUDIT LOG: audit_log.jsonl</footer>
</div>
</body>
</html>`;

  fs.writeFileSync(REPORTE_PATH, html, "utf-8");
  console.log(`\n✅ Reporte generado: ${REPORTE_PATH}`);
  console.log("Ábrelo con doble clic para verlo en el navegador.");
}

main().catch((err) => {
  console.error("Error:", err);
});