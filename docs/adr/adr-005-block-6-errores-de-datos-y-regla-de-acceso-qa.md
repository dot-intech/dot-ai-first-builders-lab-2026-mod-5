# ADR-005: Block 6 — errores de datos en la UI, ubicación de la regla de acceso QA y pool de BD

| Field | Value |
|-------|-------|
| Date | 2026-09-21 |
| Ticket | FEAT-001a |
| Status | Accepted |

## Context

El spec (Block 6) y la ADR-004 dejaban cuatro puntos sin resolver o en conflicto, que aparecieron al
implementar:

1. La action solo capturaba `QaAccessDeniedError` y la página solo `SessionExpired`/`SessionNotFound`.
   Un `RepositoryError` sin capturar lo registra Next completo, y su `cause` trae el SQL con emails y
   `token_hash`.
2. La UI necesita reconocer `RepositoryError`, pero la clase vivía en `data/errors.ts` y la ADR-004
   prohíbe que `ui/` importe de `data`.
3. En un archivo `'use server'` toda función exportada queda expuesta como endpoint invocable por el
   cliente. La regla de entorno y de email de QA (que la ADR-004 ubicaba "en la action") recibe
   `nodeEnv` por parámetro y no puede exportarse desde ahí.
4. `client.ts` no manejaba errores de clientes inactivos ni el pool duplicado por HMR (diferido desde
   el Block 4).

## Options considered

### Punto 1 — `RepositoryError` en la UI
- **A. Dejarlo subir a Next (spec):** sin código extra, pero filtra SQL con datos personales a los logs.
- **B. Capturarlo por `instanceof` y loguear solo `operation`:** estado genérico, sin fuga; se aparta del spec.

### Punto 2 — dónde vive la clase `RepositoryError`
- **A. `ui/` importa de `data/errors.ts` (excepción documentada):** sin refactor, pero deja una excepción a la regla de capas.
- **B. Moverla a `domain/errors.ts`:** `data → domain` y `ui → domain` ya son direcciones válidas; refactor mecánico.
- **C. `session-service` la traduce a un error de dominio:** el más puro, pero cambia el Block 5 ya revisado.

### Punto 3 — dónde vive la regla de acceso QA
- **A. `ui/acceso-qa.ts`, sin `'use server'`:** recibe la config por parámetro (testeable sin recargar módulos) y `actions.ts` exporta solo `qaBackdoorLogin()`.
- **B. `domain/`:** es lógica de negocio, pero se aparta aún más de la ADR-004 y suma un refactor.

## Decision

Decididas por el usuario el 2026-09-21: **1B, 2B y 3A**.

- `RepositoryError` pasa a `domain/errors.ts`; `data/errors.ts` conserva `conRepositoryError`.
- La action y la página capturan `RepositoryError` por `instanceof` (nunca un catch genérico), loguean
  solo `operation` y muestran un estado genérico; los demás errores se relanzan.
- `ui/acceso-qa.ts` valida entorno (`esEntornoPermitidoParaAccesoQa`) y email de QA, y llama a
  `iniciarSesionQa`. `actions.ts` tiene un único export y un test lo protege.
- El log de auditoría es una línea JSON por evento (sin email, token ni `cause`) con nivel según el
  resultado: `granted` info, `denied` warn, `error` error.
- `client.ts` registra `pool.on('error')` (loguea solo `error.name`) y cachea el pool en `globalThis`.

## Consequences

- Desvíos del spec (Block 6: la action redirige en vez de "lanzar"; la página también captura
  `RepositoryError`) y de la ADR-004 (la regla de QA está en un módulo de `ui/`, no en la action).
  El spec se corrige en el ticket de docs posterior.
- `ui/` y `app/` no importan de `data`. `domain/errors.ts` no importa nada.
- **`next build` exige `DATABASE_URL`:** `env.ts` lanza al importarse y `page.tsx` y `actions.ts` lo
  importan; verificado el 2026-09-21 (`EnvValidationError` al recolectar `/dev-login`). En CI o Docker
  basta un valor ficticio. Se anota en `.env.example`.
- Verificado con un build real: `NODE_ENV` queda inlineado como `"production"` y `/dev-login`
  responde 404 aunque `QA_ACCESS_EMAIL` esté configurada.
- Cualquier test que importe el `client.ts` real con `vi.resetModules()` debe limpiar la clave
  `'__nutrashotDbPool'` de `globalThis`, como hace `client.test.ts`.

> **Nota 2026-09-24 (FEAT-002):** la decisión 2B queda reemplazada en cuanto a la ubicación por
> ADR-007: `RepositoryError` pasa a `src/shared/errors/repository-error.ts` y `conRepositoryError` a
> `src/shared/db/con-repository-error.ts`. Su intención sigue vigente: `message` fijo, error original
> solo en `cause`, `operation` sin datos. La traducción de errores de sesión que hacía la página
> (1B) pasa a `resolverUsuarioDeSesion` en `src/shared/sesion/ui/`; el log sigue en el caller.
