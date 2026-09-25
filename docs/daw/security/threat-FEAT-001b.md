# Threat Model FEAT-001b: Registrar consumo a partir de una foto (captura/galería) con análisis de IA

| Field | Value |
|-------|-------|
| Ticket | FEAT-001b |
| Date | 2026-09-25 |
| Result | PASSED |

Diseño analizado: el plan de PLAN posterior a FEAT-002 (sesión y `RepositoryError` en `src/shared`,
ADR-007), con las decisiones D1–D4 y A1–A10 tomadas por el usuario el 2026-09-24/25. Feature nueva
en `src/features/consumos/{ui,domain,data}` más la ruta `src/app/consumos/nuevo/`.

## Superficies de ataque identificadas

1. Server actions `analizarImagen` / `guardarConsumo` (`consumos/ui/actions.ts`, `'use server'`,
   exactamente 2 exports) y su módulo de sesión `consumos/ui/sesion-consumo.ts`.
2. Página `src/app/consumos/nuevo/page.tsx` (server component, sesión requerida).
3. Componente cliente `consumos/ui/nuevo-consumo.tsx` + reductor `flujo-nuevo-consumo.ts` +
   `reducir-imagen.ts` (canvas, en el navegador).
4. Reglas y service de dominio (`consumos/domain/rules.ts`, `consumo-service.ts`): validación de la
   imagen (bytes mágicos JPEG + tope de tamaño) y de los datos editados.
5. Adaptador `consumos/data/modelo-vision.ts` sobre `@google/genai` → API de Google AI Studio
   (`gemini-3.1-flash-lite`).
6. Repository `consumos/data/consumo-repository.ts` + tabla nueva `consumos` (FK a `usuarios`).
7. Variable de entorno nueva `GEMINI_API_KEY` (opcional, leída por `src/env.ts`).
8. Dependencia nueva `@google/genai` 2.24.0 y sus transitivas.

## Fronteras de confianza

| ID | Frontera | Descripción |
|----|----------|-------------|
| TB1 | Navegador ↔ servidor Next.js | Server actions (FormData con la imagen; datos editados), página y cookie de sesión |
| TB2 | Servidor Next.js ↔ PostgreSQL | `consumo-repository` vía Drizzle, con `conRepositoryError` |
| TB3 | Servidor Next.js ↔ variables de entorno | `GEMINI_API_KEY` vía `src/env.ts` |
| TB4 | Servidor Next.js ↔ Google AI Studio (tercero) | La imagen (base64) y el prompt salen del sistema; la respuesta vuelve |
| TB5 | Respuesta del modelo → servidor → UI | La salida del modelo es **entrada no confiable**: el texto dentro de la foto puede influir en ella |

## Análisis STRIDE por componente

### Server actions `analizarImagen` / `guardarConsumo` + `sesion-consumo.ts`

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | Invocar las actions sin sesión o con un token ajeno | Low | High | Ambas actions exigen sesión: cookie `NOMBRE_COOKIE_SESION` → `resolverUsuarioDeSesion` (shared, hash SHA-256, expiración 24 h). Sin sesión → resultado `{ tipo: 'sin-sesion' }`, nada se ejecuta |
| Tampering | El cliente manda campos extra (p. ej. `usuarioId`) o valores fuera de rango | Medium | Medium | Entradas `unknown`; `validarDatosConsumo` construye un objeto **nuevo** solo con los campos permitidos; rangos (descripción 1..500, calorías 0..10000, porcentajes enteros 0..100 que suman 100) y CHECKs por columna en la BD |
| Repudiation | Un consumo guardado o un análisis sin rastro | Medium | Low | El consumo queda con `usuario_id` y `created_at`; `registro-consumo.ts` registra `event`/`outcome`/`reason`/`operation` campo por campo |
| Information Disclosure | Errores internos (SDK, BD) llegan al cliente | Low | Medium | Resultados discriminados serializables con mensajes fijos; solo se atrapan `AnalisisImagenError`, `DatosConsumoInvalidosError` y `RepositoryError` por `instanceof`; lo demás se relanza (ADR-005) |
| DoS | Llamadas repetidas a `analizarImagen` → costo en Google | Medium | Medium | **Riesgo aceptado #2** (abajo) + tope/presupuesto configurado en Google |
| Elevation of Privilege | Guardar un consumo a nombre de otro usuario (IDOR) | Low | High | `usuarioId` sale **solo** de la sesión; el dominio lo recibe por parámetro y nunca del payload. Un tercer export en `'use server'` crearía un endpoint nuevo: un test fija `Object.keys` = los 2 exports |

