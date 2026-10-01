# ADR-010: Idempotencia del guardado por `solicitudId` y confianza autorreportada del modelo

| Field | Value |
|-------|-------|
| Date | 2026-09-29 (riesgo residual de D4 agregado el 2026-09-30) |
| Ticket | FEAT-001c |
| Status | Accepted |

## Context

FEAT-001c agrega al flujo de FEAT-001b la advertencia de baja confianza, la carga manual, el tiempo
máximo de guardado y el aviso de sesión vencida (`docs/daw/prd/prd-FEAT-001c.md`, FR-01 a FR-08). Eso
obliga a decidir cinco cosas que tocan la BD, el dominio y el flujo de la UI: cómo se evita duplicar un
Consumo cuando el usuario reintenta un guardado, de dónde sale la confianza, cómo se admite el origen
`'manual'` en una tabla ya migrada, cómo se tipa ese origen y qué pasa con las respuestas que llegan
tarde. Las amenazas están en `docs/daw/security/threat-FEAT-001c.md` y el diseño en
`docs/daw/specs/spec-FEAT-001c.md`.

## Options considered

### Idempotencia del guardado
- **Opción 1: `INSERT ... ON CONFLICT DO UPDATE` sobre `(usuario_id, solicitud_id)`.**
  - **Pros:** un mismo intento deja como máximo una fila, aunque la petición se repita; una sola
    sentencia, sin lectura previa ni carreras.
  - **Cons:** gana la última escritura (ver "Riesgo aceptado").
- **Opción 2: `ON CONFLICT DO NOTHING` y devolver la fila existente.**
  - **Pros:** una petición repetida o tardía nunca pisa datos.
  - **Cons:** el reintento tras editar el borrador descartaría la edición y el usuario vería "guardado"
    con datos distintos de los que envió.
- **Opción 3: consultar antes de insertar.**
  - **Pros:** lógica explícita.
  - **Cons:** dos viajes a la BD y una carrera entre la consulta y el `INSERT`.

### Confianza
- **Opción 1: la devuelve el modelo (autorreportada), sin persistirla.**
  - **Pros:** una sola llamada al modelo; sin columna nueva; no hay que guardar un dato que solo decide
    una pantalla.
  - **Cons:** es un número que el propio modelo declara, no una medida objetiva.
- **Opción 2: derivarla de una segunda llamada al modelo o de heurísticas sobre la respuesta.**
  - **Pros:** más independiente de lo que el modelo dice de sí mismo.
  - **Cons:** duplica el costo de un servicio pago (ADR-009) o inventa reglas sin base.

### Origen `'manual'`
- **Opción 1: ampliar `consumos_origen_check` con `DROP CONSTRAINT` + `ADD CONSTRAINT`.**
  - **Pros:** la BD sigue imponiendo la lista cerrada de orígenes.
  - **Cons:** un `DROP` en una migración; excepción a "no destructive migrations".
- **Opción 2: quitar el CHECK y validar solo en la aplicación.**
  - **Pros:** sin `DROP` de ida y vuelta.
  - **Cons:** se pierde la defensa en profundidad de la BD.

## Decision

Elegido por el usuario el 2026-09-29 (PLAN), salvo el riesgo residual de D4, que el usuario aceptó el
2026-09-30 (CODE):

### D3: idempotencia del guardado

- **Idempotencia (D3).** `solicitudId` (UUID que el cliente ya genera y conserva entre reintentos) es
  obligatorio al guardar y se persiste en `consumos.solicitud_id` (`uuid`, nullable, sin FK: las filas de
  FEAT-001b no lo tienen). El índice único no parcial `consumos_usuario_solicitud_uidx` sobre
  `(usuario_id, solicitud_id)` permite varios NULL y permite inferir el índice en `ON CONFLICT`.
  `crearConsumo` hace `INSERT ... ON CONFLICT DO UPDATE` con columnas explícitas en el `set`
  (`descripcion`, `calorias`, los cuatro porcentajes y `origen`): nunca toca `id`, `usuario_id`,
  `solicitud_id` ni `created_at`. El `usuarioId` sale solo de la sesión, así que un id repetido de otro
  usuario no pisa filas ajenas. Las mitigaciones MC-2 (unicidad por `(usuario_id, solicitud_id)` y `set`
  sin `usuario_id` ni `created_at`) y MC-4 (CHECKs por columna y `set` con columnas explícitas) del threat
  model respaldan esta decisión.
