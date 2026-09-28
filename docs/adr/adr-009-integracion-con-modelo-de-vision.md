# ADR-009: Integración con el modelo de visión (Google AI Studio) como servicio externo pago

| Field | Value |
|-------|-------|
| Date | 2026-09-25 |
| Ticket | FEAT-001b |
| Status | Accepted |

## Context

FEAT-001b analiza la foto de un plato con `gemini-3.1-flash-lite` usando `@google/genai`
(`docs/daw/prd/prd-FEAT-001b.md`, FR-05). Es la primera integración del proyecto con un servicio
externo que tiene costo, que recibe datos personales (la foto) y que devuelve texto no confiable
(`docs/daw/security/threat-FEAT-001b.md`, TB4/TB5). Esta ADR fija el patrón para esta integración y
para las próximas.

## Options considered

### Option 1: adaptador en `features/<feature>/data`, con la configuración en `src/env.ts`
- **Pros:** sigue la matriz de ADR-007 (los paquetes externos van en `data`); un solo lector de
  entorno; se mockea en un único punto.
- **Cons:** si otra feature necesita el mismo servicio, habrá que moverlo a `shared`.

### Option 2: cliente compartido en `src/shared/ia` y lectura directa de `process.env`
- **Pros:** reutilizable desde el día uno.
- **Cons:** abstracción prematura con un solo consumidor; crea un segundo patrón de configuración.

## Decision

Opción 1, con decisiones del usuario del 2026-09-24/25:

- **Dónde vive.** `consumos/data/modelo-vision.ts` es el único archivo que importa `@google/genai`.
  El SDK queda fijado en `2.24.0` exacto y se corre `pnpm audit` antes de fijarlo.
- **La key.** `GEMINI_API_KEY` es opcional en `src/env.ts`: se le aplica `trim`, vacía cuenta como no
  configurada y nunca lleva el prefijo `NEXT_PUBLIC_`. El adaptador la lee recién al llamar al
  modelo. Si falta, lanza `AnalisisImagenError('no-configurado')`.
- **Tiempo.** Abort a los 25 s en el servidor, menor que el temporizador de 30 s del cliente (NFR-02).
- **Errores.** Todo fallo del SDK (red, abort, HTTP, JSON o guard) se envuelve en
  `AnalisisImagenError(reason, { cause })` con mensaje fijo. El log nunca copia `cause`, la imagen
  ni la respuesta.
- **Respuesta.** Se pide JSON con `responseSchema`; lo que vuelve se trata como `unknown` y pasa por
  un guard escrito a mano.
- **Datos.** La imagen nunca se escribe en disco, BD ni logs propios (NFR-04).
- **Tests.** Siempre con `vi.mock` explícito del adaptador o de `@google/genai`. Nunca se llama a la
  API paga, aunque haya una key en el entorno.

## Consequences

- **Condición del riesgo aceptado #1:** antes de habilitar usuarios reales, la key debe pertenecer a
  un proyecto con facturación (servicios pagos). En el nivel gratuito, Google usa el contenido para
  entrenar y admite revisión humana.
- Hay que configurar un presupuesto o una cuota en Google para la key usada (riesgo aceptado #2).
- El ID `gemini-3.1-flash-lite` se confirma con una prueba manual cuando el usuario cargue la key.
- Archivos afectados: `src/env.ts` (+ test), `.env.example`, `package.json`, `pnpm-lock.yaml` y
  `src/features/consumos/data/modelo-vision.ts` (+ test).
