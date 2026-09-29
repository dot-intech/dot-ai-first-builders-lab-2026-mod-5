# Threat Model FEAT-001c: Carga manual y manejo de baja confianza en el registro de consumo por foto

| Field | Value |
|-------|-------|
| Ticket | FEAT-001c |
| Date | 2026-09-29 |
| Result | PASSED |

Diseño analizado: la spec `docs/daw/specs/spec-FEAT-001c.md` (7 bloques), con las decisiones D1–D6
aprobadas por el usuario el 2026-09-29 y las A1–A7 derivadas de la auditoría de arquitectura. Se
construye sobre FEAT-001b (`src/features/consumos`, ya mergeado) y hereda su threat model
(`docs/daw/security/threat-FEAT-001b.md`): aquí solo se analiza lo que FEAT-001c agrega o cambia, y
se indica qué riesgos heredados siguen vigentes.

## Superficies de ataque identificadas

1. **Contrato de la server action `guardarNuevoConsumo`** (`consumos/ui/actions.ts`, `'use server'`,
   sigue con exactamente 2 exports): el payload gana `solicitudId` y `origen` admite `'manual'`. Su
   validación es `validarDatosConsumo` (`consumos/domain/rules.ts`).
2. **Repository `consumo-repository.ts` y tabla `consumos`**: `INSERT … ON CONFLICT (usuario_id,
   solicitud_id) DO UPDATE`, columna nueva `solicitud_id`, índice único nuevo y CHECK de `origen`
   ampliado, vía la migración `0002_consumos_idempotencia.sql`.
3. **Adaptador del modelo `consumos/data/modelo-vision.ts`**: el prompt y el `responseSchema` piden un
   campo nuevo, `confianza`, que es una salida no confiable de un tercero.
4. **UI cliente** (`nuevo-consumo.tsx`, `flujo-nuevo-consumo.ts`, `pantallas-nuevo-consumo.tsx` y las
   pantallas nuevas): carga manual con campos de texto y numéricos, casilla de confirmación,
   temporizador de guardado y pantalla de sesión vencida.
5. **Migración `0002`** con `DROP CONSTRAINT` + `ADD CONSTRAINT` sobre `consumos_origen_check`.

No hay endpoints HTTP nuevos, ni dependencias nuevas, ni variables de entorno nuevas.

## Fronteras de confianza

| ID | Frontera | Descripción |
|----|----------|-------------|
| TB1 | Navegador ↔ servidor Next.js | Server action de guardado con `solicitudId` y, ahora, datos escritos a mano (`origen: 'manual'`) |
| TB2 | Servidor Next.js ↔ PostgreSQL | Upsert idempotente y migración `0002` |
| TB4 | Servidor Next.js ↔ Google AI Studio | Igual que FEAT-001b; el prompt cambia y la respuesta trae `confianza`. La carga manual **no** cruza esta frontera |
| TB5 | Respuesta del modelo → servidor → UI | `confianza` es entrada no confiable; decide solo un paso de UX, nunca un acceso |

TB3 (variables de entorno) y la dependencia `@google/genai` no cambian.

## Análisis STRIDE por componente

### Server action `guardarNuevoConsumo` + `validarDatosConsumo` (TB1)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | Invocar el guardado sin sesión o con un token ajeno | Low | High | Sin cambios: la action exige sesión (`resolverUsuarioConsumo`); sin sesión devuelve `{ tipo: 'sin-sesion' }` y no ejecuta nada. El `usuarioId` sale solo de la sesión |
| Tampering | Payload con campos extra (`confianza`, `usuarioId`), `solicitudId` malformado u `origen` inválido | Medium | Medium | **MC-1:** `validarDatosConsumo` recibe `unknown`, valida `solicitudId` (UUID, obligatorio) y `origen` contra una lista cerrada, y devuelve un objeto **nuevo** solo con los campos conocidos: `confianza` y cualquier otro campo se descartan (M-3 de FEAT-001b) |
| Tampering | Pisar o crear filas de otro usuario reutilizando su `solicitudId` (IDOR) | Low | High | **MC-2:** la unicidad es por `(usuario_id, solicitud_id)` con el `usuario_id` de la sesión, y el `set` del `ON CONFLICT` no incluye `usuario_id`, `id` ni `created_at`. Un mismo `solicitudId` de dos usuarios produce dos filas (test de integración) |
| Repudiation | Un reintento o una petición tardía pisa en silencio la edición previa del mismo intento (gana la última escritura) | Low | Low | **Riesgo aceptado #1** (abajo). `registro-consumo.ts` sigue registrando cada guardado (`event`, `outcome`) sin datos del consumo |
| Information Disclosure | Errores internos o un oráculo de existencia de `solicitudId` | Low | Low | Resultados discriminados con mensajes fijos (FR-10 de FEAT-001b); el motivo `solicitudId` se registra solo como nombre de campo. La unicidad está acotada al usuario, así que un id ajeno no revela nada |
| DoS | Guardados repetidos o reintentos masivos que crecen la tabla | Low | Low | Los reintentos con el mismo `solicitudId` no crean filas (idempotencia); un id nuevo por cada intento sigue acotado por la sesión y por el riesgo aceptado #2 de FEAT-001b (sin rate limiting) |
| Elevation of Privilege | Usar `origen: 'manual'` para saltarse las validaciones del análisis | Medium | Medium | **MC-3:** la carga manual pasa por exactamente la misma `validarDatosConsumo` (descripción 1..500, calorías enteras 0..10 000, porcentajes enteros 0..100 que suman 100) y por los mismos CHECKs de la BD; el servidor no confía en el `origen` para nada más que etiquetar |

