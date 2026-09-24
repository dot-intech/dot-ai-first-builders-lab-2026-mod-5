# Verificación — FEAT-002: Extraer la sesión y RepositoryError de qa-access a src/shared

| Campo | Valor |
|---|---|
| Fecha | 2026-09-24 |
| Rama / HEAD | `feat/FEAT-002-sesion-compartida` / `846d0a1` |
| Resultado | **PASSED** — 0 FAIL, 6 WARN |
| Verificador | `daw-module-verifier` (agente que no escribió el código), más prueba manual del orquestador |
| Referencia | PRD `docs/daw/prd/prd-FEAT-002.md` (PRD loops 1), spec `docs/daw/specs/spec-FEAT-002.md` (Spec loops 1), ADR-007, threat model `docs/daw/security/threat-FEAT-002.md`, SAST `docs/daw/security/sast-FEAT-002.md` |

## Criterios de aceptación del PRD (F-VER-01)

| AC | Código | Tests | Veredicto |
|---|---|---|---|
| AC-01 | `shared/sesion/domain/session-service.ts`: `getSession`, `crearSesion`, `iniciarSesionParaEmail`; consumidos por `qa-access/ui/acceso-qa.ts` y `app/dev-login/page.tsx` | `session-service.test.ts`, `acceso-qa.test.ts` | ✅ PASS |
| AC-02 | `shared/sesion/data/sesion-repository.ts`, `usuario-repository.ts` | Integration tests de ambos repositorios (BD real); propagación de `RepositoryError` en `session-service.test.ts` | ✅ PASS |
| AC-03 | `shared/sesion/domain/errors.ts`, lanzados por `getSession` | `session-service.test.ts` (token vacío, 129 caracteres, tipos inválidos, hash o usuario inexistente, más de 24 h); `qa-access/domain/errors.test.ts` (`instanceof`) | ✅ PASS |
| AC-04 | `shared/sesion/domain/rules.ts` | `shared/sesion/domain/rules.test.ts` (bordes 23h59m/24h/24h01m, fechas inválidas y futuras, lista privada). Mismo conteo de `it`/`expect` que en main | ✅ PASS |
| AC-05 | `shared/sesion/ui/cookie-sesion.ts` (100% de similitud con el original) | `cookie-sesion.test.ts` (100% de similitud), `actions.test.ts`, `actions.integration.test.ts` | ✅ PASS |
| AC-06 | `shared/errors/repository-error.ts`, `shared/db/con-repository-error.ts` | `repository-error.test.ts`, `con-repository-error.test.ts`, integration tests de repositorios | ✅ PASS |
| AC-07 | `shared/sesion/ui/usuario-de-sesion.ts:resolverUsuarioDeSesion` | `usuario-de-sesion.test.ts` | ✅ PASS |
| AC-08 | Ídem | `usuario-de-sesion.test.ts` (inexistente, expirada con `toStrictEqual` contra inexistente, token `undefined`) | ✅ PASS |
| AC-09 | Ídem | `usuario-de-sesion.test.ts` (resultado sin `message` ni `cause`; relanza otros errores) | ✅ PASS |
| AC-10 | `qa-access/ui/estado-sesion.ts:resolverEstadoSesion` (switch exhaustivo sin `default`), `app/dev-login/page.tsx` | `estado-sesion.test.ts` (aserciones sin cambios), `dev-login-page.test.tsx`; prueba manual (abajo) | ✅ PASS |
| AC-11 | Contenido de `src/features/qa-access/` | Regla 4 de `shared/reglas-de-dependencias.test.ts`; listado manual del árbol | ⚠️ WARN 4 |
| AC-12 | `shared/reglas-de-dependencias.test.ts` | Reglas 1–3 sobre el código real, tests del parser y de la resolución, violaciones simuladas | ✅ PASS |

## Requisitos no funcionales

| NFR | Evidencia | Veredicto |
|---|---|---|
| NFR-01 | Revisión del diff de los tests existentes: solo cambian imports, rutas de `vi.mock`, ubicación y el renombre aprobado (identificador y título de un `describe`). `MINUTO_MS`/`HORA_MS` se movieron con los tests que las usan. 0 aserciones modificadas | ✅ PASS |
| NFR-02 | `pnpm test:coverage`: 100% de sentencias (157/157), ramas (64/64), funciones (48/48) y líneas (157/157). Umbrales sin cambios | ✅ PASS |
| NFR-03 | `git diff --stat main...HEAD -- package.json pnpm-lock.yaml drizzle/` vacío; `schema.ts` solo cambia un comentario | ✅ PASS |
| NFR-04 | `RepositoryError` idéntico salvo el JSDoc (que ya decía una ubicación falsa); tests de `message` fijo intactos | ✅ PASS |

## Tareas de la spec (F-VER-02, F-VER-06)

| Bloque | Commit | Veredicto |
|---|---|---|
| Block 1 — `RepositoryError` y `conRepositoryError` a `src/shared` | `64bdefb` | ✅ PASS (ver WARN 1) |
| Block 2 — Dominio y datos de la sesión a `src/shared/sesion` | `f9826fd` | ✅ PASS |
| Block 3 — Cookie, `resolverUsuarioDeSesion` y `/dev-login` | `4777159` | ✅ PASS |
| Block 4 — Test guardián de dependencias | `96b9379` | ✅ PASS |

Verificación final de la spec: `tsc --noEmit`, `pnpm lint`, `pnpm test:unit`, `pnpm test:integration` y `pnpm test:coverage` pasan (294/294 tests, 24 archivos). La búsqueda de rutas viejas (`qa-access/domain/session-service`, `qa-access/domain/types`, `qa-access/data/`, `qa-access/ui/cookie-sesion`, `iniciarSesionQa`), incluidos los strings de `vi.mock`, no encuentra nada.

