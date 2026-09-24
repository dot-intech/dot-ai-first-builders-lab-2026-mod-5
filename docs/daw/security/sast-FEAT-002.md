# SAST FEAT-002: Extraer la sesión y RepositoryError de qa-access a src/shared

| Field | Value |
|-------|-------|
| Ticket | FEAT-002 |
| Date | 2026-09-24 |
| Alcance | 34 archivos cambiados en `src/` y `vitest.config.ts` (`git diff main...HEAD`), más dependencias |
| Result | PASSED |

## Resultados

| ID | Chequeo | Resultado |
|---|---|---|
| F-SAST-01 | Secretos hardcodeados (API keys, passwords, tokens, connection strings) en los archivos cambiados; `.env` en `.gitignore`; archivos sensibles versionados | ✅ Sin hallazgos. `.env` y `.env*.local` están en `.gitignore`; no hay `.env`, `.pem` ni claves versionadas |
| F-SAST-02 | Inyección SQL (SQL crudo, concatenación) | ✅ Sin `sql\`` ni `.execute(`; los repositorios movidos siguen usando el query builder de Drizzle |
| F-SAST-03 / F-SAST-04 | Inyección de comandos, `eval`, `new Function` | ✅ Sin hallazgos |
| F-SAST-05 | Path traversal | ✅ Sin lecturas de disco en código de producción. `node:fs` solo aparece en el test guardián, sobre rutas del propio repo |
| F-SAST-06 | XSS (`dangerouslySetInnerHTML`, `innerHTML`) | ✅ Sin hallazgos |
| F-SAST-07 | SSRF | ✅ No aplica: sin llamadas HTTP salientes |
| F-SAST-08 | Criptografía débil | ✅ `session-service.ts:13` usa SHA-256 sobre un token aleatorio de 256 bits (no es una contraseña); sin MD5/SHA1/DES/ECB. Código movido sin cambios |
| F-SAST-09 | Modo debug en producción | ✅ Sin cambios de configuración de runtime |
| F-SAST-10 | Registro de datos sensibles | ✅ Los únicos registros son `registrarEventoAccesoQa` en `actions.ts` y `estado-sesion.ts`, con `event`, `outcome`, `reason` u `operation` (etiquetas sin datos). `resolverUsuarioDeSesion` no registra y no devuelve `message` ni `cause` del `RepositoryError` (test en `usuario-de-sesion.test.ts`) |
| F-SAST-11 | Uploads sin restricción | ✅ No aplica |
| F-SAST-12 | CSRF | ✅ Sin endpoints nuevos. Ningún archivo de `src/shared/` lleva `'use server'` (verificado también por el test guardián, regla 3) |
| F-SAST-13 / F-SAST-16 | Dependencias con CVEs conocidas | ✅ `pnpm audit` y `pnpm audit --prod`: "No known vulnerabilities found". Sin dependencias nuevas (NFR-03) |
| F-SAST-14 | Validación de input incompleta | ✅ El token de la cookie sigue validado por `getSession` (tipo en runtime, largo 1–128) antes de hashearse o consultar la BD |
| F-SAST-15 | Manejo de errores que filtra internos | ✅ `RepositoryError` conserva `message` fijo y el original solo en `cause`; `resolverUsuarioDeSesion` devuelve solo `operation` |
| F-SAST-17 | Deserialización insegura | ✅ Sin hallazgos. El único `JSON.parse` está en el test guardián, sobre `tsconfig.json` del repo |

## Supresiones

Ninguna.

## Resumen

Total: 17 chequeos limpios, 0 vulnerabilidades (0 críticas, 0 altas, 0 medias).
Resultado: **PASSED**.
