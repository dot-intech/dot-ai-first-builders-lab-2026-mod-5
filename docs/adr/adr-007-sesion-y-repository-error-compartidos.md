# ADR-007: Sesión y `RepositoryError` como módulo compartido en `src/shared`

| Field | Value |
|-------|-------|
| Date | 2026-09-24 |
| Ticket | FEAT-002 |
| Status | Accepted |

## Context

FEAT-001b (feature `consumos`) necesita el usuario de la sesión activa, pero la sesión vive en
`qa-access` desde FEAT-001a. Además, si cada feature define su propio `RepositoryError`, un `catch`
por `instanceof` deja escapar el error de la otra, y Next lo registra con el SQL del `cause` (la fuga
que cerró la ADR-005). Detalle en `docs/daw/prd/prd-FEAT-002.md` y `docs/daw/security/threat-FEAT-002.md`.

## Options considered

### Option 1: `consumos` depende de `qa-access` (punto de entrada `usuario-de-sesion` en qa-access)
- **Pros:** no mueve código mergeado.
- **Cons:** acopla features entre sí; el login real y cada feature nueva heredan la dependencia.

### Option 2: solo `usuario-de-sesion` en `src/shared`, importando `qa-access`
- **Pros:** cambio chico.
- **Cons:** `shared` pasa a depender de una feature: esconde el acoplamiento en vez de quitarlo.

### Option 3: extraer toda la sesión y `RepositoryError` a `src/shared`, por capas
- **Pros:** una sola clase de error; ninguna feature depende de otra; la sesión queda lista para el login real.
- **Cons:** refactor de código mergeado (qa-access, tests, docs).

## Decision

Opción 3, elegida por el usuario el 2026-09-24:

- **Ubicación.** `src/shared/sesion/{domain,data,ui}`; `RepositoryError` en
  `src/shared/errors/repository-error.ts` y `conRepositoryError` en `src/shared/db/con-repository-error.ts`.
- **Inicio de sesión.** `iniciarSesionQa` pasa a ser `iniciarSesionParaEmail(email)` en el
  `session-service` compartido. El caller debe haber verificado la identidad antes; nunca se llama con
  un email del cliente sin verificar.
- **`resolverUsuarioDeSesion(token)`** (en `shared/sesion/ui`): recibe el token, no lee `next/headers`,
  y devuelve `usuario | sin-sesion | error(operation)`. No registra nada: el caller registra `operation`
  con su propio evento, nunca copia el error y trata el resultado con un `switch` exhaustivo.
- **Sin `'use server'`.** Ningún archivo de `src/shared` lleva esa directiva: si la llevara,
  `resolverUsuarioDeSesion` quedaría expuesta como oráculo de tokens.

Matriz de dependencias:

| Desde | Puede importar |
|---|---|
| `features/*/ui` | `shared/sesion/{ui,domain}`, `shared/errors` |
| `features/*/domain` | `shared/sesion/domain`, `shared/errors` |
| `features/*/data` | `shared/db`, `shared/errors` |
| `shared/sesion` | `shared/db`, `shared/errors` |
| `shared/errors` | nada |
| `shared/*` → `features/*` · feature → otra feature · fuera de `shared/sesion` → `shared/sesion/data` | **prohibido** |

## Consequences

- **ADR-005, decisión 2B:** se reemplaza su ubicación, no su intención. `RepositoryError` sigue con
  `message` fijo, el error original solo en `cause` y `operation` sin datos.
- **ADR-004:** el servicio de inicio de sesión ya no está en `qa-access`. El `session-service`
  compartido es la única pieza de `domain` que importa de `shared/sesion/data`.
- **Test guardián en `src/shared/`:** automatiza tres reglas: `shared` no importa de `features`, una
  feature no importa de otra, y ningún archivo de `shared` lleva `'use server'`. La regla entre
  features la sumó el usuario, más allá de FR-10.
- **Límite del guardián:** las demás celdas de la matriz no tienen test y se controlan en revisión y
  con `daw-arch-auditor`.
- **Archivos afectados:** `src/features/qa-access/**`, `src/app/dev-login/**`, `src/shared/**` y
  `vitest.config.ts`.
- **Documentación:** se agregan notas "ver ADR-007" en la ADR-002, 004 y 005, en
  `spec-FEAT-001a.md` y en `threat-FEAT-001a.md`.