### Página `/consumos/nuevo`

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | Acceso sin sesión | Low | Medium | La página resuelve la sesión con `sesion-consumo.ts`; sin sesión redirige a la constante única de ruta de login (D1). En producción esa ruta hoy es 404 (decisión documentada en la spec) |
| Tampering | N/A — la página no recibe entrada del usuario más allá de la cookie | — | — | — |
| Repudiation | N/A — no ejecuta acciones | — | — | — |
| Information Disclosure | Detalles técnicos del modelo visibles (FR-10) | Low | Low | La UI no muestra endpoint, payload ni nombre de modelo; la página no importa el service ni `data/` |
| DoS | N/A adicional a la cookie de sesión existente | — | — | — |
| Elevation of Privilege | La UI habla con la BD | Low | Medium | `page.tsx` importa solo de `features/consumos/ui` y `shared/sesion/ui/cookie-sesion`; el guardián ampliado (D4) lo hace fallar en test |

### Componente cliente + reductor + `reducir-imagen.ts` (navegador)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | N/A — no maneja identidad | — | — | — |
| Tampering | Un resultado tardío pisa el estado actual | Low | Low | El reductor descarta respuestas de solicitudes no vigentes (A7), con test |
| Repudiation | N/A — sin acciones persistentes propias | — | — | — |
| Information Disclosure | Metadatos EXIF (GPS, dispositivo) salen del navegador | Medium | Medium | El reencodeo por canvas a JPEG descarta EXIF antes de enviar |
| Information Disclosure | XSS con la descripción que devuelve el modelo | Low | High | React escapa el texto; prohibido `dangerouslySetInnerHTML`; descripción ≤ 500 caracteres |
| Information Disclosure | Secretos o código de servidor en el bundle del cliente | Low | High | Guardián ampliado (D4): un archivo `'use client'` no importa `data/`, el service, `env` ni `@google/genai` |
| DoS | Imagen enorme o no decodificable (HEIC) | Medium | Low | Reducción a ~1280 px / < ~900 KB; fallo de decodificación o rechazo de Next (> 1 MB) → estado de error FR-15 (A8) |
| Elevation of Privilege | N/A — corre con los privilegios del usuario en su navegador | — | — | — |

### Dominio: reglas + `consumo-service.ts`

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | N/A — no resuelve identidad (la recibe) | — | — | — |
| Tampering | Archivo que no es imagen o disfrazado | Medium | Low | Solo JPEG por bytes mágicos (A9) + tope de bytes; el servidor nunca decodifica la imagen, solo la reenvía |
| Tampering | Desglose del modelo inconsistente | Medium | Low | `normalizarDesglose` (mayor resto) a enteros que suman 100; casos degenerados → error tipado |
| Repudiation | N/A — el registro lo hace la capa ui | — | — | — |
| Information Disclosure | N/A — no loguea | — | — | Solo `consumo-service.ts` importa de `data/`; `rules`/`types`/`errors` son puros (A6) |
| DoS | Validación costosa | Low | Low | Validaciones O(n) sobre buffers acotados |
| Elevation of Privilege | N/A | — | — | — |

### Adaptador `modelo-vision.ts` → Google AI Studio (TB4, TB5)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | Suplantación del endpoint de Google | Low | Medium | El SDK usa HTTPS con validación de certificados; no se configura un endpoint custom |
| Tampering | Prompt injection: texto en la imagen manipula la respuesta | Medium | Medium | `responseMimeType: application/json` + `responseSchema`; la respuesta se trata como `unknown` y pasa por un guard escrito a mano (A4); rangos acotados; el modelo no tiene herramientas ni acceso a datos; el usuario revisa y edita antes de guardar |
| Repudiation | N/A — sin estado propio | — | — | Registro en la capa ui |
| Information Disclosure | **La foto sale a un tercero**; en el nivel gratuito Google la usa para entrenar y admite revisión humana | High | High | **Riesgo aceptado #1** (abajo) + EXIF borrado en cliente + NFR-04 del lado propio (nunca en disco, BD ni logs) |
| Information Disclosure | La imagen o la respuesta se filtran en logs vía errores del SDK | Medium | Medium | Todo fallo (red, abort, HTTP, JSON inválido, guard) se envuelve en `AnalisisImagenError(reason, { cause })` con mensaje fijo (A3); el log nunca copia `cause`, la imagen ni la respuesta |
| DoS | Respuestas lentas retienen el servidor | Medium | Low | `abortSignal` a los 25 s + temporizador de cliente de 30 s (NFR-02) |
| Elevation of Privilege | La salida del modelo se usa para decidir accesos | Low | Low | Por diseño, solo produce datos que se muestran y el usuario confirma |