### Repository `consumo-repository.ts` + tabla `consumos` (TB2)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | N/A — autenticación de BD existente | — | — | — |
| Tampering | Inyección SQL por el upsert | Low | Critical | Drizzle con consultas parametrizadas; el `set` lista columnas explícitas con valores ya validados; nunca SQL concatenado |
| Tampering | Filas inválidas escritas saltando la app, o `set` que modifique columnas indebidas | Low | Medium | **MC-4:** CHECKs por columna (rangos, suma 100, `origen` en tres valores) y `set` con columnas explícitas (`descripcion`, `calorias`, `pct_*`, `origen`); tests de integración de que `id` y `created_at` se conservan |
| Repudiation | Alta o modificación sin autor | Low | Low | `usuario_id` NOT NULL con FK y `created_at` intacto; el upsert no toca `usuario_id` |
| Information Disclosure | `DrizzleQueryError` expone SQL y parámetros (la descripción) | Medium | Medium | Sin cambios: `conRepositoryError` envuelve todo en `RepositoryError` con mensaje fijo y `operation`; nunca se loguea el original |
| DoS | Bloqueo de la tabla durante la migración `0002` | Low | Low | `DROP`/`ADD CONSTRAINT` sobre una tabla chica y solo con el usuario de QA; el índice único se crea sobre una columna nueva, todavía nula |
| Elevation of Privilege | Migración destructiva | Low | High | **Riesgo aceptado #2** (excepción acotada: solo `DROP CONSTRAINT "consumos_origen_check"`), con un test que prohíbe cualquier otro `DROP`, `TRUNCATE` o `DELETE` |

### Adaptador del modelo `modelo-vision.ts` y campo `confianza` (TB4, TB5)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | N/A — sin cambios respecto de FEAT-001b | — | — | — |
| Tampering | Prompt injection: texto en la foto fuerza `confianza: 100` para evitar la advertencia | Medium | Low | **MC-5:** `confianza` solo decide un paso de UX (advertencia y casilla) sobre datos del propio usuario; no se persiste ni autoriza nada. Además `responseSchema` la tipa como número, el guard exige un número finito (si no, 0) y el service la limita a 0..100. El usuario ve y edita siempre los datos antes de guardar |
| Repudiation | N/A — sin estado propio | — | — | — |
| Information Disclosure | **La foto sale a un tercero** (riesgo heredado); en el nivel gratuito Google la usa para entrenar | High | High | Sin cambios: **riesgo aceptado #1 de FEAT-001b** sigue vigente con sus condiciones de revisión. FEAT-001c **reduce** la exposición: la carga manual no envía nada a Google, y el prompt nuevo no agrega datos del usuario |
| Information Disclosure | La respuesta o el campo `confianza` se filtran en logs | Low | Low | Sin cambios: errores del SDK envueltos con mensaje fijo, `registro-consumo.ts` copia campo por campo, y `confianza` no se registra |
| DoS | El prompt más largo aumenta tokens o latencia | Low | Low | El aumento es de una línea; sigue el abort a 25 s y el temporizador de 30 s. Sin reintentos automáticos |
| Elevation of Privilege | La salida del modelo se usa para decidir accesos | Low | Low | Por diseño: `confianza` no interviene en autenticación ni autorización (**MC-5**) |

