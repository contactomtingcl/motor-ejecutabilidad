# Motor de Ejecutabilidad

Arquitectura de agente con IA para descompresión de listas de espera quirúrgicas.

**Best AI Builder — Claude Impact Lab Longevidad 2026, evento de Anthropic.**
Mención especial otorgada por la arquitectura técnica más sólida entre las 43 iniciativas presentadas por 154 participantes.
Credencial pública verificable: https://longevidad.benditaia.cl/certificados/IL-2026-APAWHN

Autor: **Matías Ignacio Navarro Arroyo** — Cabrero, Región del Biobío, Chile.
Construido en solitario durante las 48 horas del evento, desde cero hasta demostración funcional, en un formato que contemplaba equipos de dos a cuatro personas. Representando a StartUp L.A., Línea 02 — Descompresión de listas de espera quirúrgicas.

---

## El problema

Al primer trimestre de 2026, 398.496 personas esperaban una cirugía en el sistema público chileno, según cifras del Ministerio de Salud. Algunas llevan años.

Cuando un cupo de pabellón se libera de improviso, ese cupo suele perderse: nadie alcanza a determinar a tiempo si es realmente utilizable ni a quién ofrecérselo. La lista de espera no avanza aunque haya capacidad disponible ese mismo día.

El dato existe. No llega a tiempo a quien puede actuar.

## Qué hace este sistema

Cuando se libera un cupo quirúrgico, verifica con herramientas si el siguiente paciente de la lista está en condiciones de tomarlo, y entrega a un profesional de salud un resumen legible con la decisión ya fundamentada.

---

## Arquitectura: tres capas, responsabilidades separadas

| Capa | Rol | Implementación |
|---|---|---|
| Modelo de lenguaje | Interpreta y explica | Claude vía API de Mensajes, con tool use |
| Motor de reglas | **Decide** | TypeScript determinístico, sin IA |
| Profesional de salud | Valida | Confirmación humana obligatoria |

El modelo **no puede** calcular el estado de un caso aunque quisiera: sus herramientas solo devuelven resultados ya computados por código puro. No es una promesa de comportamiento, es una imposibilidad técnica verificable en `src/motor_ejecutabilidad.ts`, donde `clasificarPaciente()` no contiene una sola llamada a un modelo.

### Las cuatro herramientas

El agente nunca inventa datos. Cuando necesita un dato del paciente, lo pide:

- `verificar_examen_vigente` — vigencia y fecha del examen preoperatorio
- `verificar_equipo_medico` — si se requiere relevo de equipo y si está confirmado
- `verificar_insumos` — si se necesita prótesis y si la reservada es compatible
- `verificar_tiempo_disponible` — margen de coordinación en minutos

El bucle de agente está acotado con un límite explícito de iteraciones, y cada resultado de herramienta se despacha con tipos estrictos.

---

## Capas de seguridad

**1. Guardia de privacidad.** Validación por expresión regular que rechaza, mediante una excepción propia (`DatosNoSinteticosError`), cualquier identificador que no tenga formato sintético `P-XXX`. Se ejecuta antes de procesar dato alguno. Marco normativo considerado: Ley 20.584 y Ley 21.719.

**2. Fallback seguro.** Si la verificación con el modelo no está disponible por cualquier motivo, ningún caso se marca `Ejecutable` por defecto: se degrada a `Requiere revisión`. Un falso positivo es una persona enferma que viaja hasta un hospital para una operación que no existe.

**3. Log de auditoría.** Cada evaluación queda registrada con marca de tiempo en `audit_log.jsonl`, formato JSON Lines append-only. Permite reconstruir qué vio el sistema y por qué clasificó cada caso como lo hizo.

**4. Regla de equidad.** La falta de confirmación de transporte deriva el caso a revisión humana y nunca lo excluye automáticamente, para no penalizar a pacientes rurales por una barrera logística.

---

## Decisiones de diseño

- **Contrato de datos único.** Esquemas Zod con tipos derivados por inferencia (`z.infer`): la misma definición valida en tiempo de ejecución y tipa en tiempo de compilación.
- **Priorización con desempate en cascada.** Prioridad clínica, luego antigüedad en lista, luego marca de tiempo de registro. El campo `estado_proceso` impide asignar un mismo paciente a dos cupos simultáneos.
- **Simulación condicional.** El generador de reporte toma el caso real, corrige solo el campo que hoy lo detiene y **reejecuta el motor de reglas real** para mostrar a qué estado pasaría. No inventa una proyección: la calcula.
- **Capa de presentación desacoplada.** El reporte HTML se genera con escapado de salida y no toca la lógica de decisión.

---

## Datos

Los 8 pacientes del repositorio son **completamente sintéticos**. Nombres genéricos, identificadores `P-XXX`, sin RUT, sin direcciones, sin fechas de nacimiento. Ninguno corresponde a una persona real. El sistema rechaza por diseño cualquier identificador que no tenga ese formato.

---

## Estructura

```
src/
  motor_ejecutabilidad.ts   Motor de reglas + esquemas Zod + casos sintéticos
  claude_verificacion.ts    Agente con las 4 herramientas
  motor_final.ts            Guardia de privacidad + fallback + auditoría
  generar_reporte.ts        Reporte HTML con simulación condicional
  demo_reglas.ts            Motor de reglas aislado, sin API
  prueba.ts                 Prueba de conexión
```

## Ejecutar

```bash
npm install
echo "ANTHROPIC_API_KEY=tu_clave" > .env

npx tsx src/demo_reglas.ts      # motor de reglas, sin API
npx tsx src/motor_final.ts      # sistema completo con las 3 capas de protección
npx tsx src/generar_reporte.ts  # genera reporte.html
```

Requiere Node.js y una clave de API de Anthropic. La clave se lee desde `.env` y nunca se versiona.

---

## Alcance

Prototipo construido en 48 horas para demostrar una arquitectura, no un sistema en producción. Los umbrales de decisión son configurables y requieren calibración clínica antes de cualquier uso real. La decisión final siempre corresponde a un profesional de salud.

---

**Matías Ignacio Navarro Arroyo**
Fundador y CEO de ORA IA SpA · https://oraialert.com
https://linkedin.com/in/matiasnavarroarroyo
