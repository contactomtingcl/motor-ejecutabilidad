// ============================================================
// MOTOR DE EJECUTABILIDAD
// Claude Impact Lab · Longevidad · Línea 02 (Descompresión)
// Equipo: Representando StartUp L.A · Código E91E72
//
// Principio de diseño: Claude interpreta y explica.
// Este motor de reglas (código puro) decide.
// Un profesional humano valida.
// ============================================================

import { z } from "zod";

// ============================================================
// SECCIÓN 1 — TIPOS
// ============================================================

export const PacienteSchema = z.object({
  id: z.string().regex(/^P-\d{3}$/, "El ID debe tener el formato P-XXX"),
  nombre: z.string(),
  prioridad: z.enum(["Alta", "Media"]),
  antiguedad_dias: z.number().int().positive(),
  examen_vigente: z.boolean(),
  examen_fecha: z.string(),
  contactable: z.boolean(),
  relevo_necesario: z.boolean(),
  relevo_confirmado: z.boolean(),
  protesis_necesaria: z.boolean(),
  protesis_compatible: z.boolean(),
  cambio_clinico_reportado: z.boolean(),
  transporte_confirmado: z.boolean(),
  margen_tiempo_min: z.number().int(),
  // Previene doble asignación del mismo paciente a dos cupos a la vez
  estado_proceso: z.enum(["libre", "en_proceso", "confirmado"]),
  // Único uso: desempate final cuando prioridad y antigüedad son iguales
  timestamp_registro: z.string(),
});

export type Paciente = z.infer<typeof PacienteSchema>;

export const EstadoSchema = z.enum(["Ejecutable", "Requiere revisión", "Bloqueada"]);
export type Estado = z.infer<typeof EstadoSchema>;

export interface ResultadoClasificacion {
  paciente_id: string;
  estado: Estado;
  motivo: string;
  tarea_pendiente?: string;
}

// Umbrales calibrados con fuentes reales (ver documento de justificación)
export const UMBRAL_EXAMEN_DIAS = 180; // 6 meses — SACH + charla Impact Lab ("ley internacional")
export const UMBRAL_MARGEN_SEGURO_MIN = 15;

// ============================================================
// SECCIÓN 2 — PACIENTES SINTÉTICOS (8, ninguno es una persona real)
// ============================================================

export const pacientesSinteticos: Paciente[] = [
  {
    id: "P-014",
    nombre: "Elena R.",
    prioridad: "Media",
    antiguedad_dias: 210,
    examen_vigente: true,
    examen_fecha: "2026-06-01",
    contactable: true,
    relevo_necesario: false,
    relevo_confirmado: false,
    protesis_necesaria: true,
    protesis_compatible: true,
    cambio_clinico_reportado: false,
    transporte_confirmado: true,
    margen_tiempo_min: 45,
    estado_proceso: "libre",
    timestamp_registro: "2026-01-08T09:00:00Z",
  },
  {
    id: "P-027",
    nombre: "Ricardo M.",
    prioridad: "Alta",
    antiguedad_dias: 340,
    examen_vigente: true,
    examen_fecha: "2026-05-15",
    contactable: true,
    relevo_necesario: false,
    relevo_confirmado: false,
    protesis_necesaria: true,
    protesis_compatible: true,
    cambio_clinico_reportado: true,
    transporte_confirmado: true,
    margen_tiempo_min: 40,
    estado_proceso: "libre",
    timestamp_registro: "2025-08-31T09:00:00Z",
  },
  {
    id: "P-033",
    nombre: "Manuel S.",
    prioridad: "Alta",
    antiguedad_dias: 400,
    examen_vigente: false,
    examen_fecha: "2026-01-10",
    contactable: true,
    relevo_necesario: false,
    relevo_confirmado: false,
    protesis_necesaria: true,
    protesis_compatible: true,
    cambio_clinico_reportado: false,
    transporte_confirmado: true,
    margen_tiempo_min: 50,
    estado_proceso: "libre",
    timestamp_registro: "2025-07-02T09:00:00Z",
  },
  {
    id: "P-041",
    nombre: "Carmen T.",
    prioridad: "Alta",
    antiguedad_dias: 380,
    examen_vigente: true,
    examen_fecha: "2026-05-01",
    contactable: false,
    relevo_necesario: false,
    relevo_confirmado: false,
    protesis_necesaria: true,
    protesis_compatible: true,
    cambio_clinico_reportado: false,
    transporte_confirmado: true,
    margen_tiempo_min: 40,
    estado_proceso: "libre",
    timestamp_registro: "2025-07-22T09:00:00Z",
  },
  {
    id: "P-052",
    nombre: "Jorge P.",
    prioridad: "Media",
    antiguedad_dias: 190,
    examen_vigente: true,
    examen_fecha: "2026-04-01",
    contactable: true,
    relevo_necesario: true,
    relevo_confirmado: false,
    protesis_necesaria: true,
    protesis_compatible: true,
    cambio_clinico_reportado: false,
    transporte_confirmado: true,
    margen_tiempo_min: 8,
    estado_proceso: "libre",
    timestamp_registro: "2026-01-28T09:00:00Z",
  },
  {
    id: "P-063",
    nombre: "Rosa V.",
    prioridad: "Alta",
    antiguedad_dias: 300,
    examen_vigente: true,
    examen_fecha: "2026-05-20",
    contactable: true,
    relevo_necesario: false,
    relevo_confirmado: false,
    protesis_necesaria: true,
    protesis_compatible: true,
    cambio_clinico_reportado: false,
    transporte_confirmado: false,
    margen_tiempo_min: 45,
    estado_proceso: "libre",
    timestamp_registro: "2025-10-10T09:00:00Z",
  },
  {
    id: "P-074",
    nombre: "Sergio A.",
    prioridad: "Media",
    antiguedad_dias: 150,
    examen_vigente: true,
    examen_fecha: "2026-03-01",
    contactable: true,
    relevo_necesario: false,
    relevo_confirmado: false,
    protesis_necesaria: true,
    protesis_compatible: false,
    cambio_clinico_reportado: false,
    transporte_confirmado: true,
    margen_tiempo_min: 40,
    estado_proceso: "libre",
    timestamp_registro: "2026-03-09T09:00:00Z",
  },
  {
    id: "P-085",
    nombre: "Marta L.",
    prioridad: "Media",
    antiguedad_dias: 100,
    examen_vigente: true,
    examen_fecha: "2026-06-10",
    contactable: true,
    relevo_necesario: false,
    relevo_confirmado: false,
    protesis_necesaria: true,
    protesis_compatible: true,
    cambio_clinico_reportado: false,
    transporte_confirmado: true,
    margen_tiempo_min: 10,
    estado_proceso: "libre",
    timestamp_registro: "2026-04-28T09:00:00Z",
  },
];