- **Riesgo aceptado #1 de FEAT-001c (D3): gana la última escritura**
  (`docs/daw/security/threat-FEAT-001c.md`; no confundir con el riesgo aceptado #1 de FEAT-001b, que es
  la foto enviada a Google). Una petición repetida o tardía puede pisar una edición posterior del mismo
  intento. Aceptado por el usuario el 2026-09-29.
  - **Condiciones de revisión** (las del threat model, aprobadas el 2026-09-29): al agregar edición o
    eliminación de consumos, historial o uso desde varios dispositivos; o si aparece un consumo con
    valores inesperados tras un reintento. Se suma, a pedido del usuario el 2026-09-30: antes de exponer
    la app fuera de QA.

### D4: respuesta tardía del guardado

- **Respuesta tardía (D4).** Una respuesta del guardado (`guardado-ok` o `guardado-fallo`) que llega
  después del corte a los 30 s se ignora en el reductor cuando el estado no es `guardando` o cuando su
  `solicitudId` no coincide con el vigente (`ui/flujo-nuevo-consumo.ts`). El reintento con el mismo
  `solicitudId` devuelve `guardado`. MC-9 del threat model respalda esta decisión, junto con
  `guardado-tiempo-agotado` que saca del estado colgado a los 30 s.
- **Riesgo residual aceptado por el usuario el 2026-09-30 (distinto de los riesgos aceptados #1 y #2
  de FEAT-001c, que se aceptaron el 2026-09-29).** Detectado en la revisión del Block 6 de CODE y no presente en el threat
  model ni en la spec; se documenta solo aquí porque ambos no se pueden modificar en CODE. Tras el corte
  a los 30 s la promesa original de guardado sigue viva: si resuelve con `guardado-fallo` con el MISMO
  `solicitudId` mientras un reintento está en `guardando`, el reductor lo acepta (el id coincide y el
  estado es `guardando`) y devuelve a `revision` un reintento todavía en vuelo.
  - **Justificación:** el borrador se conserva, el reintento es idempotente y un `guardado-ok` tardío es
    correcto por idempotencia, así que el impacto es bajo.
  - **Condiciones de revisión:** se reevalúa si se observa en pruebas o en uso que el usuario pierde o
    repite un guardado por este motivo, o si se agrega otro camino de guardado.

### D1, D6: confianza del modelo

- **Confianza (D1, A7).** La devuelve el modelo: un campo `confianza` en el prompt y en el
  `responseSchema` (ADR-009), 0 a 100, entera tras `normalizarConfianza`. Ausente o inválida cuenta como
  0 (baja confianza: falla del lado seguro, en vez de descartar una estimación válida). No se persiste ni
  entra en `DatosConsumo`, `NuevoConsumo` ni `Consumo`; `validarDatosConsumo` descarta cualquier
  `confianza` que llegue del cliente. El umbral `UMBRAL_CONFIANZA = 70`, `esBajaConfianza` (`<= 70`),
  `normalizarConfianza` y `TIEMPO_LIMITE_GUARDADO_MS = 30_000` viven en `domain/rules.ts` y no en
  `modelo-vision.ts`: ese archivo importa `@google/genai`, prohibido para los archivos `'use client'`
  por la regla del guardián de dependencias (ADR-007, nota 2026-09-25).
- **Confirmación (D6).** Con baja confianza la revisión exige marcar la casilla "Revisé la descripción y
  las calorías" antes de guardar. No se exige cambiar ningún valor.

### D2: origen `'manual'` en el CHECK

- **Excepción a "no destructive migrations" (D2).** `AGENTS.md`, sección "What NOT to do", dice: "No
  destructive migrations". Esta decisión es una excepción documentada a esa regla. La migración
  `0002_consumos_idempotencia` hace `DROP CONSTRAINT "consumos_origen_check"` y `ADD CONSTRAINT` con
  `origen IN ('camara', 'galeria', 'manual')`. No borra ni modifica datos. Es el único `DROP` permitido en
  la 0002 y un test lo fija (no admite `DROP TABLE`, `DROP COLUMN`, `DROP INDEX`, `TRUNCATE` ni
  `DELETE`; punto 10 de las mitigaciones del threat model).
- **Riesgo aceptado #2 de FEAT-001c (D2)** (`docs/daw/security/threat-FEAT-001c.md`; no confundir con el
  riesgo aceptado #2 de FEAT-001b, que es la ausencia de rate limiting). Aceptado por el usuario el
  2026-09-29.
  - **Condiciones de revisión** (las del threat model, aprobadas el 2026-09-29): cualquier migración
    futura con un `DROP` distinto exige una nueva aprobación; se revisa si la tabla tiene datos reales o
    volumen alto antes de aplicar una migración similar. Se suma, a pedido del usuario el 2026-09-30:
    antes de aplicar cualquier migración posterior que toque el mismo CHECK, y el rollback solo es válido
    mientras no haya datos reales.

