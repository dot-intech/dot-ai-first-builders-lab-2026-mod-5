# ADR-008: UI interactiva — tests sin librerías nuevas y estilos con CSS Modules

| Field | Value |
|-------|-------|
| Date | 2026-09-25 |
| Ticket | FEAT-001b |
| Status | Accepted |

## Context

FEAT-001b trae la primera UI interactiva: elegir o sacar una foto, esperar el análisis, editar y
guardar (`docs/daw/prd/prd-FEAT-001b.md`). ADR-006 pide reevaluar su estrategia de tests en este
momento. Además es la primera pantalla con estilos, y el repo no tiene ningún CSS. `next-env.d.ts`
está en `.gitignore`, así que sin él `tsc` no resuelve `*.module.css`.

## Options considered

### Option 1: mantener ADR-006 — reductor puro + componentes por estado con `renderToStaticMarkup`
- **Pros:** sin dependencias nuevas; la lógica del flujo (transiciones, cancelar, descartar
  respuestas tardías) queda en funciones puras testeables en `node`.
- **Cons:** los eventos del navegador (clics, `onChange`, timers, canvas) no se ejecutan en tests.

### Option 2: `@testing-library/react` + `jsdom`
- **Pros:** tests de interacción cercanos al navegador.
- **Cons:** dependencias nuevas que hay que justificar y auditar; jsdom tampoco implementa canvas.

### Estilos: CSS global con prefijo vs. CSS Modules con un `.d.ts` versionado
- **Global:** simple, pero no aísla estilos y define una convención débil para todo el proyecto.
- **Modules:** estilos aislados por componente; solo requiere declarar el tipo en el repo.

## Decision

Opción 1 para tests y CSS Modules para estilos, elegidas por el usuario el 2026-09-24/25:

- Toda la lógica del flujo vive en `consumos/ui/flujo-nuevo-consumo.ts` (reductor puro). Descarta
  resultados de solicitudes no vigentes, y eso tiene test.
- `nuevo-consumo.tsx` es un contenedor fino que conecta eventos, timers y actions con el reductor.
  Los componentes de cada estado son presentacionales y se testean con `renderToStaticMarkup`.
- `reducir-imagen.ts` contiene el cálculo puro (dimensiones y calidad) y está testeado. Las
  llamadas a canvas viven aparte, en `canvas-imagen.ts`.
- Estilos en `*.module.css` junto al componente, tipados por `src/css-modules.d.ts` (versionado).

## Consequences

- `vitest.config.ts` → `coverage.exclude` suma **exactamente** estos archivos, sin globs y cada uno
  con su comentario:
  - `src/features/consumos/ui/nuevo-consumo.tsx`: cableado de eventos del navegador.
  - `src/features/consumos/ui/canvas-imagen.ts`: API de canvas, que no existe en `node`.
  - `src/css-modules.d.ts`: solo declara tipos.
- El contenedor no puede tener lógica de decisión: si aparece, se mueve al reductor.
- Con `css.include: []` (el default de Vitest), los estilos no se procesan en los tests. Los tests
  no afirman nombres de clase. Hay que verificarlo en CODE.
- Convención para features futuras: CSS Modules por componente; nada de CSS global salvo el reset
  que importe `src/app/layout.tsx`, si alguna vez hace falta.
- Actualiza ADR-006: la sigue en su intención (sin librerías nuevas) y cierra su pendiente.

> **Nota 2026-09-29 (FEAT-001c).** FEAT-001c no agrega excepciones: la lista de `coverage.exclude` sigue
> siendo exactamente la de arriba. Las pantallas nuevas van en archivos propios y se prueban con
> `renderToStaticMarkup`; las decisiones nuevas (baja confianza, carga manual, tiempo de guardado, sesión
> vencida) viven en el reductor. Ver ADR-010.
