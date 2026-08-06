// ============================================================
// CLAUDE + TOOLS — Verificación de pacientes candidatos
// Claude Impact Lab · Longevidad · Línea 02 (Descompresión)
//
// Claude NUNCA inventa datos: siempre los pide a través de estas
// 4 tools, que consultan la "base de datos" (aquí, simulada con
// los pacientes sintéticos). El motor de reglas (motor_ejecutabilidad.ts)
// sigue siendo quien decide el estado final — Claude solo interpreta
// y explica.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import {
  pacientesSinteticos,
  clasificarPaciente,
  generarShortlist,
  type Paciente,
} from "./motor_ejecutabilidad";

dotenv.config();

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ------------------------------------------------------------
// Las 4 tools — cada una consulta un dato real del paciente.
// ------------------------------------------------------------

function buscarPaciente(paciente_id: string): Paciente | undefined {
  return pacientesSinteticos.find((p) => p.id === paciente_id);
}

const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "verificar_examen_vigente",
    description:
      "Consulta si el examen preoperatorio de un paciente está vigente y su fecha. Nunca asumas este dato, siempre consúltalo aquí.",
    input_schema: {
      type: "object",
      properties: {
        paciente_id: { type: "string", description: "ID del paciente, formato P-XXX" },
      },
      required: ["paciente_id"],
    },
  },
  {
    name: "verificar_equipo_medico",
    description:
      "Consulta si este paciente requiere relevo de equipo médico (cirujano/anestesista) y si ese relevo ya está confirmado.",
    input_schema: {
      type: "object",
      properties: {
        paciente_id: { type: "string", description: "ID del paciente, formato P-XXX" },
      },
      required: ["paciente_id"],
    },
  },
  {
    name: "verificar_insumos",
    description:
      "Consulta si este paciente necesita prótesis u otro insumo específico, y si el insumo reservado es compatible.",
    input_schema: {
      type: "object",
      properties: {
        paciente_id: { type: "string", description: "ID del paciente, formato P-XXX" },
      },
      required: ["paciente_id"],
    },
  },
  {
    name: "verificar_tiempo_disponible",
    description:
      "Consulta el margen de tiempo disponible (en minutos) para preparar a este paciente antes del cupo liberado.",
    input_schema: {
      type: "object",
      properties: {
        paciente_id: { type: "string", description: "ID del paciente, formato P-XXX" },
      },
      required: ["paciente_id"],
    },
  },
];

function ejecutarTool(nombre: string, input: { paciente_id: string }): object {
  const paciente = buscarPaciente(input.paciente_id);
  if (!paciente) {
    return { error: `Paciente ${input.paciente_id} no encontrado en el sistema.` };
  }

  switch (nombre) {
    case "verificar_examen_vigente":
      return { vigente: paciente.examen_vigente, fecha: paciente.examen_fecha };
    case "verificar_equipo_medico":
      return {
        relevo_necesario: paciente.relevo_necesario,
        relevo_confirmado: paciente.relevo_confirmado,
      };
    case "verificar_insumos":
      return {
        protesis_necesaria: paciente.protesis_necesaria,
        protesis_compatible: paciente.protesis_compatible,
      };
    case "verificar_tiempo_disponible":
      return { margen_tiempo_min: paciente.margen_tiempo_min };
    default:
      return { error: `Tool desconocida: ${nombre}` };
  }
}

// ------------------------------------------------------------
// System prompt — reglas fijas de comportamiento de Claude
// ------------------------------------------------------------

const SYSTEM_PROMPT = `Eres el asistente de verificación del Motor de Ejecutabilidad, un sistema
que ayuda a decidir si un paciente en lista de espera quirúrgica puede tomar un cupo recién liberado.

REGLAS ESTRICTAS:
- Nunca inventes datos de un paciente. Si necesitas saber algo (examen, equipo, insumos, tiempo), usa las tools disponibles.
- Nunca diagnostiques ni indiques tratamientos.
- Nunca decidas tú si el paciente puede operarse o no — esa decisión la toma un motor de reglas separado, y luego un profesional de salud la valida.
- Tu único trabajo es: consultar los datos del paciente con las tools, y luego explicar en 1-2 frases claras, en español, qué encontraste — para que un profesional lea tu resumen y decida rápido.
- Sé breve. No repitas los números crudos, interpreta lo que significan.`;

// ------------------------------------------------------------
// toolRunner — el loop que conecta Claude con las tools
// ------------------------------------------------------------

async function verificarPacienteConClaude(paciente_id: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Verifica la condición del paciente ${paciente_id} usando las tools disponibles (examen, equipo médico, insumos, tiempo). Luego dame un resumen breve.`,
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
      const textoFinal = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return textoFinal;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        const resultado = ejecutarTool(block.name, block.input as { paciente_id: string });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(resultado),
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  return "No se pudo completar la verificación (demasiadas vueltas).";
}

// ------------------------------------------------------------
// DEMO — verifica al paciente P-014 (caso Ejecutable) con
// Claude + tools, y muestra cómo el motor de reglas confirma
// el mismo resultado.
// ------------------------------------------------------------

async function main() {
  const shortlist = generarShortlist(pacientesSinteticos);
  const candidato = shortlist.find((p) => p.id === "P-014") ?? shortlist[0];

  if (!candidato) {
    console.log("No hay candidatos disponibles.");
    return;
  }

  console.log(`Verificando con Claude al candidato: ${candidato.id} (${candidato.nombre})\n`);

  const resumenClaude = await verificarPacienteConClaude(candidato.id);
  console.log("--- Resumen de Claude (interpreta, no decide) ---");
  console.log(resumenClaude);

  const resultadoMotor = clasificarPaciente(candidato);
  console.log("\n--- Decisión del motor de reglas (código puro, siempre igual) ---");
  console.log(`Estado: ${resultadoMotor.estado}`);
  console.log(`Motivo: ${resultadoMotor.motivo}`);
  if (resultadoMotor.tarea_pendiente) {
    console.log(`Tarea: ${resultadoMotor.tarea_pendiente}`);
  }
}

main().catch((err) => {
  console.error("Error:", err);
});