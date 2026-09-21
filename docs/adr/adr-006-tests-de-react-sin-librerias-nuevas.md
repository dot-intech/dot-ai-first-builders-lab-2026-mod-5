# ADR-006: Tests de componentes React con `renderToStaticMarkup`, sin librerías nuevas

| Field | Value |
|-------|-------|
| Date | 2026-09-21 |
| Ticket | FEAT-001a |
| Status | Accepted |

## Context

El Block 6 introduce la primera UI del proyecto y el spec pide tests de la página (`dev-login-page`).
El repo no tiene `@testing-library` ni `jsdom`, `vitest.config.ts` corre en entorno `node` y el
`tsconfig` usa `jsx: "preserve"`. `AGENTS.md` exige justificar en el spec cualquier librería nueva, y
el spec está congelado en CODE.

## Options considered

### Option 1: `renderToStaticMarkup` de `react-dom/server` (ya es dependencia)
- **Pros:** sin librerías nuevas ni `pnpm audit` adicional; las páginas async se invocan y se
  renderizan a HTML; sirve para server components y para el botón dentro del `<form>`.
- **Cons:** no simula interacción (clics, estado `pending` de `useFormStatus`); las aserciones son
  sobre un string de HTML.

### Option 2: `@testing-library/react` + `jsdom`
- **Pros:** tests más cercanos al navegador y con interacción.
- **Cons:** dependencias nuevas que hay que justificar (esta misma ADR), auditar y mantener; más
  costo para un bloque con una sola pantalla.

## Decision

Opción 1, decidida por el usuario el 2026-09-21. `next/headers` y `next/navigation` se mockean con
factory; `redirect` y `notFound` mockeados lanzan un error centinela, como hace Next. El único cambio
de configuración es `esbuild: { jsx: 'automatic' }` en `vitest.config.ts`.

## Consequences

- Los tests cubren qué se renderiza (estados de la página, botón dentro del `<form>`, mensajes
  genéricos) pero no la interacción. Lo que dependa de eventos de cliente quedaría sin cubrir.
- Cuando FEAT-001b agregue UI interactiva (subida de foto, edición del análisis) hay que reevaluar
  esta decisión con una ADR nueva.
- Los `.tsx` entran en la cobertura (`src/**/*.{ts,tsx}`); las páginas y el layout tienen tests de humo.
