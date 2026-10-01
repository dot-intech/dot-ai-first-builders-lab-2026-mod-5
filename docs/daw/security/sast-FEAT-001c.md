# SAST FEAT-001c: Carga manual y manejo de baja confianza en el registro de consumo por foto

| Field | Value |
|-------|-------|
| Ticket | FEAT-001c |
| Date | 2026-09-30 |
| Alcance | Los 7 bloques del ticket (diff `9cd1b81..HEAD`): `src/features/consumos/**` (domain/data/ui, incluidas las pantallas nuevas `pantalla-baja-confianza.tsx` y `pantalla-sesion-vencida.tsx`), `src/shared/db/schema.ts`, `drizzle/migrations/0002_consumos_idempotencia.sql` (más snapshot y journal), y los tests asociados. Sin dependencias nuevas |
| Result | PASSED |

## Resultados

| ID | Chequeo | Resultado |
|---|---|---|
| F-SAST-01 | Secretos hardcodeados (API keys, passwords, tokens, connection strings) | ✅ Sin hallazgos en el diff de `src/` y `drizzle/`; `.env` está ignorado por git y no hay archivos `.env*` versionados |
| F-SAST-02 | Inyección SQL (SQL crudo, concatenación) | ✅ `consumo-repository.ts` usa el query builder de Drizzle (`insert().values().onConflictDoUpdate()`); el `set` enumera columnas explícitas y toma los valores del objeto validado, sin interpolar texto. La migración 0002 es DDL generado por drizzle-kit, sin datos ni interpolación. Los únicos `sql\`\`` de producción son los CHECK de `schema.ts` (sin input de usuario) |
| F-SAST-03 / F-SAST-04 | Inyección de comandos, `eval`, deserialización insegura | ✅ Sin `eval`, `new Function`, `child_process`, `exec` ni `spawn` en `src/` de producción |
| F-SAST-05 | Path traversal | ✅ No aplica: sin lecturas ni escrituras de disco con input del usuario en código de producción |
| F-SAST-06 | XSS (`dangerouslySetInnerHTML`, `innerHTML`) | ✅ Sin ocurrencias en `src/` (MC-7). Las pantallas nuevas son JSX con texto fijo y callbacks |
| F-SAST-07 | SSRF | ✅ Sin `fetch`, `axios` ni `http.request` en `src/`; la única llamada saliente sigue siendo la del SDK de Google con el modelo fijo |
| F-SAST-08 | Criptografía débil | ✅ Sin MD5, SHA1, DES ni ECB. `crypto.randomUUID()` genera el `solicitudId`, que no es un secreto |
| F-SAST-09 | Modo debug en producción | ✅ Sin cambios de configuración de runtime |
| F-SAST-10 | Registro de datos sensibles | ✅ El `solicitudId` no aparece en `registro-consumo.ts`, `operaciones-consumo.ts` ni `actions.ts`; el log sigue copiando campo a campo (`event`, `outcome`, `reason`, `operation`) y el único rastro nuevo es el nombre del campo `'solicitudId'` como `reason` de un rechazo, no su valor. Ni la confianza del modelo ni la respuesta cruda llegan a logs |
| F-SAST-11 | Uploads sin restricción | ✅ Sin cambios en la validación de imagen de FEAT-001b (tamaño, magic bytes JPEG) |
| F-SAST-12 | CSRF | ✅ Server Actions de Next.js 15; `actions.ts` sigue exportando exactamente dos funciones (`analizarFotoConsumo`, `guardarNuevoConsumo`) y no se agregaron endpoints |
| F-SAST-13 / F-SAST-16 | Dependencias con CVEs conocidas | ✅ `pnpm audit --prod`: "No known vulnerabilities found". Sin dependencias nuevas |
| F-SAST-14 | Validación de input incompleta | ✅ `validarSolicitudId` es una allowlist estricta (`string` con forma UUID 8-4-4-4-12, normalizado a minúsculas, sin `trim`); `validarDatosConsumo` devuelve un objeto nuevo solo con campos conocidos, así que descarta `confianza`, `usuarioId` y cualquier extra (MC-1). La validación de la carga manual es la misma que la del flujo con foto (MC-3). La `confianza` del modelo se valida como número finito y se limita a 0-100 (MC-5) |
| F-SAST-15 | Manejo de errores que filtra internos | ✅ Sin cambios: `DatosConsumoInvalidosError('solicitudId')` tiene mensaje fijo y la capa ui devuelve solo literales (`{tipo:'datos-invalidos'}`, `{tipo:'sin-sesion'}`, `{tipo:'error'}`). Sin catch silencioso nuevo |
| F-SAST-17 | Funciones inseguras | ✅ Sin hallazgos |

## Controles específicos de FEAT-001c (threat model)

| Mitigación | Verificación |
|---|---|
| MC-1 `solicitudId` obligatorio y campos extra descartados | `validarSolicitudId` y `validarDatosConsumo` en `domain/rules.ts`, con tests de los 7 casos inválidos y del descarte de `confianza`/`usuarioId` |
| MC-2 unicidad por `(usuario_id, solicitud_id)` y `set` sin `usuario_id` ni `created_at` | `onConflictDoUpdate` con `target: [usuarioId, solicitudId]` y `set` de siete columnas explícitas; el `usuarioId` sale de la sesión (`operaciones-consumo.ts:107`), nunca del payload; test de integración con el mismo `solicitudId` en dos usuarios (dos filas) |
| MC-4 CHECKs por columna | `consumos_origen_check` ampliado a `'camara' \| 'galeria' \| 'manual'`; los demás CHECKs sin cambios |
| MC-6 "Iniciar sesión" solo hace `router.refresh()` | `nuevo-consumo.tsx`: sin redirecciones con datos del cliente |
| MC-7 sin `innerHTML` | Sin ocurrencias en `src/` |
| MC-9 `sin-sesion` solo con el `solicitudId` vigente en `procesando`/`guardando` | `flujo-nuevo-consumo.ts`, con tests de id distinto y de otros estados |
| Migración 0002: único `DROP` permitido (excepción D2) | Test en `schema.test.ts` que fija un único `DROP CONSTRAINT "consumos_origen_check"` y prohíbe `DROP TABLE`, `DROP COLUMN`, `DROP INDEX`, `TRUNCATE` y `DELETE` |
| Guardián de dependencias (A7) | `src/shared/reglas-de-dependencias.test.ts`: 43/43; los archivos `'use client'` nuevos no importan `*-service`, `env`, `@google/genai` ni `data/` |

## Supresiones

Ninguna.

## Resumen

Total: 15 chequeos limpios, 0 vulnerabilidades (0 críticas, 0 altas, 0 medias).
Resultado: **PASSED**.