### D5, A1 a A6: tipos, sesión vencida, cobertura

- **Tipos (A4, A1, A3).** `OrigenImagen` conserva su nombre y gana `'manual'` (evita renombrar una
  columna ya migrada). Para la selección de foto, `ui/flujo-nuevo-consumo.ts` declara
  `OrigenFoto = Exclude<OrigenImagen, 'manual'>`: cámara o galería. `NuevoConsumo.solicitudId` es
  `string` (obligatorio al escribir) y `Consumo.solicitudId` es `string | null` (lectura), declarados
  por separado y sin casts (A1). Se extrae `ContenidoNutricional` (descripcion, calorias, desglose) para
  que `DatosConsumo`, `NuevoConsumo` y `Consumo` no hereden `confianza`; `EstimacionNutricional =
  ContenidoNutricional & { confianza: number }` (A3).
- **Sesión vencida (A6, D5).** El evento `sin-sesion` lleva `solicitudId` y el reductor solo lo acepta si
  coincide con la solicitud vigente y el estado es `procesando` o `guardando` (mismo criterio de solicitud
  vigente que usa FEAT-001b para descartar respuestas tardías; MC-9). La pantalla aplica a análisis y
  guardado por igual. Si la sesión vence mientras el usuario solo edita, se detecta al intentar guardar.
  "Iniciar sesión" solo hace `router.refresh()`; la página redirige a `RUTA_LOGIN`.
- **Cobertura y archivos (A2, A5).** No se agrega ningún archivo a `coverage.exclude` (ADR-008 fija
  cerrada esa lista). La lógica nueva va en el reductor y en `domain/rules.ts`; las pantallas nuevas van en
  archivos propios en kebab-case (`pantalla-baja-confianza.tsx`, `pantalla-sesion-vencida.tsx`) y se
  prueban con `renderToStaticMarkup`; el reductor sigue en un solo archivo con su `switch` exhaustivo
  (`satisfies never`), sin `index.ts`.

## Consequences

- Reintentar un guardado con el mismo `solicitudId` no duplica el Consumo. Las filas anteriores a la
  0002 tienen `solicitud_id` NULL y no chocan entre sí.
- Aceptado: la última escritura gana (riesgo aceptado #1 de FEAT-001c, 2026-09-29), y un
  `guardado-fallo` tardío con el mismo `solicitudId` puede devolver a revisión un reintento en vuelo
  (riesgo residual aceptado el 2026-09-30). Condiciones de revisión en la sección Decision.
- La confianza depende de lo que el modelo declare: si se equivoca al autoevaluarse, el usuario recibe o
  deja de recibir la advertencia sin que el sistema lo detecte. Como mitigación, todo valor ausente o no
  numérico cuenta como 0.
- **Rollback de la 0002:** solo es viable antes de tener datos reales: `DROP INDEX`, `DROP COLUMN
  "solicitud_id"` y volver el CHECK a dos valores, después de borrar o reasignar las filas con
  `origen = 'manual'` (riesgo aceptado #2 de FEAT-001c).
- Cualquier cambio futuro del umbral o del tiempo límite de guardado se hace en `domain/rules.ts`; la
  excepción es `TIEMPO_LIMITE_MS`, local al análisis, pendiente de la deuda de abajo.
- **Deuda menor conocida, decisión diferida a VERIFY de FEAT-001c** (unificar o abrir un ticket aparte;
  mientras tanto no afecta el comportamiento):
  - Hay dos constantes de 30 s con distinto origen: `TIEMPO_LIMITE_MS`, local a `ui/nuevo-consumo.tsx`
    para el análisis, y `TIEMPO_LIMITE_GUARDADO_MS`, en `domain/rules.ts`, para el guardado. En VERIFY se
    decide si se unifican o se abre un ticket.
  - `despacharEvento` en `ui/nuevo-consumo.tsx` es hoy un wrapper vacío de `despachar` (ya no hace nada
    propio desde que `sin-sesion` no llama a `router.refresh()`). Misma decisión diferida.
- **Archivos afectados:** `src/shared/db/schema.ts`, `drizzle/migrations/0002_consumos_idempotencia.sql`
  (+ snapshot y journal), `src/features/consumos/{domain,data,ui}/**` y sus tests.
- **Documentación:** notas en ADR-008 (sin exclusiones nuevas de cobertura) y ADR-009 (prompt y
  `responseSchema` con `confianza`).