### Repository `consumo-repository.ts` + tabla `consumos` (TB2)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | N/A — autenticación de BD existente | — | — | — |
| Tampering | Inyección SQL | Low | Critical | Drizzle con consultas parametrizadas; nunca SQL concatenado |
| Tampering | Filas inválidas escritas saltando la app | Low | Medium | CHECKs por columna, suma = 100, tope de calorías, largo de descripción, `origen` como `text` + CHECK (no enum) |
| Repudiation | Alta sin autor | Low | Low | `usuario_id` NOT NULL con FK y `created_at` |
| Information Disclosure | `DrizzleQueryError` expone SQL y parámetros (la descripción) | Medium | Medium | `conRepositoryError` compartido: `RepositoryError` con mensaje fijo y `operation`; nunca se loguea el original |
| DoS | Crecimiento de filas | Low | Low | Solo usuarios con sesión; índice en `usuario_id` |
| Elevation of Privilege | Migración destructiva | Low | High | Migración aditiva `0001_consumos` generada con drizzle-kit y revisada sin `DROP`/`ALTER ... TYPE` |

### Variable de entorno `GEMINI_API_KEY` (TB3)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | Uso de la key robada por terceros | Low | High | Nunca `NEXT_PUBLIC_`; solo `src/env.ts` la lee; `.env` en `.gitignore`; nunca se loguea |
| Tampering | N/A — configuración del despliegue | — | — | — |
| Repudiation | N/A | — | — | — |
| Information Disclosure | Key en el bundle del cliente | Low | High | Guardián ampliado (D4): ningún `'use client'` importa `env` |
| DoS | Key ausente | Medium | Low | Opcional: sin key, el análisis falla con `AnalisisImagenError('no-configurado')` y mensaje fijo; el resto de la app funciona |
| Elevation of Privilege | N/A | — | — | — |

### Dependencia `@google/genai` 2.24.0 (W-TM-01)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Tampering | Paquete comprometido o tipográficamente parecido | Low | High | Verificado en npm (2026-09-24): `@google/genai` 2.24.0 es `latest`, mantenedores de Google (`google-wombot`, `ofrobots`); versión exacta fijada en `package.json` + lockfile congelado |
| Information Disclosure | Vulnerabilidades en transitivas (`ws`, `p-retry`, `protobufjs`, `google-auth-library`) | Low | Medium | `pnpm audit` antes de fijar (precedente ADR-003); SAST en CODE |
| Spoofing / Repudiation / DoS / EoP | Sin superficie adicional a la de TB4 | — | — | Ver adaptador |

## Clasificación de datos sensibles (F-TM-05)

| Dato | Clasificación | Dónde vive |
|---|---|---|
| Foto del plato | PII (puede contener caras, lugares, objetos personales) | Transitoria: navegador → servidor → Google. Nunca en disco, BD ni logs propios (NFR-04) |
| Consumo (descripción, calorías, desglose) asociado a un usuario | PII sensible (hábitos alimentarios, cercanos a salud) | Tabla `consumos` |
| `usuario_id` | Identificador seudónimo | Tabla `consumos` (no se copia a los logs de `registro-consumo.ts`) |
| `GEMINI_API_KEY` | Credencial | Variable de entorno del servidor |
| Respuesta del modelo | No confiable; PII por derivación hasta que el usuario la guarda | Memoria del request y del navegador |

## Cifrado (F-TM-07)

- **En tránsito:** navegador ↔ servidor por HTTPS en despliegue. Servidor ↔ Google por HTTPS (SDK).
  Servidor ↔ PostgreSQL con `sslmode=require` (igual que FEAT-001a).
- **En reposo:** la foto no se persiste. `consumos` hereda la asunción de FEAT-001a: el cifrado en
  reposo se delega al proveedor de PostgreSQL, a confirmar antes de manejar usuarios reales.
  `GEMINI_API_KEY` vive solo en el entorno del servidor.
- **En Google:** fuera de nuestro control; ver riesgo aceptado #1.

## Riesgos aceptados

### 1. La foto se procesa en Google AI Studio; en el nivel gratuito se usa para entrenar (HIGH)

