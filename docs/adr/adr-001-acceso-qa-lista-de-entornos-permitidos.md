# ADR-001: Acceso QA habilitado solo con una lista de entornos permitidos

| Field | Value |
|-------|-------|
| Date | 2026-09-19 |
| Ticket | FEAT-001a |
| Status | Accepted |

## Context

El PRD de FEAT-001a (AC-01, AC-03, FR-03) y el spec del Block 3 definen el acceso QA como "NODE_ENV
distinto de production" (función `esEntornoNoProductivo`, lista negra). Durante CODE se vio que
cualquier valor que no sea exactamente 'production' ('Production', 'prod', '') habilita el backdoor
sin ningún aviso. El PRD y el spec no se editan en CODE, así que este ADR es el registro.

## Options considered

### Option 1: Lista negra normalizada (`trim().toLowerCase() !== 'production'`)
- **Pros:** fiel al texto del PRD; 'qa' o 'preview' siguen habilitando.
- **Cons:** un typo ('prod') o un valor vacío sigue habilitando el backdoor (fail-open).

### Option 2: Lista de permitidos exacta: development, test y staging
- **Pros:** falla cerrado ante cualquier valor inesperado; no hace falta normalizar.
- **Cons:** se aparta de AC-01 para valores no listados; un entorno nuevo hay que agregarlo.

### Option 3: Lista de permitidos solo con development y test
- **Pros:** la más cerrada.
- **Cons:** excluye staging, que el threat model contempla como entorno de QA.

## Decision

Opción 2, decidida por el usuario el 2026-09-19. `esEntornoPermitidoParaAccesoQa(nodeEnv)` compara de
forma exacta. `src/env.ts` trata `NODE_ENV` sin definir o vacío como 'production'. La causa del
rechazo queda en `QaAccessDeniedError.reason` ('environment_not_allowed' | 'not_configured') y solo
va al log del servidor; el `message` sigue siendo genérico.

## Consequences

- Desvíos del texto aprobado: AC-01 ("distinto de production") y el nombre `esEntornoNoProductivo`
  del spec (Block 3). FR-03 y AC-03 siguen cumplidos y quedan reforzados. Valores como 'qa' o
  'preview' no habilitan el acceso.
- Next.js asigna NODE_ENV solo si falta: el CLI usa 'production' en `next build` y `next start` y
  'development' en `next dev`, y avisa ("non-standard NODE_ENV") si el valor definido no es
  estándar, sin pisarlo (`node_modules/next/dist/bin/next`). Además, en un build el bundler
  reemplaza `process.env.NODE_ENV` por el literal 'production'
  (`node_modules/next/dist/build/define-env.js:77`), salvo con `experimental.allowDevelopmentBuild`.
  Esto se verificó leyendo el código de Next 15.5.4; no se ejecutó `next build`.
- Consecuencia: en un despliegue construido el backdoor no se habilita ni con NODE_ENV=staging, así
  que 'staging' solo sirve para `next dev`, tests y scripts sin bundler. Para QA sobre un despliegue
  haría falta una variable explícita leída en runtime (por ejemplo `APP_ENV`), que implica cambiar
  el spec (ciclo a PLAN).
- El PRD dice que el chequeo se evalúa "en cada solicitud, no se cachea a nivel de build". Con el
  reemplazo de NODE_ENV en compilación eso ya no describe lo que ocurre: el resultado es más
  seguro (cerrado en builds), pero no equivale a lo escrito.
- Archivos: `domain/rules.ts`, `domain/errors.ts`, `src/env.ts` y sus tests. El Block 6 debe usar
  la regla nueva y nunca comparar `nodeEnv` con 'production'.
