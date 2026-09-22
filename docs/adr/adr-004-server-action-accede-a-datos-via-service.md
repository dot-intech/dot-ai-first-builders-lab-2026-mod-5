# ADR-004: La server action de QA accede a los datos a través de `session-service`

| Field | Value |
|-------|-------|
| Date | 2026-09-21 |
| Ticket | FEAT-001a |
| Status | Accepted |

## Context

El spec (Block 6, "Aclaración de capas") hace que `ui/actions.ts` llame directo a
`usuarioRepository.findOrCreateByEmail` y luego a `sessionService.crearSesion`. `AGENTS.md` dice que
la UI nunca habla con la base de datos y que siempre pasa por un service. Lo detectó
`/daw-validate-arch` antes de empezar el Block 5.

## Options considered

### Option 1: la action llama al repository (texto del spec)
- **Pros:** fiel al spec aprobado; no agrega código al Block 5.
- **Cons:** la UI importa de `data`, contra la regla de capas de `AGENTS.md`; habría que
  documentarlo como excepción.

### Option 2: `session-service` expone una función de inicio de sesión de QA
- **Pros:** cumple la regla de capas; la action solo conoce el service; el flujo usuario + sesión
  queda en un único punto testeable con `vi.mock` de los repositories.
- **Cons:** se aparta del spec; agrega una función y sus tests al Block 5; `session-service` pasa a
  importar también `usuario-repository`.

## Decision

Opción 2, decidida por el usuario el 2026-09-21. `domain/session-service.ts` exporta, además de
`crearSesion` y `getSession`, una función (`iniciarSesionQa`) que hace `findOrCreateByEmail` +
`crearSesion` y devuelve el token crudo. Las comprobaciones de entorno y de email de QA (`env`,
`QaAccessDeniedError`) siguen en la action: el service no lee `env`.

## Consequences

- Desvío del texto del spec (Block 6, "Aclaración de capas" y pasos 4-5 de `qaBackdoorLogin`, y la
  lista de archivos del Block 5). Las ADR tienen precedencia sobre el spec; el spec se corrige en el
  ticket de docs posterior a FEAT-001a.
- `ui/actions.ts` no importa nada de `data`; solo de `domain` (`rules`, `errors`, `session-service`).
- `session-service.ts` importa `usuario-repository` y `sesion-repository`, y sigue siendo la única
  pieza de `domain` que importa de `data`.
- El Block 5 suma tests de `iniciarSesionQa` (crea o reutiliza el usuario, crea la sesión con su
  id y devuelve el token crudo).
