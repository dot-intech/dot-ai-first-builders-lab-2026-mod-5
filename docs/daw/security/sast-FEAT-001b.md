# SAST FEAT-001b: Registrar consumo a partir de una foto (captura/galería) con análisis de IA

| Field | Value |
|-------|-------|
| Ticket | FEAT-001b |
| Date | 2026-09-28 |
| Alcance | Los 9 bloques del ticket: `src/features/consumos/**` (domain/data/ui), `src/app/consumos/**`, `src/app/rutas.ts`, `src/app/page.tsx`, `src/env.ts` (campo `geminiApiKey`), `src/shared/db/schema.ts` (tabla `consumos`), `drizzle/migrations/0001_consumos.sql`, `src/shared/reglas-de-dependencias.test.ts` (guardián ampliado), más dependencias (`@google/genai`) |
| Result | PASSED |

## Resultados

| ID | Chequeo | Resultado |
|---|---|---|
| F-SAST-01 | Secretos hardcodeados (API keys, passwords, tokens, connection strings) | ✅ Sin hallazgos. `env.ts` lee `GEMINI_API_KEY` de `process.env` en runtime (no al cargar el módulo); `.env` y `.env*.local` están en `.gitignore`; sin claves versionadas |
| F-SAST-02 | Inyección SQL (SQL crudo, concatenación) | ✅ `consumo-repository.ts` usa el query builder de Drizzle (`db.insert(consumos).values(...)`); la migración `0001_consumos.sql` es DDL generado por drizzle-kit, sin datos ni interpolación |
| F-SAST-03 / F-SAST-04 | Inyección de comandos, `eval`, deserialización insegura | ✅ Sin hallazgos. El único `JSON.parse` (`modelo-vision.ts:textoARespuesta`) parsea la respuesta del modelo y cualquier fallo se atrapa y se relanza como `AnalisisImagenError('respuesta-invalida')`, sin `eval`/`new Function` |
| F-SAST-05 | Path traversal | ✅ No aplica: sin lecturas de disco con input del usuario en código de producción |
| F-SAST-06 | XSS (`dangerouslySetInnerHTML`, `innerHTML`) | ✅ Sin hallazgos en `pantallas-nuevo-consumo.tsx`, `nuevo-consumo.tsx`, `page.tsx` ni `consumos/nuevo/page.tsx` |
| F-SAST-07 | SSRF | ✅ La única llamada saliente es a la API de Google GenAI con el modelo y el endpoint fijos del SDK; sin URLs construidas con input del usuario |
| F-SAST-08 | Criptografía débil | ✅ No aplica: este bloque no agrega hashing ni cifrado (se reusa `crypto.randomUUID()` para `solicitudId`, no es un secreto) |
| F-SAST-09 | Modo debug en producción | ✅ Sin cambios de configuración de runtime |
| F-SAST-10 | Registro de datos sensibles | ✅ `registrarEventoConsumo` (`registro-consumo.ts`) copia campo a campo (`event`, `outcome`, `reason`, `operation`, `timestamp`) y nunca vuelca el evento completo: ni la imagen, ni la respuesta del modelo, ni `usuarioId`, ni `cause` llegan al log (verificado leyendo el archivo; comentario explícito M-7/NFR-04). `modelo-vision.ts` no loguea la key ni la respuesta cruda |
| F-SAST-11 | Uploads sin restricción | ✅ `imagenDelFormulario` exige `Blob` y tamaño ≤ `IMAGEN_MAX_BYTES` antes de leer bytes; `validarImagen` verifica magic bytes JPEG (`esJpeg`) server-side. La imagen se envía a Gemini como `inlineData` base64 y nunca se persiste en disco ni en la BD |
| F-SAST-12 | CSRF | ✅ Server Actions de Next.js 15 (protección de Origin/Referer integrada); sin endpoints REST nuevos |
| F-SAST-13 / F-SAST-16 | Dependencias con CVEs conocidas | ✅ `pnpm audit`: "No known vulnerabilities found" (incluye `@google/genai@2.24.0`, agregado en Block 1) |
| F-SAST-14 | Validación de input incompleta | ✅ `validarImagen` (bytes/tamaño/JPEG), `validarDatosConsumo`/`validarDescripcion`/`validarDesglose` (tipo, rango, longitud en code points, valores permitidos de `origen`) en `rules.ts`; `interpretarRespuestaModelo` valida la respuesta del modelo campo a campo antes de usarla. Todo del lado servidor, independiente de lo que el cliente ya recortó |
| F-SAST-15 | Manejo de errores que filtra internos | ✅ `AnalisisImagenError`/`DatosConsumoInvalidosError` tienen mensajes fijos; `reason`/`campo` quedan en el objeto pero `operaciones-consumo.ts` solo devuelve literales propios (`{tipo:'error'}`, `{tipo:'datos-invalidos'}`) al cliente, nunca `error.message` ni `error.cause` |
| F-SAST-17 | Funciones inseguras (`eval`, deserialización sin contexto) | ✅ Sin hallazgos |

## Foco del guardián de dependencias ampliado (Block 9)

El propio `reglas-de-dependencias.test.ts` es el control preventivo de varios de estos hallazgos hacia el futuro (ADR-007): impide que la UI importe `data/`/`shared/db` directamente y que código `'use client'` importe `*-service.ts`, `src/env.ts` o `@google/genai` — es decir, automatiza que la API key y el acceso a datos no puedan terminar en el bundle del cliente. Escaneo real de `src/` con las 2 reglas nuevas: 0 violaciones (verificado en el cierre de `/daw-test`).

## Supresiones

Ninguna.

## Resumen

Total: 17 chequeos limpios, 0 vulnerabilidades (0 críticas, 0 altas, 0 medias).
Resultado: **PASSED**.
