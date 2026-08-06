import { pacientesSinteticos, clasificarPaciente, evaluarCupo } from "./motor_ejecutabilidad";

console.log("=== Clasificación individual de los 8 pacientes ===\n");
for (const p of pacientesSinteticos) {
  const resultado = clasificarPaciente(p);
  console.log(`${p.id} (${p.nombre}) → ${resultado.estado}`);
  console.log(`   Motivo: ${resultado.motivo}`);
  if (resultado.tarea_pendiente) {
    console.log(`   Tarea: ${resultado.tarea_pendiente}`);
  }
  console.log("");
}

console.log("=== Evaluación de cupo (shortlist ordenada) ===\n");
const evaluacion = evaluarCupo(pacientesSinteticos);
evaluacion.shortlist.forEach((entry, i) => {
  console.log(
    `${i + 1}. ${entry.paciente.id} (${entry.paciente.prioridad}, ${entry.paciente.antiguedad_dias}d) → ${entry.resultado.estado}`
  );
});

console.log("\nGanador:", evaluacion.ganador ? evaluacion.ganador.id : "Ninguno");