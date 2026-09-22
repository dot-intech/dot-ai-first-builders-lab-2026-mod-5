# Verificación — FEAT-001a: Acceso directo de QA sin magic link

| Campo | Valor |
|---|---|
| Fecha | 2026-09-22 |
| Rama / HEAD | `feat/FEAT-001a-acceso-qa` / `9e73ae9` |
| Resultado | **PASSED** — 0 FAIL, 2 WARN |
| Verificador | `daw-module-verifier` (agente que no escribió el código) |
| Referencia | PRD `docs/daw/prd/prd-FEAT-001a.md`, spec `docs/daw/specs/spec-FEAT-001a.md`, ADR-001..006, threat model + addendum, SAST `docs/daw/security/sast-FEAT-001a.md` |

> **Nota de precedencia:** la spec quedó congelada al aprobar PLAN y no se actualizó durante CODE (no
> existe edge CODE→PLAN en este pipeline). Los ADR-001 a 006 y el addendum del threat model tienen
> precedencia sobre el texto de la spec en los puntos ya identificados (nombres de funciones,
> `esEntornoPermitidoParaAccesoQa`, `cookieSesionEsSecure`, capas de `data`, firmas del Block 5,
> comportamiento del Block 6). Corregir la spec queda para un ticket de documentación aparte.

## Criterios de aceptación del PRD (F-VER-01)

| AC | Descripción | Código | Test | Veredicto |
|---|---|---|---|---|
| AC-01 | Acceso sin magic link con NODE_ENV permitido | `ui/acceso-qa.ts:autenticarAccesoQa` + `ui/actions.ts:qaBackdoorLogin` | `actions.integration.test.ts` (AC-01), `actions.test.ts`, `acceso-qa.test.ts` | ✅ PASS |
| AC-02 | Cuenta creada automáticamente la primera vez | `data/usuario-repository.ts:findOrCreateByEmail`, `domain/session-service.ts:iniciarSesionQa` | `usuario-repository.integration.test.ts`, `actions.integration.test.ts` | ✅ PASS |
| AC-03 | Rechazo incondicional en producción | `domain/rules.ts:esEntornoPermitidoParaAccesoQa` (ADR-001) + `ui/acceso-qa.ts` + `dev-login/page.tsx` (defensa en profundidad) | `actions.integration.test.ts` (AC-03, NFR-06, `it.each(['preview',''])`), `dev-login-page.test.tsx` | ✅ PASS |
| AC-04 | Cookie de sesión que identifica al usuario | `ui/actions.ts` + `ui/cookie-sesion.ts:opcionesCookieSesion` | `actions.integration.test.ts` (AC-04, NFR-02), `cookie-sesion.test.ts` | ✅ PASS |
| AC-05 | Sesión válida mientras no haya 24h de inactividad | `domain/session-service.ts:getSession` + `domain/rules.ts:sesionExpiradaPorInactividad` | `session-service.test.ts` (AC-05), `rules.test.ts` (casos límite 23h59m/24h00m/24h01m) | ✅ PASS |
| AC-06 | Exige nuevo acceso tras 24h de inactividad | `domain/session-service.ts:getSession` → `SessionExpiredError` | `session-service.test.ts` (AC-06, x2) | ✅ PASS |
| NFR-01 | Ventana deslizante de 24h | `rules.ts:sesionExpiradaPorInactividad` + `touchLastActivity` en cada lectura válida | `sesion-repository.integration.test.ts` | ✅ PASS |
| NFR-02 | Cookie `httpOnly` + `sameSite=lax` | `ui/cookie-sesion.ts:opcionesCookieSesion` | `cookie-sesion.test.ts`, `actions.integration.test.ts` | ✅ PASS |

Los tests de AC-01/02/03/04/06 verifican comportamiento real (filas en BD, hash persistido, cookie no seteada, usuario no creado), no solo códigos de status.

## Tareas de la spec (F-VER-02, F-VER-06)