| Campo | Valor |
|---|---|
| Riesgo | Cada imagen analizada sale del sistema hacia Google. Según los términos de la API de Gemini (ai.google.dev/gemini-api/terms, actualizados el 2026-04-28), en los servicios no pagos Google usa el contenido y las respuestas para mejorar sus productos y modelos, admite revisión humana y pide no enviar información personal o sensible. En los servicios pagos no lo usa para entrenar y solo guarda logs por tiempo limitado para detectar abusos. |
| Quién lo acepta | dot.dev.intech@gmail.com (dueño del proyecto), 2026-09-25 |
| Justificación | Hoy el único usuario es el de QA, y la función solo es alcanzable en dev/test/staging (sin login real, producción no tiene sesiones). Las pruebas se hacen con fotos de platos sin personas ni datos identificables. El reencodeo en canvas borra EXIF antes de enviar, y del lado propio se cumple NFR-04. |
| Condiciones de revisión | Antes de habilitar cualquier usuario real (login real / magic link), la `GEMINI_API_KEY` debe pertenecer a un proyecto con facturación (servicios pagos). Se revisa también si cambian los términos de Google o si se usa con fotos de personas reales. |

### 2. Sin límite de uso del análisis: posible abuso de costo (MEDIUM)

| Campo | Valor |
|---|---|
| Riesgo | Una sesión válida puede invocar `analizarImagen` repetidamente; cada llamada consume cuota o costo en Google. No hay rate limiting en el código. |
| Quién lo acepta | dot.dev.intech@gmail.com (dueño del proyecto), 2026-09-25 |
| Justificación | Solo existe el usuario de QA y la función no es alcanzable en producción. Mitigación fuera del código: configurar un presupuesto o cuota en Google AI Studio / Google Cloud para la key usada. El abort a los 25 s acota el tiempo de espera del servidor, pero según el SDK (`GenerateContentConfig.abortSignal`) no cancela la operación en Google: la llamada se cobra igual. |
| Condiciones de revisión | Junto con el riesgo #1, al implementar el login real; o antes si se observa consumo anómalo de la cuota. |

## Mitigaciones incorporadas al spec

1. Ambas actions exigen sesión; `usuarioId` solo desde la sesión; sin sesión → `{ tipo: 'sin-sesion' }` (D1).
2. `actions.ts` con exactamente 2 exports y test que lo fija; entradas `unknown`.
3. `validarDatosConsumo` construye un objeto nuevo con los campos permitidos y rangos acotados.
4. Solo JPEG por bytes mágicos + tope de bytes; el servidor nunca decodifica ni persiste la imagen.
5. Reencodeo en canvas (EXIF descartado) a ~1280 px / < ~900 KB.
6. Adaptador: JSON + `responseSchema`, respuesta `unknown` + guard propio, abort a 25 s, todo error
   envuelto en `AnalisisImagenError` con mensaje fijo.
7. `registro-consumo.ts` copia solo `event`/`outcome`/`reason`/`operation`; nunca la imagen, la
   respuesta del modelo ni `cause`.
8. `GEMINI_API_KEY` opcional vía `src/env.ts`, nunca `NEXT_PUBLIC_`, nunca logueada (D2).
9. Guardián de dependencias ampliado: ui/app no importan `data/` ni `shared/db`; `'use client'` no
   importa `data/`, el service, `env` ni `@google/genai` (D4).
10. Sin `dangerouslySetInnerHTML`; descripción ≤ 500 caracteres.
11. Reductor que descarta respuestas no vigentes.
12. Tabla `consumos` con CHECKs, `origen` como `text` + CHECK, migración aditiva revisada.
13. `@google/genai` 2.24.0 exacto + `pnpm audit` antes de fijarlo.
14. Tests: `vi.mock` explícito del adaptador y de `@google/genai`; nunca se llama a la API paga.
15. Documentar en ADR-009 la condición del riesgo aceptado #1 (servicios pagos antes de usuarios reales).

## Resumen

Riesgos: C:0 H:1 (aceptado #1, con mitigaciones parciales) M:7 (6 mitigados, 1 aceptado #2) L:6 (mitigados)
Resultado: **PASSED**: todo riesgo tiene mitigación incorporada al spec o aceptación formal con los 3
campos de F-TM-04 (quién, justificación, condición de revisión). Ambas aceptaciones fueron
confirmadas explícitamente por el usuario el 2026-09-25.