// ============================================================
// SECCIÓN 3 — MOTOR DE REGLAS
// (Claude nunca calcula esto — es código puro, siempre igual)
// ============================================================

export function clasificarPaciente(p: Paciente): ResultadoClasificacion {
  if (!p.contactable) {
    return {
      paciente_id: p.id,
      estado: "Bloqueada",
      motivo: "Paciente no contactable.",
      tarea_pendiente: "Contactar por canal alternativo, plazo 24h.",
    };
  }

  if (!p.examen_vigente) {
    return {
      paciente_id: p.id,
      estado: "Bloqueada",
      motivo: `Examen preoperatorio vencido (umbral: ${UMBRAL_EXAMEN_DIAS} días).`,
      tarea_pendiente: "Renovar examen, plazo 48h.",
    };
  }

  if (p.relevo_necesario && !p.relevo_confirmado) {
    return {
      paciente_id: p.id,
      estado: "Bloqueada",
      motivo: "Se requiere relevo de equipo médico y no está confirmado.",
      tarea_pendiente: "Confirmar relevo de equipo médico.",
    };
  }

  if (p.protesis_necesaria && !p.protesis_compatible) {
    return {
      paciente_id: p.id,
      estado: "Bloqueada",
      motivo: "La prótesis reservada no es compatible con este paciente.",
      tarea_pendiente: "Verificar y/o solicitar la prótesis correcta.",
    };
  }

  if (p.cambio_clinico_reportado) {
    return {
      paciente_id: p.id,
      estado: "Requiere revisión",
      motivo: "Cambio clínico reciente reportado. Requiere criterio profesional.",
    };
  }

  if (!p.transporte_confirmado) {
    return {
      paciente_id: p.id,
      estado: "Requiere revisión",
      motivo: "Transporte no confirmado. No se excluye automáticamente (regla de equidad).",
      tarea_pendiente: "Apoyo logístico de transporte.",
    };
  }

  if (p.margen_tiempo_min < UMBRAL_MARGEN_SEGURO_MIN) {
    return {
      paciente_id: p.id,
      estado: "Requiere revisión",
      motivo: `Margen de tiempo (${p.margen_tiempo_min} min) bajo el umbral seguro (${UMBRAL_MARGEN_SEGURO_MIN} min).`,
    };
  }

  return {
    paciente_id: p.id,
    estado: "Ejecutable",
    motivo: "Todos los requisitos críticos confirmados, tiempo suficiente.",
  };
}

export function generarShortlist(pacientes: Paciente[]): Paciente[] {
  const disponibles = pacientes.filter((p) => p.estado_proceso === "libre");
  const valorPrioridad = (pr: Paciente["prioridad"]) => (pr === "Alta" ? 1 : 0);

  return [...disponibles].sort((a, b) => {
    const diffPrioridad = valorPrioridad(b.prioridad) - valorPrioridad(a.prioridad);
    if (diffPrioridad !== 0) return diffPrioridad;

    const diffAntiguedad = b.antiguedad_dias - a.antiguedad_dias;
    if (diffAntiguedad !== 0) return diffAntiguedad;

    return new Date(a.timestamp_registro).getTime() - new Date(b.timestamp_registro).getTime();
  });
}

export interface EvaluacionCupo {
  shortlist: Array<{ paciente: Paciente; resultado: ResultadoClasificacion }>;
  ganador: Paciente | null;
  requiere_ampliar_busqueda: boolean;
}

export function evaluarCupo(pacientes: Paciente[], tamanoShortlist = 8): EvaluacionCupo {
  const candidatos = generarShortlist(pacientes).slice(0, tamanoShortlist);
  const shortlist = candidatos.map((paciente) => ({
    paciente,
    resultado: clasificarPaciente(paciente),
  }));
  const ganadorEntry = shortlist.find((e) => e.resultado.estado === "Ejecutable");

  return {
    shortlist,
    ganador: ganadorEntry ? ganadorEntry.paciente : null,
    requiere_ampliar_busqueda: !ganadorEntry,
  };
}