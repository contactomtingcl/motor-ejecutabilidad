// ============================================================
// MOTOR FINAL — Guardia de privacidad + Fallback seguro + Auditoría
// Claude Impact Lab · Longevidad · Línea 02 (Descompresión)
//
// Esta es la última capa: envuelve todo lo anterior con las
// protecciones que exige un sistema de salud responsable.
// No reemplaza los archivos anteriores — los usa.
// ============================================================

import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import {
  pacientesSinteticos,
  clasificarPaciente,
  generarShortlist,
  type Paciente,
  type ResultadoClasificacion,
} from "./motor_ejecutabilidad";

dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AUDIT_LOG_PATH = path.join(process.cwd(), "audit_log.jsonl");

// ============================================================
// 1. GUARDIA DE PRIVACIDAD
// Rechaza cualquier identificador que no tenga el formato
// sintético P-XXX. Se ejecuta SIEMPRE, antes que cualquier otra
// cosa — nunca se procesa algo que "parezca" un dato real
// (ej. un RUT, un nombre completo, un número de ficha clínica).
// ============================================================

class DatosNoSinteticosError extends Error {}

function validarPrivacidad(identificador: string): void {
  const formatoSinteticoValido = /^P-\d{3}$/.test(identificador);
  if (!formatoSinteticoValido) {
    throw new DatosNoSinteticosError(
      `Rechazado: "${identificador}" no tiene el formato sintético esperado (P-XXX). ` +
        `Este sistema solo procesa identificadores sintéticos, nunca datos reales de pacientes.`
    );
  }
}

// ============================================================
// Tools + system prompt (mismas 4 tools de antes)
// ============================================================

function buscarPaciente(paciente_id: string): Paciente | undefined {
  return pacientesSinteticos.find((p) => p.id === paciente_id);
}

const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "verificar_examen_vigente",
    description: "Consulta si el examen preoperatorio de un paciente está vigente y su fecha.",
    input_schema: {
      type: "object",
      properties: { paciente_id: { type: "string" } },
      required: ["paciente_id"],
    },
  },
  {
    name: "verificar_equipo_medico",
    description: "Consulta si se requiere relevo de equipo médico y si está confirmado.",
    input_schema: {
      type: "object",
      properties: { paciente_id: { type: "string" } },
      required: ["paciente_id"],
    },
  },
  {
    name: "verificar_insumos",
    description: "Consulta si se necesita prótesis y si la reservada es compatible.",
    input_schema: {
      type: "object",
      properties: { paciente_id: { type: "string" } },
      required: ["paciente_id"],
    },
  },
  {
    name: "verificar_tiempo_disponible",
    description: "Consulta el margen de tiempo disponible en minutos.",
    input_schema: {
      type: "object",
      properties: { paciente_id: { type: "string" } },
      required: ["paciente_id"],
    },
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
y luego un profesional de salud. Solo explica en 1-2 frases claras, en español, qué encontraste.`;

// ============================================================
// 2. LLAMADA A CLAUDE CON FALLBACK SEGURO
// Si la API falla por cualquier motivo, esto NUNCA deja que el
// sistema asuma "todo bien" — devuelve ok:false explícitamente.
// ============================================================

interface VerificacionClaude {
  ok: boolean;
  texto: string;
}

async function verificarPacienteConClaude(paciente_id: string): Promise<VerificacionClaude> {
  try {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Verifica la condición del paciente ${paciente_id} usando las tools disponibles. Luego dame un resumen breve.`,
      },
    ];

    for (let vuelta = 0; vuelta < 6; vuelta++) {
      const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        tools: toolDefinitions,
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        const texto = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        return { ok: true, texto };
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

    return { ok: false, texto: "Se agotaron los intentos de verificación con Claude." };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    return { ok: false, texto: `No se pudo conectar con Claude: ${mensaje}` };
  }
}

// ============================================================
// 3. LOG DE AUDITORÍA
// Cada evaluación queda registrada con timestamp, en un archivo
// append-only (JSON Lines) — trazabilidad completa y verificable.
// ============================================================

interface RegistroAuditoria {
  timestamp: string;
  paciente_id: string;
  estado_motor_reglas: string;
  motivo_motor_reglas: string;
  claude_disponible: boolean;
  resumen_claude: string;
  estado_final: string;
  nota?: string;
}

function registrarAuditoria(registro: RegistroAuditoria): void {
  fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(registro) + "\n", "utf-8");
}

// ============================================================
// FUNCIÓN PRINCIPAL — junta las 3 capas de protección
// ============================================================

interface EvaluacionCompleta {
  paciente_id: string;
  estado_final: string;
  motivo: string;
  resumen_claude: string;
  claude_disponible: boolean;
}

async function evaluarPacienteCompleto(paciente_id: string): Promise<EvaluacionCompleta> {
  validarPrivacidad(paciente_id);

  const paciente = buscarPaciente(paciente_id);
  if (!paciente) {
    throw new Error(`Paciente ${paciente_id} no existe en el sistema.`);
  }

  const verificacion = await verificarPacienteConClaude(paciente_id);
  const resultadoMotor: ResultadoClasificacion = clasificarPaciente(paciente);

  let estadoFinal = resultadoMotor.estado;
  let nota: string | undefined;
  if (!verificacion.ok && resultadoMotor.estado === "Ejecutable") {
    estadoFinal = "Requiere revisión";
    nota = "Verificación de Claude no disponible — se degrada de Ejecutable a Requiere revisión por seguridad.";
  }

  registrarAuditoria({
    timestamp: new Date().toISOString(),
    paciente_id,
    estado_motor_reglas: resultadoMotor.estado,
    motivo_motor_reglas: resultadoMotor.motivo,
    claude_disponible: verificacion.ok,
    resumen_claude: verificacion.texto,
    estado_final: estadoFinal,
    ...(nota ? { nota } : {}),
  });

  return {
    paciente_id,
    estado_final: estadoFinal,
    motivo: nota ?? resultadoMotor.motivo,
    resumen_claude: verificacion.texto,
    claude_disponible: verificacion.ok,
  };
}

// ============================================================
// DEMO — prueba las 3 protecciones en orden
// ============================================================

async function main() {
  console.log("========================================");
  console.log("PRUEBA 1 — Guardia de privacidad");
  console.log("========================================");
  try {
    validarPrivacidad("12.345.678-9"); // un RUT de ejemplo, NO uno real — solo para probar el rechazo
    console.log("ERROR: esto no debería haber pasado.");
  } catch (e) {
    if (e instanceof DatosNoSinteticosError) {
      console.log("✅ Rechazado correctamente:", e.message);
    }
  }

  console.log("\n========================================");
  console.log("PRUEBA 2 — Evaluación completa, caso Ejecutable (P-014)");
  console.log("========================================");
  const resultado1 = await evaluarPacienteCompleto("P-014");
  console.log(JSON.stringify(resultado1, null, 2));

  console.log("\n========================================");
  console.log("PRUEBA 3 — Evaluación completa, caso Bloqueada (P-033)");
  console.log("========================================");
  const resultado2 = await evaluarPacienteCompleto("P-033");
  console.log(JSON.stringify(resultado2, null, 2));

  console.log("\n========================================");
  console.log(`Log de auditoría guardado en: ${AUDIT_LOG_PATH}`);
  console.log("========================================");
}

main().catch((err) => {
  console.error("Error inesperado:", err);
});