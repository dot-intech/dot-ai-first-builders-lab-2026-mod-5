# SAST — FEAT-001a: Acceso directo de QA sin magic link

| Campo | Valor |
|---|---|
| Fecha | 2026-09-21 |
| Rama / HEAD | `feat/FEAT-001a-acceso-qa` / `dac1c65` |
| Resultado | **PASSED** — 0 Critical, 0 High, 0 Medium |
| Alcance | Todo `src/` de la rama (19 archivos fuente + tests), `next.config.ts`, `docker-compose.yml`, `.env.example`, `drizzle/migrations/`, historial de la rama |
| Método | Búsqueda por patrones (grep) por categoría + lectura completa de los archivos sensibles + `pnpm audit` |
| Referencia | `docs/daw/security/threat-FEAT-001a.md` (modelo de amenazas y addendum), ADR-001 a ADR-006 |

## Resultado por categoría

| ID | Categoría | Resultado | Evidencia |
|---|---|---|---|
| F-SAST-01 | Secretos hardcodeados | ✅ Limpio | Sin coincidencias en `src/` (fuente). `.env` está en `.gitignore` y no está versionado; solo `.env.example` (valores vacíos). `docker-compose.yml` toma las credenciales de `.env` con `${VAR:?…}`. El historial de la rama no agrega secretos. |
| F-SAST-02 | Inyección SQL | ✅ Limpio | Los dos repositorios usan solo el query builder de Drizzle (`eq`, `insert().values()`, `update().set()`); sin `sql\`\``, `sql.raw` ni concatenación. La migración es DDL estático. |
| F-SAST-03 | Inyección de comandos | ✅ Limpio | Sin `child_process`, `exec`, `spawn`. |
| F-SAST-04 | Deserialización insegura | ✅ Limpio | Sin `JSON.parse` de input, `eval`, `new Function`. |
| F-SAST-05 | Path traversal | ✅ Limpio | Sin uso de `fs` ni construcción de rutas de archivo. |
| F-SAST-06 | XSS | ✅ Limpio | Sin `dangerouslySetInnerHTML`/`innerHTML`. `dev-login/page.tsx` renderiza `estado.email` como texto de React (escapado); solo compara `error === '1'`. |
| F-SAST-07 | SSRF | ✅ Limpio | Sin `fetch`/clientes HTTP. |
| F-SAST-08 | Criptografía | ✅ Limpio | Token de sesión de 32 bytes de `randomBytes` (CSPRNG); en BD solo su SHA-256 (`session-service.ts:13,27`). Sin MD5/SHA1/DES/ECB ni `Math.random`. |
| F-SAST-09 | Modo debug en producción | ✅ Limpio | `next.config.ts` solo tiene `reactStrictMode`. `env.ts` asume `production` si falta `NODE_ENV`; el acceso QA usa lista de entornos permitidos (ADR-001), `/dev-login` responde 404 fuera de ella (verificado con `next build` el 2026-09-21). |
| F-SAST-10 | Logging de datos sensibles | ✅ Limpio | Los 4 `console.*` de `src/`: `registro-acceso-qa.ts` copia solo `event/outcome/reason/operation/timestamp` (nunca email, token ni `cause`); `client.ts:14` registra solo `error.name`. La server action y `resolverEstadoSesion` capturan solo `QaAccessDeniedError` y `RepositoryError` y relanzan el resto. |
| F-SAST-11 | Subida sin restricciones | ✅ N/A | Sin subida de archivos en este ticket. |
| F-SAST-12 | CSRF | ✅ Limpio | Único endpoint que cambia estado: server action `qaBackdoorLogin` (POST, con verificación Origin/Host de Next.js), sin parámetros (el email nunca viaja desde el cliente), `'use server'` con un único export (hay un test que lo garantiza), cookie `SameSite=lax`. |
| F-SAST-13 | CVE Critical/High en dependencias | ✅ Limpio | `pnpm audit --audit-level low`: "No known vulnerabilities found". |
| F-SAST-14 | Validación de entrada incompleta (Medium) | ✅ Limpio | La única entrada externa es la cookie: `tokenTieneFormatoValido` valida tipo y longitud 1..128 antes de hashear (`session-service.ts:17`). `QA_ACCESS_EMAIL` viene del entorno y se normaliza. |
| F-SAST-15 | Manejo de errores que filtra internos (Medium) | ✅ Limpio | `RepositoryError` lleva mensaje fijo; el error original solo va en `cause`, que nunca se loguea ni se muestra. La UI muestra mensajes genéricos. Los errores no reconocidos se relanzan a Next, que en producción muestra un error genérico. |
| F-SAST-16 | CVE Medium en dependencias | ✅ Limpio | Ver F-SAST-13. |
| F-SAST-17 | Función insegura (Medium) | ✅ Limpio | Ninguna. |

## Suppressions

Ninguna (0). No hay hallazgos Medium ni superiores que suprimir (F-SAST-18 y F-SAST-19 no aplican).

## Hallazgos Low / Informational (W-SAST-01, no bloquean)

| # | Severidad | Hallazgo | Disposición |
|---|---|---|---|
| I-1 | Informational | Los tests usan URLs de BD ficticias (`postgresql://user:pass@localhost:5432/db` en `src/env.test.ts`; `usuario:clave@127.0.0.1:1` en `src/shared/db/client.test.ts`). | Falso positivo: son marcadores de posición, no credenciales reales. |
| I-2 | Low | `next.config.ts` no define cabeceras de seguridad ni CSP (`security.instructions.md` recomienda CSP). La superficie actual es una sola página de QA sin contenido de usuario. | Registrado. Evaluar al agregar la UI de FEAT-001b. |
| I-3 | Low | Sin verificación de que la `DATABASE_URL` real lleve `sslmode=require` (mitigación #6 del threat model). Es una preocupación de despliegue. | Registrado, ya listado como pendiente. |
| I-4 | Low | Las sesiones expiradas se rechazan pero nunca se borran de la tabla `sesiones`. | Registrado, ya listado como pendiente. |
| I-5 | Informational | `qaBackdoorLogin` no tiene límite de intentos. Está protegida por la lista de entornos permitidos, no recibe parámetros y solo puede abrir sesión para el único email configurado en el servidor. | Registrado. |
| I-6 | Informational | El archivo `.daw/scripts/__pycache__/validate-transition.cpython-314.pyc` está versionado (commit `7b9d43d`, instalación de DAW) aunque `.gitignore` ya ignora `__pycache__/`. No es código de la aplicación. | Registrado. Higiene de repo: `git rm --cached` en un ticket aparte. |

## Veredicto

**PASSED.** `gates.sast = true`.