## Reglas §5

| Regla | Resultado |
|---|---|
| F-VER-01 | ✅ Los 12 AC tienen tests que pasan (AC-11 con WARN 4) |
| F-VER-02 | ✅ Los 4 bloques están implementados |
| F-VER-03 | ✅ 100% líneas, ramas y funciones |
| F-VER-04 | ✅ Camino triste en cada función con input: `getSession` (token vacío, 129 caracteres, tipos inválidos, borde de 128), `resolverUsuarioDeSesion` (`undefined`, errores de sesión, `RepositoryError`, errores inesperados), `conRepositoryError` (consulta que lanza), parser del guardián (paquetes externos, `${`, `'use server'` en JSDoc, falsos positivos) |
| F-VER-05 | ✅ `tsc` y lint sin errores |
| F-VER-06 | ✅ Existen y pasan todos los tests exigidos por los bloques 1–4 |
| W-VER-01 | ✅ Sin imports sin usar. `ResultadoUsuarioDeSesion` se exporta como contrato para FEAT-001b |
| W-VER-02 | ✅ Dominio y servicios al 100% |
| W-VER-03 | ✅ con nota: los fake timers se restauran en `afterEach`; el guardián lee el disco real en `beforeAll` y también escanea archivos locales sin commitear de `src/`, lo que es buscado |

## Evidencia de tests vistos en rojo antes de implementar

| Tests | Evidencia |
|---|---|
| Movidos (bloques 1–3) | Fallaron por "Cannot find module" antes de mover el código. Es el único rojo posible en un movimiento: prueba que apuntan a la ubicación nueva |
| `con-repository-error.test.ts` (nuevo) | "Cannot find module" y, además, chequeo de mutación (`throw` → `return undefined`): el test de relanzamiento se puso en rojo |
| `usuario-de-sesion.test.ts` (nuevo) | 6/6 en rojo contra una versión provisional que lanzaba "no implementado" (2 por aserción y 4 por la excepción de esa versión) |
| Guardián, ronda 1 | 18/30 en rojo con aserciones reales contra versiones provisionales; los 12 restantes son casos negativos o corren sobre el código real. Cada regla se probó con una violación temporal sobre el código real y se revirtió |
| Guardián, ronda 2 y ajustes | 4/4 tests nuevos del parser en rojo; el test del genérico anidado, `vi.doUnmock` y `vi.importMock` en rojo antes de corregir la regex. Regla 1 re-probada con `vi.importActual` |
| Test del alias de `tsconfig.json` | **No se vio en rojo** (WARN 5) |

## Prueba manual de `/dev-login` (AC-10)

`pnpm dev` contra la BD de test, con `QA_ACCESS_EMAIL` pasado solo a ese proceso:

| Caso | Resultado |
|---|---|
| Sin cookie | HTTP 200 con el botón "Ingresar como QA" |
| Envío del formulario de acceso QA | 303 a `/dev-login`; cookie `nutrashot_session` `httpOnly` con token de 64 caracteres |
| Recarga con la cookie | "Conectado como qa-manual@example.test" |
| Cookie inválida | Botón, igual que sin sesión |
| BD caída | "No se pudo verificar la sesión"; log `{"event":"dev_login_page","outcome":"error","operation":"sesion.findByTokenHash"}` |

Los logs del servidor muestran solo eventos con `event`, `outcome` y `operation`. No aparecen emails, SQL, `token_hash` ni la URL de la BD.

## Advertencias (no bloquean)

1. **Lista de archivos del Block 1 incompleta.** La spec no nombraba `src/features/qa-access/domain/session-service.test.ts`, que también importaba `RepositoryError`. El cambio fue obligatorio y se limitó al import. Es un error de inventario de la spec, no de la implementación.
2. **`qa-access/domain/errors.test.ts` prueba los errores de sesión** bajo `describe('errores tipados de qa-access')`. La spec lo pedía así y NFR-01 impide tocar las aserciones. Deuda menor: mover esas pruebas a `src/shared/sesion/domain/` en un ticket posterior.
3. **Imports fuera de la matriz de ADR-007, anteriores a este ticket.** `src/app/dev-login/page.tsx` importa `features/qa-access/domain/rules` (la matriz solo prevé `app` → capas `ui`), y `src/features/qa-access/ui/actions.integration.test.ts` importa `shared/db` (schema y mock del client). Candidatos a un ticket aparte, que además aclare en ADR-007 la excepción para tests de integración.
4. **AC-11 cubierto por una lista de prohibidos.** La regla 4 del guardián detecta 4 rutas concretas. Un módulo de sesión nuevo con otro nombre en qa-access no la haría fallar. Hoy AC-11 se cumple (árbol verificado a mano). Además, FR-09 no nombra `estado-sesion.ts`, que la spec mantiene en qa-access como adaptador de la pantalla QA (FR-08): diferencia de redacción entre PRD y spec, no un fallo.
5. **El test del alias de `tsconfig.json` nunca se vio en rojo.** Puede fallar por construcción (`toEqual` estricto sobre el archivo real), pero probarlo exigía modificar `tsconfig.json`.
6. **Límites conocidos del parser del guardián**, documentados en el código: un apóstrofo dentro de un comentario en la cláusula de un import puede ocultar el especificador, y los template literals con `${` no se resuelven.

## Resumen

Total: 34 PASS, 0 FAIL, 6 WARN. Resultado: **PASSED** en la primera ronda de verificación.
