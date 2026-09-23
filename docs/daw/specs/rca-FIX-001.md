# RCA FIX-001: Corregir spec-FEAT-001a.md para reflejar ADR-001..006 y el hallazgo W-2

| Field | Value |
|-------|-------|
| Ticket | FIX-001 |
| Fecha | 2026-09-22 |
| Componente afectado | `docs/daw/specs/spec-FEAT-001a.md` (artefacto de documentación; ningún código de aplicación se toca) |
| PRD relacionado | `docs/daw/prd/prd-FEAT-001a.md` — sin gap |

## Causa raíz

La spec de FEAT-001a (`docs/daw/specs/spec-FEAT-001a.md`) se congela como el contrato de CODE en el
momento en que PLAN aprueba la transición `PLAN → CODE`. A partir de ahí, las reglas globales del
orquestador prohíben modificarla fuera de la fase PLAN, y el grafo de transiciones no tiene un edge
`CODE → PLAN`: no existe un camino legal para que una decisión tomada durante la implementación
vuelva a escribirse en el texto de la spec.

Durante CODE, varias decisiones de diseño reales divergieron de lo que la spec aprobada describía.
Cada una se tomó con el usuario y quedó correctamente documentada como ADR — el mecanismo que DAW sí
permite usar en CODE — pero eso dejó a la spec desactualizada frente al código y a los propios ADR:

| # | Lo que dice la spec | Lo que quedó implementado | Respaldo |
|---|---|---|---|
| 1 | `esEntornoNoProductivo(nodeEnv)` — denylist (`nodeEnv !== 'production'`) | `esEntornoPermitidoParaAccesoQa(nodeEnv)` — allowlist explícita de entornos permitidos | ADR-001 |
| 2 | No menciona ningún control sobre el flag `secure` de la cookie | `cookieSesionEsSecure(nodeEnv)` decide el flag dinámicamente | ADR-002 |
| 3 | Block 4, Logic: "data no depende de domain" | Los repositorios importan `domain/rules` y `domain/types` (dirección de dependencia intencional) | ADR-004, ADR-005 |
| 4 | Block 4: `client.ts` "usa `env.databaseUrl` con `sslmode=require`" | El código deja que la propia `DATABASE_URL` decida el `sslmode`; no se fuerza ninguno | Sin ADR propio — ya señalado como asunción documentada en SAST (I-3) y threat model (F-TM-07); hallazgo **W-2** de la verificación |
| 5 | Block 5, Files: `crearSesion(usuarioId)`, sin mención de `iniciarSesionQa` ni `findById` | `crearSesion(usuarioId, now = new Date())`, `iniciarSesionQa(email)` (nueva), `getSession(token, now)` devuelve `Usuario`, `findById` en `usuario-repository` | ADR-004 |
| 6 | Block 6: la server action no describe capas explícitamente ni el manejo de `RepositoryError` en la página; no menciona archivos como `acceso-qa.ts`, `cookie-sesion.ts`, `estado-sesion.ts`, `registro-acceso-qa.ts` | La action llama al service (ADR-004); la página también atrapa `RepositoryError`; la regla de acceso vive en `ui/acceso-qa.ts` (ADR-005); tests de componentes React con `renderToStaticMarkup`, sin librerías nuevas (ADR-006) | ADR-004, ADR-005, ADR-006 |

Este es un hueco de **método**, no un defecto de código: el software funciona según lo verificado
(`docs/daw/reports/verify-FEAT-001a.md`, 20 PASS / 0 FAIL), y los ADR son la fuente de verdad
correcta. Lo que falta es que el texto de la spec —el artefacto de referencia para quien lea el
ticket después— diga lo mismo que los ADR y el código.

## Gap en el PRD

Ninguno. Los AC/NFR de `prd-FEAT-001a.md` siguen implementados correctamente; lo que cambió son
detalles de la spec (artefacto de PLAN), no los requisitos del PRD. Confirmado con el usuario.

## Alcance del fix

Editar `docs/daw/specs/spec-FEAT-001a.md` en los 6 puntos de la tabla de arriba, sin tocar código de
aplicación, sin tocar el PRD, sin tocar los ADR (quedan como la fuente primaria; la spec pasa a
citarlos donde corresponda).
