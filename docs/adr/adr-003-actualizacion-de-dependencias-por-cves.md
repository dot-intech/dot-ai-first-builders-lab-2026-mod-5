# ADR-003: Actualización de dependencias por CVEs y devDependencies nuevas

| Field | Value |
|-------|-------|
| Date | 2026-09-19 |
| Ticket | FEAT-001a |
| Status | Accepted |

## Context

`pnpm audit` sobre las dependencias del Block 1 reportó 49 vulnerabilidades (5 críticas, 19 altas) en
next 15.5.4, vitest 2.1.8, drizzle-orm 0.36.4 y sus transitivas. El gate SAST bloquea todo CVE
crítico o alto sin posibilidad de suprimirlo (F-SAST-13). Las versiones del Block 1 no se
compararon con el registro de npm. AGENTS.md pide justificar en el spec toda librería nueva; el spec
está congelado en CODE, por eso la justificación va aquí.

## Options considered

### Option 1: Plan completo
next y eslint-config-next 15.5.25, drizzle-orm 0.45.2, drizzle-kit 0.31.10, vitest y
`@vitest/coverage-v8` 4.1.11 con `vite` 7.3.6 directo, eslint 9.39.5 y dos `pnpm.overrides`.
- **Pros:** audit en 0; probado en una copia (tsc, lint, tests unitarios y de integración,
  migraciones sin cambios).
- **Cons:** salto mayor de vitest (2 a 4); `vite` pasa a ser dependencia directa.

### Option 2: vitest 3.2.7 en lugar de 4.1.11
- **Pros:** no requiere `vite` directo; salto menor.
- **Cons:** deja 1 aviso moderado de desarrollo (suprimible solo con documentación formal).

### Option 3: Next 16
- **Pros:** resuelve `postcss` sin override.
- **Cons:** rompe `pnpm lint`: obliga a reescribir `eslint.config.mjs`.

### Option 4: drizzle 1.0 (release candidate)
- **Pros:** es la línea futura del ORM.
- **Cons:** no hay 1.0.0 estable (beta.22, rc.4 y rc.5); flujo de migraciones rediseñado; no validado.

## Decision

Opción 1, decidida por el usuario el 2026-09-19, con Drizzle en su última versión estable
(0.45.2 y 0.31.10).

## Consequences

- Devs nuevas justificadas aquí: `@vitest/coverage-v8` (medir el umbral de 80 % ya configurado en
  `vitest.config.ts`) y `vite` (peer obligatoria de vitest 4).
- `pnpm.overrides`: `next>postcss` a 8.5.28 (Next 15 fija 8.4.31, con 2 avisos altos, sin parche
  dentro de 15.x) y `@esbuild-kit/core-utils>esbuild` a 0.25.12. `engines.node` sube a `>=20.19`
  (vite 7). Solo se probó con Node 22.
- Riesgo para el Block 4: desde drizzle-orm 0.44 los errores del driver llegan como
  `DrizzleQueryError` (el código queda en `cause.code` y el `message` incluye SQL y parámetros).
  Los repositories deben propagar solo la causa y nunca loguear ese mensaje.
- Revisar Drizzle 1.x cuando haya una versión estable, idealmente antes de FEAT-001b.