### UI cliente: carga manual, confirmación, timeout y sesión vencida (TB1)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | Pantalla de sesión vencida usada para llevar al usuario a un sitio falso | Low | Medium | **MC-6:** el botón "Iniciar sesión" solo ejecuta `router.refresh()`; la redirección la hace el servidor a la constante `RUTA_LOGIN`. Ninguna URL sale de la entrada del usuario ni del estado del cliente |
| Tampering | XSS por el texto de la carga manual | Low | High | **MC-7:** React escapa los valores; no se usa `dangerouslySetInnerHTML` ni `innerHTML`; la descripción se recorta a 500 caracteres y el servidor la valida como texto. SAST lo verifica en CODE |
| Tampering | Saltarse la casilla de confirmación de baja confianza llamando a la action directamente | Low | Low | No es un control de seguridad: el usuario puede guardar cualquier dato válido de todos modos. La casilla cumple el objetivo de producto de que el usuario sea consciente (FR-04); la confianza no llega al servidor |
| Repudiation | N/A — la UI no ejecuta acciones por sí sola | — | — | — |
| Information Disclosure | El borrador con datos alimentarios queda en el dispositivo tras vencer la sesión | Low | Medium | **MC-8:** el borrador vive solo en el estado en memoria del reductor; al pasar a `sesion-vencida` o al cancelar, se descarta. Nada va a `localStorage`, `sessionStorage` ni cookies (recuperarlo tras el login está fuera de alcance, D5) |
| DoS | Una respuesta tardía o de una solicitud vieja expulsa al usuario o lo deja colgado en `guardando` | Medium | Low | **MC-9:** `sin-sesion` lleva `solicitudId` y solo se acepta en `procesando`/`guardando` con el id vigente (A6); `guardado-tiempo-agotado` saca del estado colgado a los 30 s y las respuestas tardías se ignoran (D4) |
| Elevation of Privilege | N/A — la UI no decide permisos | — | — | El servidor revalida sesión y datos en cada llamada |

## Clasificación de datos sensibles (F-TM-05)

| Dato | Clasificación | Dónde vive |
|---|---|---|
| Consumo cargado a mano o estimado (descripción, calorías, desglose) asociado a un usuario | PII sensible (hábitos alimentarios, cercanos a salud) | Tabla `consumos`; en memoria del navegador mientras se edita |
| Foto del plato | PII | Sin cambios: transitoria, nunca en disco, BD ni logs propios. La carga manual no la envía |
| `solicitudId` | Identificador seudónimo aleatorio (`crypto.randomUUID`); no contiene datos del usuario | Tabla `consumos` (columna `solicitud_id`), payload de guardado |
| `confianza` | No sensible (número derivado de la salida del modelo) | Memoria del request y del navegador; no se persiste |
| `usuario_id` | Identificador seudónimo | Tabla `consumos`; no se copia a los logs |

## Cifrado (F-TM-07)

- **En tránsito:** navegador ↔ servidor por HTTPS en despliegue; servidor ↔ Google por HTTPS (SDK);
  servidor ↔ PostgreSQL con `sslmode=require`. Sin cambios.
- **En reposo:** `consumos` hereda la asunción de FEAT-001a y FEAT-001b: el cifrado en reposo se delega
  al proveedor de PostgreSQL, a confirmar antes de manejar usuarios reales. FEAT-001c no persiste
  datos nuevos sensibles: la columna `solicitud_id` es un UUID aleatorio.

## Dependencias (W-TM-01) y disponibilidad (W-TM-02)

- **Dependencias:** FEAT-001c no agrega ninguna. Las de FEAT-001b (`@google/genai` 2.24.0) no cambian.
- **Disponibilidad:** el guardado tiene ahora un tiempo máximo de 30 s en el cliente y la
  idempotencia hace seguro el reintento; un timeout no cancela la operación en el servidor, pero el
  reintento con el mismo `solicitudId` no duplica el consumo.

## Riesgos aceptados

### 1. Gana la última escritura al reintentar un guardado (LOW)

