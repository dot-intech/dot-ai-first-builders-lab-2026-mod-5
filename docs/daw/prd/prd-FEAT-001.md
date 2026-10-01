# Parent PRD: Registrar consumo a partir de una foto (captura/galería) con análisis de IA

| Metric | Value |
|--------|-------|
| Ticket | FEAT-001 |
| Date | 2026-09-18 |
| Status | Split |

## Sub-tickets

| Sub-ticket | Title | PRD | Dependencies | Status |
|---|---|---|---|---|
| FEAT-001a | Acceso directo de QA sin magic link | prd-FEAT-001a.md | none | done — PR #1 mergeado a main (05785c2) |
| FEAT-001b | Registrar consumo a partir de una foto (captura/galería) con análisis de IA | prd-FEAT-001b.md | depends on a | done — PR #4 (draft), se mergea a main cuando se apruebe |
| FEAT-001c | Carga manual y manejo de baja confianza en el registro de consumo por foto | prd-FEAT-001c.md | depends on b | done — PR #5 (draft), se mergea a main cuando se apruebe |

## Suggested implementation order
a → b → c

> **The `Status` column is maintained, not decorative.** RELEASE's closeout moves the finished
> sub-ticket to `done` — with where its branch landed — and the next one to `active`.

## Original context

NutraShot necesita registrar el consumo de un usuario a partir de una foto de su plato: capturarla
o elegirla de la galería, analizarla con un modelo de visión (Google AI Studio,
`gemini-3.1-flash-lite`), mostrarle la descripción, las calorías y el desglose nutricional
estimados, permitirle revisarlos/editarlos y guardar el consumo en la base de datos.

El PRD general (`docs/daw/prd/PRD.md`) exige autenticación real (magic link) y un tablero principal
antes de este flujo, pero ninguno de los dos existe en el código todavía. El control de alcance de
DEFINE detectó que el PRD original (21 criterios de aceptación, 4 áreas distintas: acceso/sesión,
captura/carga de imagen, integración con el modelo de visión, persistencia en BD) era demasiado
grande para un solo ticket, y se partió en dos:

- **FEAT-001a** aísla el mecanismo de acceso directo (backdoor) para el email de QA — la porción de
  RF-03b del PRD general — de forma que exista un usuario de sesión al que asociar los consumos, sin
  esperar al ticket de autenticación completo (magic link).
- **FEAT-001b** es el flujo de usuario completo (captura/carga → análisis → revisión/edición →
  guardado), asumiendo que ya existe un usuario de sesión activa provisto por FEAT-001a.

El 2026-09-23, al retomar FEAT-001b, el control de alcance detectó que seguía siendo grande (19
criterios de aceptación, 3 áreas) y se volvió a dividir:

- **FEAT-001b** conserva el camino feliz (captura/galería → análisis → revisión/edición → guardado,
  y cancelación) y el mensaje de error ante fallo o demora > 30 s del análisis.
- **FEAT-001c** toma la carga manual tras un error, y la advertencia / recarga / edición obligatoria
  ante estimaciones de baja confianza.
