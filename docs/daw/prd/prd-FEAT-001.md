# Parent PRD: Registrar consumo a partir de una foto (captura/galería) con análisis de IA

| Metric | Value |
|--------|-------|
| Ticket | FEAT-001 |
| Date | 2026-09-18 |
| Status | Split |

## Sub-tickets

| Sub-ticket | Title | PRD | Dependencies | Status |
|---|---|---|---|---|
| FEAT-001a | Acceso directo de QA sin magic link | prd-FEAT-001a.md | none | done — PR #1 (draft), se mergea cuando se apruebe |
| FEAT-001b | Registrar consumo a partir de una foto (captura/galería) con análisis de IA | prd-FEAT-001b.md | depends on a | active |

## Suggested implementation order
a → b

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