| Campo | Valor |
|---|---|
| Riesgo | Con `ON CONFLICT DO UPDATE`, una petición repetida o tardía del mismo `solicitudId` puede pisar en silencio una edición posterior del mismo intento del propio usuario. Alcance limitado a filas del usuario de la sesión |
| Quién lo acepta | dot.dev.intech@gmail.com (dueño del proyecto), 2026-09-29 (decisión D3) |
| Justificación | La alternativa (`DO NOTHING`) descartaría en silencio las ediciones del usuario al reintentar, que es peor. Hoy el único usuario es el de QA y no existe historial, edición ni eliminación de consumos |
| Condiciones de revisión | Al agregar edición o eliminación de consumos, historial o uso desde varios dispositivos; o si aparece un consumo con valores inesperados tras un reintento |

### 2. Excepción a "no destructive migrations": `DROP CONSTRAINT` de `consumos_origen_check` (MEDIUM)

| Campo | Valor |
|---|---|
| Riesgo | Ampliar el CHECK de `origen` para admitir `'manual'` exige `DROP CONSTRAINT` + `ADD CONSTRAINT` en Postgres; hay una ventana breve sin el CHECK y un bloqueo corto de la tabla. No borra ni modifica datos |
| Quién lo acepta | dot.dev.intech@gmail.com (dueño del proyecto), 2026-09-29 (decisión D2) |
| Justificación | Es la única forma de que la carga manual guarde `origen = 'manual'` en vez de un valor falso; ambas sentencias van en la misma migración, la tabla es chica y solo la usa QA |
| Condiciones de revisión | Cualquier migración futura con un `DROP` distinto exige una nueva aprobación; se revisa si la tabla tiene datos reales o volumen alto antes de aplicar una migración similar |

### Riesgos heredados de FEAT-001b que siguen vigentes (sin cambios)

- **Aceptado #1 de FEAT-001b (foto a Google, nivel gratuito, HIGH):** sigue igual, con su condición de
  revisión (facturación antes de usuarios reales). La carga manual reduce la exposición.
- **Aceptado #2 de FEAT-001b (sin rate limiting, MEDIUM):** sigue igual; la idempotencia ayuda a que
  los reintentos no multipliquen filas.

## Mitigaciones incorporadas al spec

1. **MC-1** `validarDatosConsumo` con `solicitudId` UUID obligatorio, `origen` en lista cerrada y
   descarte de campos extra, incluido `confianza` (Block 2).
2. **MC-2** Unicidad por `(usuario_id, solicitud_id)` y `set` sin `usuario_id` ni `created_at`; test de
   dos usuarios con el mismo `solicitudId` (Blocks 1 y 2).
3. **MC-3** La carga manual usa la misma validación y los mismos CHECKs que el flujo con foto
   (Blocks 2 y 6).
4. **MC-4** CHECKs por columna y `set` con columnas explícitas; tests de que `id` y `created_at` se
   conservan (Blocks 1 y 2).
5. **MC-5** `confianza` numérica finita, limitada a 0..100, no persistida y sin efecto sobre accesos
   (Block 4).
6. **MC-6** El botón "Iniciar sesión" solo hace `router.refresh()`; la redirección a `RUTA_LOGIN` es del
   servidor (Blocks 5 y 6).
7. **MC-7** Sin `dangerouslySetInnerHTML` ni `innerHTML`; SAST en CODE (Blocks 5 y 6).
8. **MC-8** El borrador vive solo en memoria y se descarta al cancelar o vencer la sesión (Block 6).
9. **MC-9** `sin-sesion` con `solicitudId` aceptado solo en `procesando`/`guardando`; timeout de 30 s y
   respuestas tardías ignoradas (Block 6).
10. Test de la migración `0002`: el único `DROP` permitido es `DROP CONSTRAINT "consumos_origen_check"`
    (Block 1).
11. Tests sin llamadas reales a la API de Google: el modelo sigue mockeado (Block 4).
12. Documentar en ADR-010 los riesgos aceptados #1 y #2 y sus condiciones de revisión (Block 7).

## Resumen

Riesgos nuevos: C:0 H:0 M:5 (4 mitigados, 1 aceptado #2) L:14 (13 mitigados, 1 aceptado #1). Riesgo
heredado sin cambios: H:1 (foto a Google, aceptado en FEAT-001b).
Resultado: **PASSED**: todo riesgo tiene mitigación incorporada al spec o aceptación formal con los 3
campos de F-TM-04 (quién, justificación, condición de revisión). Ambas aceptaciones corresponden a
decisiones que el usuario aprobó explícitamente el 2026-09-29 (D2 y D3).