| Bloque | Completitud | Nota |
|---|---|---|
| Block 1 — Bootstrap | ✅ 10/10 archivos + 3/3 tests requeridos (+4 extra) | |
| Block 2 — Schema Drizzle | ✅ 2/2 archivos + 3/3 tests requeridos (+1 extra) | |
| Block 3 — Dominio (rules/errors) | ✅ 3/3 archivos + 4/4 tests requeridos (+extras) | `esEntornoNoProductivo`→`esEntornoPermitidoParaAccesoQa` es precedencia de ADR-001 |
| Block 4 — Datos (cliente + repos) | ✅ 4/4 archivos + 5/5 tests requeridos (+extras) | Ver W-2 |
| Block 5 — Servicio de sesión | ✅ 1/1 archivo (+`iniciarSesionQa` por ADR-004) + 5/5 tests requeridos (+extras) | Firmas como quedaron implementadas (precedencia) |
| Block 6 — Backdoor + UI | ✅ 5/5 archivos de spec + 4 archivos nuevos (`acceso-qa.ts`, `cookie-sesion.ts`, `estado-sesion.ts`, `registro-acceso-qa.ts`, por ADR-004/005) + 6/6 tests requeridos (+muchos extra) | Capas, manejo de `RepositoryError` y tests de React: precedencia de ADR-004/005/006 |
| Verificación final (spec) | ✅ Los 5 puntos cumplidos | AC-01..06 trazados, rechazo incondicional con test dedicado, ningún archivo loguea token/email fuera del log de auditoría |

## Sad paths (F-VER-04)

✅ PASS — toda función que acepta input externo o no confiable tiene al menos un test con input inválido: `env.ts` (DATABASE_URL ausente), `rules.ts` (NODE_ENV inválido, fechas límite, email vacío/undefined), `session-service.ts:getSession` (token vacío, >128 chars, no-string, sin match), repositorios (error de conexión, violación UNIQUE, insert sin fila), `acceso-qa.ts` (entorno no permitido, email no configurado), `actions.ts`/`estado-sesion.ts` (cada tipo de error atrapado y el no atrapado), `dev-login/page.tsx` (`?error` con valores no `"1"`).

## Cobertura (F-VER-03)

Tomada del cierre de CODE (no re-ejecutada por el verificador; confirmó en cambio que `pnpm test:unit` corre en verde, 207/207, sin BD): **250/250 tests, 100% líneas (152/152), 100% branches (61/61), 100% funciones (47/47)**. Muy por encima del mínimo 80% y del 90% recomendado para lógica de negocio (W-VER-02 no aplica).

## Calidad (F-VER-05, W-VER-01, W-VER-03)

- ✅ `tsc --noEmit`, `eslint`, `prettier`: limpios (del cierre de CODE).
- ✅ Sin imports sin usar detectados.
- ✅ W-VER-03: sin tests dependientes de orden, estado global o timestamps/IDs hardcodeados fuera de contexto; cada test de integración crea y limpia sus propios datos (Rule #0).

## Hallazgos WARN (no bloquean)

| ID | Regla | Hallazgo | Disposición propuesta |
|---|---|---|---|
| W-1 | W-VER-01 (dead code, baja severidad) | `usuario-repository.ts:findByEmail` no tiene consumidor en código de producción de este ticket — solo lo usan sus propios tests. Está explícitamente en el spec (Block 4) y bien testeada; probablemente la use el login real en un ticket futuro. | No bloquea. Dejar como está: es API pública ya especificada, no código muerto real. |
| W-2 | Discrepancia spec↔código sin ADR dedicado | La spec (Block 4) dice que `client.ts` fuerza `sslmode=require`; el código deja que lo decida la propia `DATABASE_URL`. Ya identificado por el SAST (I-3, Low) y el threat model (F-TM-07, asunción documentada). No afecta ningún AC/NFR de este ticket. | Agregar a la lista de correcciones del ticket de documentación de la spec. |

## Nota de transparencia (fuera del alcance delegado)

El verificador no tuvo acceso a los reportes del implementador por bloque (evidencia TDD roja→verde), así que no confirmó esa evidencia punto por punto en esta pasada — se apoyó en que `.daw-state.json` ya registra `gates.tests`/`gates.sast` en verde desde el cierre de CODE y en que el historial de commits es consistente con un flujo por bloques.

## Veredicto

**Total: 20 PASS | 0 FAIL | 2 WARN → PASSED.** `gates.verify = true`.
