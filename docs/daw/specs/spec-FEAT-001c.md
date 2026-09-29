# Spec FEAT-001c: Carga manual y manejo de baja confianza en el registro de consumo por foto

| Field | Value |
|-------|-------|
| Ticket | FEAT-001c |
| PRD | docs/daw/prd/prd-FEAT-001c.md |
| Tier | FEATURE |
| Date | 2026-09-29 |
| Spec loops | 0 |

## Summary

Sobre el flujo de FEAT-001b (`src/features/consumos`), se agregan cinco comportamientos.
(1) **Baja confianza:** el modelo devuelve un campo `confianza` (0-100) junto con la estimación; si es
<= 70 el flujo pasa por una pantalla de advertencia con "Cargar otra imagen", "Revisar datos" y
"Cancelar", y la revisión exige marcar una casilla de confirmación antes de guardar. (2) **Carga
manual:** desde la pantalla de error se entra a la misma pantalla de revisión con el borrador vacío y
`origen: 'manual'`. (3) **Idempotencia:** el `solicitudId` (UUID que el cliente ya genera y conserva
entre reintentos) viaja en el guardado y se persiste en una columna nueva con índice único
`(usuario_id, solicitud_id)`; el repository hace `INSERT … ON CONFLICT DO UPDATE`, así un mismo intento
deja como máximo una fila. (4) **Tiempo máximo de guardado:** a los 30 s sin respuesta el flujo vuelve
a la revisión con aviso, conservando el borrador. (5) **Sesión vencida:** un resultado `sin-sesion`
lleva a una pantalla que avisa antes de mandar al usuario a iniciar sesión. Toda decisión vive en el
reductor puro; el contenedor cliente solo cablea eventos y timers (ADR-008).

**Decisiones aprobadas por el usuario el 2026-09-29 (PLAN):**
- **D1.** La confianza la devuelve el modelo (autorreportada, 0-100, entera tras normalizar). Ausente o
  inválida = 0 (baja confianza, falla del lado seguro). No se persiste.
- **D2.** Ampliar `consumos_origen_check` a `'camara' | 'galeria' | 'manual'` requiere
  `DROP CONSTRAINT` + `ADD CONSTRAINT`. Excepción documentada a "no destructive migrations": no borra ni
  modifica datos. Solo ese `DROP` está permitido en la 0002.
- **D3.** `solicitudId` obligatorio al guardar; `ON CONFLICT DO UPDATE` (gana la última escritura).
- **D4.** Una respuesta tardía del guardado, tras el corte a los 30 s, se ignora en el reductor; el
  reintento con el mismo `solicitudId` es idempotente y devuelve `guardado`.
- **D5.** La pantalla de sesión vencida aplica a análisis y guardado por igual. Mientras el usuario
  solo edita en la revisión no hay ninguna request, así que la sesión vencida durante la revisión se
  detecta, y se avisa, al intentar guardar (FR-08, AC-08).
- **D6.** La confirmación de AC-04 es una casilla "Revisé la descripción y las calorías", obligatoria
  solo con baja confianza; no se exige cambiar valores.

**Decisiones de diseño derivadas de la auditoría de arquitectura (`daw-arch-auditor`, 2026-09-29):**
- **A1.** `NuevoConsumo.solicitudId: string` (obligatorio al escribir) y `Consumo.solicitudId:
  string | null` (lectura: las filas de FEAT-001b no lo tienen), declarados por separado, sin casts.
- **A2.** No se crean archivos excluidos de cobertura: ADR-008 fija cerrada esa lista. La lógica nueva
  va en el reductor y en `domain/rules.ts` (testeables en `node`); las pantallas nuevas se prueban con
  `renderToStaticMarkup`; el temporizador de guardado vive en `nuevo-consumo.tsx`, ya excluido.
- **A3.** Se extrae `ContenidoNutricional` (descripcion + calorias + desglose) para que `DatosConsumo`,
  `NuevoConsumo` y `Consumo` no hereden `confianza`.
- **A4.** `OrigenImagen` conserva su nombre y gana `'manual'` (evita renombrar una columna ya migrada);
  se corrige su JSDoc y se documenta en ADR-010.
- **A5.** Las pantallas nuevas van en archivos propios en kebab-case
  (`pantalla-baja-confianza.tsx`, `pantalla-sesion-vencida.tsx`); el reductor sigue en un solo archivo
  con su `switch` exhaustivo (`satisfies never`). Sin `index.ts`.
- **A6.** `sin-sesion` lleva `solicitudId` y el reductor solo lo acepta si coincide con la solicitud
  vigente y el estado es `procesando` o `guardando` (mismo criterio que A7/M-11 de FEAT-001b): una
  respuesta tardía o de una solicitud vieja no expulsa al usuario.
- **A7.** El umbral (70), `esBajaConfianza`, `normalizarConfianza` y `TIEMPO_LIMITE_GUARDADO_MS` (30 000)
  viven en `domain/rules.ts`, no en `modelo-vision.ts` (que importa `@google/genai`, prohibido para
  archivos `'use client'` por la regla 6 del guardián de dependencias).

**Terminología.** Se usan los términos del PRD y del glosario de `AGENTS.md`: "Consumo" = entidad
`Consumo` / tabla `consumos`; "carga manual" = revisión con `origen: 'manual'`; "advertencia de baja
confianza" = estado `baja-confianza`; "confirmar explícitamente" = casilla de confirmación de la
revisión; "un mismo intento de registro" = un mismo `solicitudId`.

**Sin dependencias nuevas.** Todo se resuelve con lo que ya hay en el repo.

**Aplicar la migración 0002 en la BD de test** (procedimiento ya documentado en `docker-compose.yml`):
`docker compose up -d --wait`, luego `set -a; . ./.env; set +a; DATABASE_URL="$TEST_DATABASE_URL" pnpm
exec drizzle-kit migrate`, y recién después `pnpm test:integration`.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 2, Block 6 |
| FR-02 | Block 4, Block 5, Block 6 |
| FR-03 | Block 5, Block 6 |
| FR-04 | Block 5, Block 6 |
| FR-05 | Block 5, Block 6 |
| FR-06 | Block 1, Block 2, Block 3 |
| FR-07 | Block 5, Block 6 |
| FR-08 | Block 5, Block 6 |
| NFR-01 | Strategy: el umbral vive como constante única `UMBRAL_CONFIANZA = 70` en `domain/rules.ts` y `esBajaConfianza(c) = c <= 70` es la única decisión (70 → baja, 71 → no baja); un test fija los dos lados de la frontera. La confianza se normaliza a entero 0..100 en `analizarImagen`, y ausente o inválida cuenta como 0 |
| NFR-02 | Strategy: las pantallas nuevas y las modificadas reutilizan `nuevo-consumo.module.css` mobile-first de ADR-008 (una columna fluida, `rem`, controles con alto táctil de 44 px, `.campo` y `.boton`); la casilla y los botones nuevos respetan ese alto. Verificación manual en VERIFY a 426×240 (240p), 360×640 y 3840×2160 (4K) |
| NFR-03 | Strategy: `TIEMPO_LIMITE_GUARDADO_MS = 30_000` en `domain/rules.ts` (un test fija el valor) y un temporizador en `nuevo-consumo.tsx` que arranca al entrar a `guardando`, se limpia al salir y despacha `guardado-tiempo-agotado`. La decisión (volver a `revision` con aviso y borrador) está en el reductor y sí se testea |

## Dependencies between blocks

Secuenciales: **1 → 2 → 3 → 4 → 5 → 6 → 7**. Cada bloque deja el repo compilando y la suite en verde.

- Block 2 depende de 1: el repository escribe `solicitud_id` y el CHECK con `'manual'`.
- Block 3 depende de 2: `datosDesdeBorrador` envía el `solicitudId` que el dominio ahora exige.
- Block 4 no depende de 2 y 3 en código, pero va después para no mezclar el cambio de tipos de
  idempotencia con el de confianza.
- Block 5 depende de 4 (`EstimacionNutricional.confianza`) y solo agrega componentes nuevos y textos de
  avisos, sin cablearlos.
- Block 6 depende de 3, 4 y 5: el reductor, las pantallas existentes y el contenedor cambian juntos
  porque los `switch` exhaustivos (`satisfies never`) y `Record<AvisoRevision, string>` rompen la
  compilación si se separan.
- Block 7 depende de que todos los cambios existan (ADRs y verificación final).

Entre el Block 2 y el Block 3 el guardado desde la UI devolvería `datos-invalidos` (la UI aún no envía
`solicitudId`); es un estado intermedio de CODE, no se publica, y los tests de ambos bloques quedan en
verde.

## Amenazas y mitigaciones

Threat model: `docs/daw/security/threat-FEAT-001c.md` (las "MC-n" de este documento son sus
"Mitigaciones incorporadas al spec"). Resultado: PASSED, sin riesgos críticos ni altos nuevos y dos
riesgos aceptados por el usuario el 2026-09-29: (#1) gana la última escritura al reintentar un guardado
(D3) y (#2) el `DROP CONSTRAINT` de `consumos_origen_check` (D2). Dónde vive cada mitigación:

| Mitigación | Dónde se implementa |
|---|---|
| MC-1 `solicitudId` UUID obligatorio, `origen` en lista cerrada, descarte de campos extra (incluida `confianza`) | Block 2 |
| MC-2 unicidad por `(usuario_id, solicitud_id)`; el `set` no toca `usuario_id` ni `created_at` | Blocks 1 y 2 |
| MC-3 la carga manual usa la misma validación y los mismos CHECKs que el flujo con foto | Blocks 2 y 6 |
| MC-4 CHECKs por columna y `set` con columnas explícitas | Blocks 1 y 2 |
| MC-5 `confianza` finita, limitada a 0..100, no persistida y sin efecto sobre accesos | Block 4 |
| MC-6 "Iniciar sesión" solo hace `router.refresh()`; redirige el servidor a `RUTA_LOGIN` | Blocks 5 y 6 |
| MC-7 sin `dangerouslySetInnerHTML` ni `innerHTML` | Blocks 5 y 6 (SAST en CODE) |
| MC-8 el borrador vive solo en memoria y se descarta al cancelar o vencer la sesión | Block 6 |
| MC-9 `sin-sesion` con `solicitudId` solo en `procesando`/`guardando`; timeout y respuestas tardías ignoradas | Block 6 |

## Block 1 — Base de datos: `solicitud_id`, índice único y origen `'manual'`

**Files**
- `src/shared/db/schema.ts` (modified) — columna `solicitudId`, índice único, CHECK de `origen`
  ampliado y comentario de `origen` actualizado (ya no dice que solo admite cámara/galería).
- `drizzle/migrations/0002_consumos_idempotencia.sql` (new) — generado con
  `pnpm exec drizzle-kit generate --name consumos_idempotencia`.
- `drizzle/migrations/meta/0002_snapshot.json` (new) y `drizzle/migrations/meta/_journal.json`
  (modified) — generados por drizzle-kit.
- `src/shared/db/schema.test.ts` (modified) — lista de columnas, CHECKs, índice nuevo y test de la 0002.
- `src/shared/db/schema.integration.test.ts` (modified) — `'manual'` aceptado, unicidad e insert.

**Logic**
La tabla `consumos` gana `solicitud_id uuid` **nullable** (las filas de FEAT-001b no lo tienen) y el
índice único **no parcial** `consumos_usuario_solicitud_uidx` sobre `(usuario_id, solicitud_id)`
(Postgres permite varios NULL en un índice único, y un índice no parcial permite inferirlo en
`ON CONFLICT`). `consumos_origen_check` pasa a `origen IN ('camara', 'galeria', 'manual')`. La SQL
esperada de la 0002 es exactamente: `ALTER TABLE "consumos" DROP CONSTRAINT "consumos_origen_check"`,
`ALTER TABLE "consumos" ADD COLUMN "solicitud_id" uuid`, `CREATE UNIQUE INDEX
"consumos_usuario_solicitud_uidx" ON "consumos" USING btree ("usuario_id","solicitud_id")` y
`ALTER TABLE "consumos" ADD CONSTRAINT "consumos_origen_check" CHECK (…IN ('camara','galeria','manual'))`.
Si drizzle-kit genera algo más (otro `DROP`, `TRUNCATE`, `DELETE`), el bloque se detiene y se corrige el
schema, no la migración a mano. Si no genera la ampliación del CHECK, se edita la 0002 a mano
manteniendo coherentes el journal y el snapshot.

**Data model**
- Entidad `consumos` (existente). Campo nuevo: `solicitud_id uuid`, nullable, sin default, sin FK.
- Índice único no parcial `consumos_usuario_solicitud_uidx (usuario_id, solicitud_id)`.
- Constraint `consumos_origen_check` ampliado a `'camara' | 'galeria' | 'manual'` (los demás CHECKs no
  cambian).

**Error handling**
- Un `origen` fuera de los tres valores → la BD lo rechaza por `consumos_origen_check`; el repository lo
  envuelve en `RepositoryError` (comportamiento de FEAT-001b, sin cambios).
- Un insert plano duplicado sobre `(usuario_id, solicitud_id)` → la BD lo rechaza por el índice único
  (el camino normal usa `ON CONFLICT`, Block 2).
- Si `drizzle-kit generate` produce sentencias destructivas adicionales, el bloque no se cierra (ver
  Logic).

**Rollback (W-SPEC-03).** Aditiva salvo el CHECK. Para revertir: `DROP INDEX
"consumos_usuario_solicitud_uidx"`, `ALTER TABLE "consumos" DROP COLUMN "solicitud_id"` y volver a
`consumos_origen_check` con dos valores, **después** de borrar o reasignar las filas con
`origen = 'manual'` (el CHECK estrecho fallaría con ellas). Se aplica solo si la 0002 se descarta antes
de tener datos reales.

**Required tests**
- [ ] `schema.test.ts`: la lista exacta de columnas de `consumos` incluye `solicitud_id` (nullable, uuid)
  — valida AC-06.
- [ ] `schema.test.ts`: existe el índice único `consumos_usuario_solicitud_uidx` sobre
  `(usuario_id, solicitud_id)` y no es parcial — valida AC-06.
- [ ] `schema.test.ts`: `consumos_origen_check` admite exactamente `'camara'`, `'galeria'` y `'manual'`
  — valida AC-01.
- [ ] `schema.test.ts` (migración 0002): el único `DROP` permitido es `DROP CONSTRAINT
  "consumos_origen_check"`; no contiene `DROP TABLE`, `DROP COLUMN`, `DROP INDEX`, `TRUNCATE` ni
  `DELETE` — sad path de la excepción D2.
- [ ] `schema.integration.test.ts`: insertar con `origen = 'manual'` funciona — valida AC-01.
- [ ] `schema.integration.test.ts` (sad path): insertar con `origen = 'otro'` se rechaza por
  `consumos_origen_check`.
- [ ] `schema.integration.test.ts` (sad path): dos inserts con el mismo `(usuario_id, solicitud_id)` →
  el segundo se rechaza por el índice único — valida AC-06.
- [ ] `schema.integration.test.ts`: dos filas con `solicitud_id` NULL para el mismo usuario coexisten
  (datos de FEAT-001b) — valida AC-06.

**Completion criterion**
`pnpm exec tsc --noEmit`, `pnpm lint` y `pnpm test:unit` pasan; con la 0002 aplicada a la BD de test,
`pnpm test:integration` pasa; el `.sql` generado contiene solo las cuatro sentencias listadas.

## Block 2 — Idempotencia en el dominio y el repository

**Files**
- `src/features/consumos/domain/types.ts` (modified) — `OrigenImagen` gana `'manual'` (JSDoc
  corregido), nuevo `ContenidoNutricional`, `DatosConsumo` y `NuevoConsumo` con `solicitudId: string`,
  `Consumo` con `solicitudId: string | null`.
- `src/features/consumos/domain/rules.ts` (modified) — `'manual'` en `ORIGENES`, `validarSolicitudId`,
  `validarDatosConsumo` devuelve `solicitudId`.
- `src/features/consumos/domain/errors.ts` (modified) — `CampoDatosConsumo` gana `'solicitudId'`.
- `src/features/consumos/data/consumo-repository.ts` (modified) — `ON CONFLICT DO UPDATE` y
  `aConsumo` con `solicitudId`.
- Tests modificados: `domain/rules.test.ts`, `domain/errors.test.ts`, `domain/consumo-service.test.ts`,
  `data/consumo-repository.integration.test.ts`, `ui/registro-consumo.test.ts`, `ui/actions.test.ts`,
  `ui/operaciones-consumo.test.ts` (payloads de guardado con `solicitudId`).

**Logic**
- Tipos: `ContenidoNutricional = { descripcion; calorias; desglose }` (base sin `confianza`).
  `DatosConsumo = ContenidoNutricional & { origen: OrigenImagen; solicitudId: string }`.
  `NuevoConsumo = DatosConsumo & { usuarioId: string }`. `Consumo` se declara aparte, con
  `solicitudId: string | null`, sin intersectar con `NuevoConsumo` (los tipos serían incompatibles) y
  sin casts (A1). `EstimacionNutricional` no cambia todavía (Block 4).
- `validarSolicitudId(valor: unknown): string` acepta solo un string con forma de UUID
  (`8-4-4-4-12` hexadecimal, sin importar mayúsculas) y lo devuelve en minúsculas; cualquier otra cosa
  lanza `DatosConsumoInvalidosError('solicitudId')`. `validarDatosConsumo` la llama después de
  `origen`, devuelve un objeto nuevo solo con campos conocidos (la `confianza` o cualquier campo extra
  que llegue del cliente se descarta, M-3) e incluye `solicitudId`.
- Repository: `crearConsumo` inserta con `solicitudId` y
  `.onConflictDoUpdate({ target: [consumos.usuarioId, consumos.solicitudId], set: { descripcion,
  calorias, pctCarbohidratos, pctProteinas, pctGrasas, pctOtros, origen } })` con **columnas
  explícitas**: el `set` nunca toca `id`, `usuario_id`, `solicitud_id` ni `created_at`. Se conservan
  `.returning()` y el chequeo `!fila → RepositoryError('consumos.crear')`. `aConsumo` mapea
  `fila.solicitudId` (`string | null`) tal cual.
- Gana la última escritura; el riesgo (una petición repetida o tardía puede pisar una edición
  posterior del mismo intento) se acepta y se documenta en ADR-010 (Block 7).

**API contract** *(server action `guardarNuevoConsumo` de `ui/actions.ts`: el código de `actions.ts` no
cambia, sí lo hace el contrato de su entrada)*
- Método y ruta: server action de Next (`'use server'`, POST implícito), exportada como
  `guardarNuevoConsumo(datos: unknown)`; `actions.ts` sigue exportando exactamente dos funciones.
- Request: `{ descripcion: string, calorias: number, desglose: { carbohidratos, proteinas, grasas,
  otros: number }, origen: 'camara' | 'galeria' | 'manual', solicitudId: string }` (campo nuevo:
  `solicitudId`; `origen` gana `'manual'`).
- Response: `{ tipo: 'guardado' } | { tipo: 'datos-invalidos' } | { tipo: 'sin-sesion' } | { tipo:
  'error' }` (sin cambios; nunca lleva mensajes técnicos).
- Códigos de error: `datos-invalidos` (entrada rechazada por el dominio), `sin-sesion`, `error` (fallo
  de BD).
- Auth: cookie de sesión; el `usuarioId` sale solo de la sesión y nunca del payload (M-1). El
  `solicitudId` se acota siempre al usuario de la sesión (índice único `(usuario_id, solicitud_id)`),
  así un id repetido de otro usuario no pisa filas ajenas.

**Input validation**
- `solicitudId`: string, exactamente 36 caracteres con forma UUID, obligatorio; sin él → `datos-invalidos`.
- `origen`: uno de `'camara'`, `'galeria'`, `'manual'`.
- `descripcion`, `calorias`, `desglose`: sin cambios de FEAT-001b (1-500 caracteres, entero 0-10 000,
  cuatro enteros 0-100 que suman 100).
- Los campos desconocidos, incluido `confianza`, se descartan.

**Error handling**
- `solicitudId` ausente, no string o mal formado → `DatosConsumoInvalidosError('solicitudId')`; la capa
  ui lo traduce a `{ tipo: 'datos-invalidos' }` (sin cambios).
- `origen` desconocido → `DatosConsumoInvalidosError('origen')` (sin cambios).
- Fallo de BD en el upsert → `RepositoryError('consumos.crear')` vía `conRepositoryError` (sin cambios).
- Cualquier otro error se relanza (ADR-005).

**Required tests**
- [ ] `rules.test.ts`: acepta `origen: 'manual'` y devuelve `solicitudId` en minúsculas — valida AC-01.
- [ ] `rules.test.ts` (sad path): `solicitudId` ausente, número, string vacío y string no UUID →
  `DatosConsumoInvalidosError('solicitudId')`.
- [ ] `rules.test.ts`: una `confianza` o un `usuarioId` en la entrada no aparecen en el resultado —
  descarte de campos extra (M-3).
- [ ] `rules.test.ts` (sad path): `origen` fuera de los tres valores → `DatosConsumoInvalidosError('origen')`.
- [ ] `errors.test.ts`: `CampoDatosConsumo` incluye `'solicitudId'` y el mensaje sigue siendo fijo.
- [ ] `consumo-repository.integration.test.ts`: guardar dos veces el mismo `(usuarioId, solicitudId)` con
  datos editados en el segundo → una sola fila, con los valores del segundo, mismo `id` y mismo
  `created_at` — valida AC-06.
- [ ] `consumo-repository.integration.test.ts`: mismo `solicitudId` con dos usuarios distintos → dos
  filas — valida AC-06.
- [ ] `consumo-repository.integration.test.ts` (sad path): un fallo de BD se envuelve en
  `RepositoryError('consumos.crear')`.
- [ ] `consumo-service.test.ts`: `guardarConsumo` rechaza con `DatosConsumoInvalidosError('solicitudId')`
  una entrada sin `solicitudId` y no llama al repository.
- [ ] `registro-consumo.test.ts`, `actions.test.ts`, `operaciones-consumo.test.ts`: los fixtures de
  guardado incluyen `solicitudId` y el caso sin él devuelve `{ tipo: 'datos-invalidos' }`.
- [ ] `operaciones-consumo.test.ts` (sad path): un error inesperado (ni `DatosConsumoInvalidosError` ni
  `RepositoryError`) se relanza y no se convierte en un resultado (ADR-005).

**Completion criterion**
`tsc --noEmit`, `pnpm lint`, `pnpm test:unit` y `pnpm test:integration` pasan; `Consumo.solicitudId` es
`string | null` y no hay ningún `as` nuevo en el archivo del repository.

## Block 3 — `solicitudId` en el payload de guardado

**Files**
- `src/features/consumos/ui/flujo-nuevo-consumo.ts` (modified) — `datosDesdeBorrador(borrador, origen,
  solicitudId)`.
- `src/features/consumos/ui/procesar-imagen.ts` (modified) — `procesarGuardado` pasa el `solicitudId`
  que ya recibe.
- `src/features/consumos/ui/flujo-nuevo-consumo.test.ts` y `ui/procesar-imagen.test.ts` (modified).

**Logic**
`datosDesdeBorrador` incluye `solicitudId` en el objeto que devuelve (sigue siendo `unknown`: la
validación real la hace el servidor). `procesarGuardado` ya recibe `solicitudId` en su primer
argumento y lo pasa. El `solicitudId` es el mismo en el primer intento y en los reintentos (el reductor
ya lo conserva en `guardado-fallo`), que es lo que hace idempotente el reintento (FR-06).

**Input validation**
No recibe entrada del usuario: la validación del `solicitudId` es del servidor (Block 2).

**Error handling**
- Un rechazo de la action (red caída) → `{ tipo: 'guardado-fallo', motivo: 'error' }` con el mismo
  `solicitudId` (sin cambios); el borrador se conserva.

**Required tests**
- [ ] `flujo-nuevo-consumo.test.ts`: `datosDesdeBorrador` incluye el `solicitudId` recibido y el
  `origen` — valida AC-06.
- [ ] `procesar-imagen.test.ts`: `procesarGuardado` llama a `guardar` con un payload que contiene el
  `solicitudId` — valida AC-06.
- [ ] `procesar-imagen.test.ts` (sad path): un rechazo de `guardar` devuelve `guardado-fallo` con
  `motivo: 'error'` y el mismo `solicitudId`.
- [ ] `procesar-imagen.test.ts`: dos llamadas sucesivas con el mismo `solicitudId` envían el mismo id —
  valida AC-06.

**Completion criterion**
`tsc --noEmit`, `pnpm lint` y `pnpm test:unit` pasan; el guardado desde la UI vuelve a llegar a la
action con un `solicitudId` válido.

## Block 4 — Confianza autorreportada del modelo

**Files**
- `src/features/consumos/domain/types.ts` (modified) — `EstimacionNutricional = ContenidoNutricional &
  { confianza: number }`.
- `src/features/consumos/domain/rules.ts` (modified) — `UMBRAL_CONFIANZA`, `esBajaConfianza`,
  `normalizarConfianza`.
- `src/features/consumos/data/modelo-vision.ts` (modified) — prompt, `responseSchema`,
  `EstimacionCruda` y guard con `confianza`.
- `src/features/consumos/domain/consumo-service.ts` (modified) — `analizarImagen` normaliza la
  confianza.
- Tests modificados: `domain/rules.test.ts`, `domain/consumo-service.test.ts`,
  `data/modelo-vision.test.ts`, y los fixtures de `EstimacionNutricional` en
  `ui/flujo-nuevo-consumo.test.ts`, `ui/procesar-imagen.test.ts`, `ui/operaciones-consumo.test.ts`,
  `ui/pantallas-nuevo-consumo.test.tsx` y `ui/actions.test.ts`.

**Logic**
- Prompt: se agrega un punto pidiendo `"confianza"`: un entero de 0 a 100 con el nivel de confianza en
  que la descripción, las calorías y el desglose reflejan lo que aparece en la foto (100 = certeza
  total; un valor bajo si la foto es borrosa, está tapada, mal iluminada o el alimento es difícil de
  identificar). Se agrega `confianza: { type: Type.NUMBER }` al `RESPONSE_SCHEMA` y a
  `CAMPOS_RESPUESTA` (`required` y `propertyOrdering`).
- Guard `interpretarRespuestaModelo`: `confianza` es un número finito o, si falta o no lo es, vale `0`
  (comentario del porqué: es la salida no confiable de un tercero y es preferible advertir al usuario
  antes que descartar la estimación; no es un `catch` silencioso). El resto de las validaciones no
  cambia.
- `EstimacionCruda` gana `confianza: number`. `analizarImagen` devuelve
  `confianza: normalizarConfianza(crudo.confianza)`.
- `rules.ts`: `UMBRAL_CONFIANZA = 70`; `esBajaConfianza(confianza) = confianza <= UMBRAL_CONFIANZA`;
  `normalizarConfianza(valor)` devuelve un entero entre 0 y 100 (no finito → 0, se limita al rango y se
  redondea como las calorías).
- La confianza **no** se persiste ni entra en `DatosConsumo`/`NuevoConsumo`/`Consumo` (A3).

**Input validation**
La entrada es la respuesta del modelo (no confiable): `confianza` numérica finita o se toma como 0; el
valor final se limita a 0-100 y se redondea. Nada del texto de la respuesta se registra.

**Error handling**
- `confianza` ausente, no numérica o `NaN` → se trata como `0`, sin lanzar (baja confianza).
- Descripción, calorías o desglose inválidos → `AnalisisImagenError('respuesta-invalida')` (sin
  cambios).
- Fallo, timeout o falta de key del modelo → `AnalisisImagenError` (sin cambios).

**Required tests**
- [ ] `rules.test.ts`: `esBajaConfianza(70)` es `true`, `esBajaConfianza(71)` es `false`,
  `esBajaConfianza(0)` es `true` y `esBajaConfianza(100)` es `false` — valida AC-02 y NFR-01.
- [ ] `rules.test.ts`: `normalizarConfianza` redondea 84.6 a 85, limita 101 a 100 y -5 a 0 — valida
  NFR-01.
- [ ] `rules.test.ts` (sad path): `normalizarConfianza(NaN)`, `Infinity` y `-Infinity` devuelven 0.
- [ ] `modelo-vision.test.ts`: una respuesta con `confianza: 85` la devuelve en `EstimacionCruda` —
  valida AC-02.
- [ ] `modelo-vision.test.ts` (sad path): respuesta sin `confianza`, con `confianza: "alta"` y con
  `NaN` devuelve `confianza: 0` sin lanzar.
- [ ] `modelo-vision.test.ts`: el `responseSchema` y el prompt incluyen `confianza`; el modelo sigue
  mockeado y no se llama a la API real.
- [ ] `modelo-vision.test.ts` (sad path): una respuesta con descripción inválida sigue lanzando
  `AnalisisImagenError('respuesta-invalida')`.
- [ ] `modelo-vision.test.ts` (sad path): el abort por timeout, un fallo del SDK y la falta de
  `GEMINI_API_KEY` siguen lanzando `AnalisisImagenError('timeout')`, `AnalisisImagenError('fallo')` y
  `AnalisisImagenError('no-configurado')` respectivamente.
- [ ] `consumo-service.test.ts`: `analizarImagen` devuelve la `confianza` normalizada a entero 0-100 —
  valida AC-02.
- [ ] `consumo-service.test.ts` (sad path): un `AnalisisImagenError` del adaptador se propaga sin
  cambios.

**Completion criterion**
`tsc --noEmit`, `pnpm lint` y `pnpm test:unit` pasan; `interpretarRespuestaModelo` devuelve siempre un
`confianza` numérico; ningún test llama a la API de Google.

## Block 5 — Pantallas nuevas: baja confianza y sesión vencida

**Files**
- `src/features/consumos/ui/pantalla-baja-confianza.tsx` (new) — `PantallaBajaConfianza`.
- `src/features/consumos/ui/pantalla-sesion-vencida.tsx` (new) — `PantallaSesionVencida`.
- `src/features/consumos/ui/flujo-nuevo-consumo.ts` (modified) — `AvisoRevision` gana
  `'confirmar-revision'` y `'guardado-sin-respuesta'` (solo el tipo; el reductor no cambia en este
  bloque).
- `src/features/consumos/ui/pantallas-nuevo-consumo.tsx` (modified) — `TEXTO_AVISO` con los dos avisos
  nuevos.
- `src/features/consumos/ui/nuevo-consumo.module.css` (modified) — solo si hace falta un estilo
  nuevo; se reutilizan `.campo` y `.boton`.
- `src/features/consumos/ui/pantallas-nuevo-consumo.test.tsx` (modified) — tests de las pantallas
  nuevas y de los avisos.

**Logic**
Componentes presentacionales puros, sin estado propio (ADR-008); reciben callbacks por props y no
muestran endpoint, payload, nombre de modelo ni texto técnico. No se usan todavía: quedan sin cablear
hasta el Block 6, así este bloque compila sin tocar los `switch` exhaustivos.
- `PantallaBajaConfianza({ onCargarOtraImagen, onRevisarDatos, onCancelar })`: texto de advertencia
  ("La estimación de esta foto es poco confiable…"), y tres botones: "Cargar otra imagen", "Revisar
  datos" y "Cancelar".
- `PantallaSesionVencida({ onIniciarSesion })`: texto "Tu sesión venció." y un botón "Iniciar sesión".
- Textos de los avisos nuevos: `'confirmar-revision'` → "Confirmá que revisaste la descripción y las
  calorías."; `'guardado-sin-respuesta'` → "No recibimos respuesta al guardar. Podés reintentar."

**Error handling**
Los componentes no fallan (JSX puro); una prop de callback ausente es un error de tipos en compilación.

**Required tests**
- [ ] `PantallaBajaConfianza` muestra el texto de advertencia y los tres botones — valida AC-02 y AC-03.
- [ ] `PantallaBajaConfianza`: invocar el `onClick` de cada botón llama al callback correspondiente
  (`onCargarOtraImagen`, `onRevisarDatos`, `onCancelar`) — valida AC-03 y AC-05.
- [ ] `PantallaSesionVencida` muestra el mensaje de sesión vencida y el botón "Iniciar sesión" — valida
  AC-08.
- [ ] `PantallaSesionVencida`: el `onClick` del botón llama a `onIniciarSesion` — valida AC-08.
- [ ] `TEXTO_AVISO`: los dos avisos nuevos se muestran en `PantallaRevision` (`role="alert"`) — valida
  AC-04 y AC-07.
- [ ] (sad path) Ninguna de las pantallas nuevas contiene texto técnico (endpoint, "gemini", "500",
  "stack").

**Completion criterion**
`tsc --noEmit`, `pnpm lint`, `pnpm test:unit` y `pnpm exec prettier --check .` pasan; las pantallas
nuevas quedan cubiertas al 100 % sin agregar ningún archivo a `coverage.exclude`.

## Block 6 — Reductor de flujo y contenedor: manual, confianza, timeout y sesión

**Files**
- `src/features/consumos/ui/flujo-nuevo-consumo.ts` (modified) — estados, eventos y transiciones
  nuevos.
- `src/features/consumos/ui/procesar-imagen.ts` (modified) — `sin-sesion` lleva `solicitudId`.
- `src/features/consumos/ui/pantallas-nuevo-consumo.tsx` (modified) — `PantallaError` con "Cargar
  manualmente"; `PantallaRevision` con la casilla de confirmación y sin el aviso de "estimación" en la
  carga manual.
- `src/features/consumos/ui/nuevo-consumo.tsx` (modified) — cablea los estados nuevos, el temporizador
  de guardado y la carga manual (archivo excluido de cobertura, ADR-008).
- `src/features/consumos/domain/rules.ts` (modified) — `TIEMPO_LIMITE_GUARDADO_MS = 30_000`.
- Tests modificados: `ui/flujo-nuevo-consumo.test.ts`, `ui/procesar-imagen.test.ts`,
  `ui/pantallas-nuevo-consumo.test.tsx`, `domain/rules.test.ts`.

**Logic**
Toda decisión vive en `reducirFlujo` (un solo archivo, un solo `switch` con `satisfies never`, A5).

*Estados.* Nuevos: `baja-confianza { solicitudId, origen, borrador }` y `sesion-vencida`. `revision`
gana `requiereConfirmacion: boolean` y `confirmado: boolean`; `guardando` gana `requiereConfirmacion`
para poder volver a `revision` sin perderla.

*Eventos nuevos.* `carga-manual { solicitudId }`, `continuar-a-revision`, `cargar-otra-imagen`,
`confirmar-revision { confirmado: boolean }`, `guardado-tiempo-agotado { solicitudId }`. El evento
`sin-sesion` pasa a llevar `solicitudId`.

*Transiciones (estado × evento; todo lo no listado devuelve el mismo estado, el reductor es total):*

| Estado | Evento | Resultado |
|---|---|---|
| `procesando` (mismo id) | `analisis-ok` con `esBajaConfianza(confianza)` | `baja-confianza` con el borrador de la estimación |
| `procesando` (mismo id) | `analisis-ok` sin baja confianza | `revision` con `requiereConfirmacion: false` |
| `error` | `carga-manual { solicitudId }` | `revision` con borrador vacío, `origen: 'manual'`, `requiereConfirmacion: false` |
| `baja-confianza` | `continuar-a-revision` | `revision` con el mismo borrador, `requiereConfirmacion: true`, `confirmado: false` |
| `baja-confianza` | `cargar-otra-imagen` | `inicio` |
| `baja-confianza` | `cancelar` | `inicio` (FR-05) |
| `revision` con `requiereConfirmacion` | `confirmar-revision { confirmado }` | mismo estado con `confirmado` actualizado y sin aviso |
| `revision` | `campo-editado` | conserva `requiereConfirmacion` y `confirmado`, borra el aviso |
| `revision` | `guardar` con `requiereConfirmacion` y sin `confirmado` | mismo estado con aviso `confirmar-revision` |
| `revision` | `guardar` con el desglose que no suma 100 | mismo estado con aviso `desglose-no-suma-100` (como en FEAT-001b) |
| `revision` | `guardar` válido (mismo id) | `guardando` |
| `guardando` (mismo id) | `guardado-tiempo-agotado` | `revision` con el mismo borrador y `solicitudId`, `confirmado = requiereConfirmacion`, aviso `guardado-sin-respuesta` |
| `revision` / cualquiera distinto de `guardando` | `guardado-ok`, `guardado-fallo` (respuesta tardía) | sin cambio (D4) |
| `procesando` o `guardando` (mismo id) | `sin-sesion { solicitudId }` | `sesion-vencida` (D5, A6) |
| cualquier otro estado, o id distinto | `sin-sesion` | sin cambio |
| `sesion-vencida`, `guardando`, `guardado` | `cancelar` | sin cambio |
| `revision`, `procesando`, `error` | `cancelar` | `inicio` (como en FEAT-001b) |

*Casilla de confirmación (D6).* En `revision` con `requiereConfirmacion`, "Guardar" no avanza mientras
`confirmado` sea `false`; marcarla no exige modificar ningún valor (AC-04). Con `guardado-fallo` desde
`guardando`, el reductor vuelve a `revision` conservando `confirmado`.

*Carga manual.* El contenedor genera el `solicitudId` (`crypto.randomUUID()`), despacha `carga-manual`,
y el reductor solo lo acepta desde `error`. El borrador vacío pasa por la validación existente: sin
suma exactamente 100 → aviso `desglose-no-suma-100` (AC-01); sin descripción o con calorías inválidas
→ el servidor responde `datos-invalidos`. `PantallaRevision` recibe `esManual`, `requiereConfirmacion`,
`confirmado` y `onConfirmar`; en la carga manual oculta "Esta información es una estimación…".
`PantallaError` recibe `onCargarManual` y muestra "Cargar manualmente" junto a "Reintentar" y
"Cancelar".

*Contenedor (`nuevo-consumo.tsx`).* Un `useEffect` como el de `procesando`: al entrar a `guardando`
arranca un temporizador de `TIEMPO_LIMITE_GUARDADO_MS` que despacha `guardado-tiempo-agotado`, y se
limpia al salir. `despacharEvento` ya no llama a `router.refresh()` en `sin-sesion`; lo hace el botón
"Iniciar sesión" de `PantallaSesionVencida` (`router.refresh()` → la página redirige a `RUTA_LOGIN`,
D1 de FEAT-001b). El `switch` de `pantalla()` cubre `baja-confianza` y `sesion-vencida`.
`guardadoDisparadoRef` se sigue liberando al salir de `guardando`, así el reintento con el mismo
`solicitudId` vuelve a disparar el guardado. En `procesar-imagen.ts`, `eventoDeAnalisis` y
`eventoDeGuardado` devuelven `{ tipo: 'sin-sesion', solicitudId }`.

**Input validation** *(campos del formulario de la carga manual, mismos límites que FEAT-001b)*
- Descripción: texto de 1 a 500 caracteres (`maxLength` en el input, recorte por code points en el
  reductor).
- Calorías: entero de 0 a 10 000.
- Carbohidratos, proteínas, grasas y otros nutrientes: enteros de 0 a 100 que suman exactamente 100.
- Un campo vacío se convierte en `NaN` (nunca en 0) y la validación del servidor lo rechaza.
- La validación real siempre la hace el servidor (Block 2).

**Error handling**
- `guardar` sin confirmar con baja confianza → aviso `confirmar-revision`; no se llama a la action.
- Desglose que no suma 100 (incluida la carga manual) → aviso `desglose-no-suma-100`.
- Guardado sin respuesta a los 30 s → `revision` con aviso `guardado-sin-respuesta`, el borrador y el
  `solicitudId` intactos; el usuario puede reintentar o cancelar (AC-07).
- Respuesta tardía del guardado después del corte → se ignora; el reintento devuelve `guardado` por
  idempotencia (D4).
- `sin-sesion` durante análisis o guardado → `sesion-vencida` con mensaje (AC-08); un `sin-sesion` de
  una solicitud que ya no es la vigente se ignora.
- Evento inválido para el estado, o evento desconocido → mismo estado, sin lanzar.
- Un rechazo de la action de guardado (red) → `guardado-fallo` con `motivo: 'error'` (sin cambios).

**Required tests**
- [ ] `flujo-nuevo-consumo.test.ts`: `analisis-ok` con confianza 70 → `baja-confianza`; con 71 →
  `revision` con `requiereConfirmacion: false` — valida AC-02 y NFR-01.
- [ ] `flujo-nuevo-consumo.test.ts`: `baja-confianza` + `cargar-otra-imagen` → `inicio` — valida AC-03.
- [ ] `flujo-nuevo-consumo.test.ts`: `baja-confianza` + `continuar-a-revision` → `revision` con
  `requiereConfirmacion: true` y `confirmado: false` — valida AC-04.
- [ ] `flujo-nuevo-consumo.test.ts`: `guardar` con `requiereConfirmacion` sin confirmar → aviso
  `confirmar-revision` y sigue en `revision`; tras `confirmar-revision` con el mismo borrador (sin
  cambiar ningún valor) → `guardando` — valida AC-04.
- [ ] `flujo-nuevo-consumo.test.ts`: `campo-editado` en una revisión con baja confianza conserva
  `requiereConfirmacion` y `confirmado` — valida AC-04.
- [ ] `flujo-nuevo-consumo.test.ts`: `error` + `carga-manual` → `revision` con borrador vacío,
  `origen: 'manual'` y el `solicitudId` recibido — valida AC-01.
- [ ] `flujo-nuevo-consumo.test.ts` (sad path): `carga-manual` fuera de `error` no cambia el estado —
  valida AC-01.
- [ ] `flujo-nuevo-consumo.test.ts` (sad path): una carga manual cuyo desglose no suma 100 → aviso
  `desglose-no-suma-100` y no pasa a `guardando`; con suma 100 y datos válidos → `guardando` — valida
  AC-01.
- [ ] `flujo-nuevo-consumo.test.ts`: `cancelar` desde `baja-confianza` y desde la carga manual →
  `inicio` sin datos guardados — valida AC-05.
- [ ] `flujo-nuevo-consumo.test.ts`: `guardando` + `guardado-tiempo-agotado` (mismo id) → `revision`
  con el mismo borrador, el mismo `solicitudId` y aviso `guardado-sin-respuesta` — valida AC-07.
- [ ] `flujo-nuevo-consumo.test.ts` (sad path): `guardado-tiempo-agotado` con otro `solicitudId` o
  fuera de `guardando` no cambia el estado; una respuesta tardía `guardado-ok` o `guardado-fallo` en
  `revision` se ignora — valida AC-07.
- [ ] `flujo-nuevo-consumo.test.ts`: tras `guardado-tiempo-agotado`, `guardar` otra vez pasa a
  `guardando` con el mismo `solicitudId` — valida AC-06 y AC-07.
- [ ] `flujo-nuevo-consumo.test.ts`: `sin-sesion` con el id vigente en `procesando` y en `guardando`
  → `sesion-vencida` — valida AC-08.
- [ ] `flujo-nuevo-consumo.test.ts` (sad path): `sin-sesion` con id distinto, en `revision`, `inicio` o
  `guardado` no cambia el estado; `cancelar` en `sesion-vencida` no cambia el estado — valida AC-08.
- [ ] `flujo-nuevo-consumo.test.ts`: un evento desconocido devuelve el mismo estado sin lanzar.
- [ ] `procesar-imagen.test.ts`: los resultados `sin-sesion` de análisis y guardado producen
  `{ tipo: 'sin-sesion', solicitudId }` con el id recibido — valida AC-08.
- [ ] `procesar-imagen.test.ts` (sad path): un rechazo de la action de guardado (red) sigue
  produciendo `{ tipo: 'guardado-fallo', motivo: 'error' }` con el `solicitudId` original, sin
  perder el borrador — valida AC-06 y AC-07.
- [ ] `rules.test.ts`: `TIEMPO_LIMITE_GUARDADO_MS` vale `30_000` — valida NFR-03 y AC-07.
- [ ] `pantallas-nuevo-consumo.test.tsx`: `PantallaError` muestra "Cargar manualmente" y su `onClick`
  llama a `onCargarManual` — valida AC-01.
- [ ] `pantallas-nuevo-consumo.test.tsx`: `PantallaRevision` con `requiereConfirmacion` muestra la
  casilla "Revisé la descripción y las calorías" y su `onChange` llama a `onConfirmar`; sin
  `requiereConfirmacion` no la muestra — valida AC-04.
- [ ] `pantallas-nuevo-consumo.test.tsx`: en carga manual, `PantallaRevision` no muestra "Esta
  información es una estimación…" — valida AC-01.

**Completion criterion**
`tsc --noEmit`, `pnpm lint`, `pnpm exec prettier --check .`, `pnpm test:unit` y `pnpm test:integration`
pasan; `pnpm test:coverage` cumple los mínimos sobre el código nuevo; el `switch` del reductor y el de
`pantalla()` siguen cerrados con `satisfies never`; ningún archivo nuevo entra en `coverage.exclude`.

## Block 7 — ADRs y verificación final del guardián

**Files**
- `docs/adr/adr-010-idempotencia-y-confianza-del-modelo.md` (new) — ADR nuevo.
- `docs/adr/adr-009-integracion-con-modelo-de-vision.md` (modified) — nota sobre el cambio de prompt y
  `responseSchema`.
- `docs/adr/adr-008-ui-interactiva-tests-y-css-modules.md` (modified) — nota mínima: FEAT-001c no
  agrega excepciones a la lista de exclusiones de cobertura.

**Logic**
Bloque habilitador sin FR propio: solo documenta las decisiones D1-D6 y A1-A7 de los bloques 1 a 6 en
los ADR del proyecto (W-SPEC-01: justificado, no es alcance sin aprobar). ADR-010 registra: (a) idempotencia por `solicitudId` con `ON CONFLICT DO UPDATE` y su riesgo aceptado (la
última escritura gana; una petición repetida o tardía puede pisar una edición posterior del mismo
intento); (b) confianza autorreportada por el modelo, no persistida, con ausente = 0; (c) la excepción
D2 (`DROP CONSTRAINT`/`ADD CONSTRAINT` para admitir `'manual'`, sin pérdida de datos); (d) `OrigenImagen`
conserva su nombre y gana `'manual'`; (e) `sin-sesion` con `solicitudId`. ADR-009 suma la nueva
instrucción del prompt y el campo `confianza` del `responseSchema`. ADR-008 aclara que no se agregan
exclusiones.

**Error handling**
Cambios de documentación: sin ejecución. Si un ADR contradijera el código, la verificación del bloque
falla y se corrige el ADR (no la spec).

**Required tests**
- [ ] `pnpm exec prettier --check .` pasa con los tres ADR (formato).
- [ ] `src/shared/reglas-de-dependencias.test.ts` sigue verde sin cambios: los archivos `'use client'`
  nuevos no importan `*-service`, `env`, `@google/genai` ni `data/` — verifica A7.
- [ ] Revisión cruzada (`grep`): ADR-010 menciona cada decisión D1-D6 y A1-A7 que afecta el código, y
  ningún ADR dice que `origen` solo admite cámara o galería.

**Completion criterion**
Los ADR existen y coinciden con el código; `pnpm test:unit`, `pnpm lint`, `pnpm exec tsc --noEmit` y
`pnpm exec prettier --check .` pasan; el CHANGELOG y el índice de `prd-FEAT-001.md` se actualizan en
RELEASE, no aquí.

## Final verification

Al terminar los siete bloques:
1. `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm exec prettier --check .`, `pnpm test:unit` y (con la
   0002 aplicada a la BD de test) `pnpm test:integration` pasan; `pnpm test:coverage` cumple 80/80/80
   sobre el código nuevo, sin archivos nuevos excluidos.
2. Cada AC del PRD (AC-01 a AC-08) tiene al menos un test que pasa, según los bloques 1 a 6.
3. Prueba manual en VERIFY: (a) foto de baja confianza (borrosa o tapada) → advertencia → "Revisar
   datos" → guardar bloqueado hasta marcar la casilla; (b) error de análisis → "Cargar manualmente" →
   guardar con suma 100; (c) reintentar un guardado tras cortar la red no genera dos filas; (d) guardado
   sin respuesta → aviso a los 30 s con el borrador intacto; (e) sesión vencida → mensaje antes de ir a
   iniciar sesión; (f) responsive a 426×240, 360×640 y 3840×2160 (NFR-02).
4. Sin `any` nuevo, sin catch silencioso, sin dependencias nuevas, sin llamadas reales a la API de
   Google en tests, y la migración 0002 contiene solo el `DROP` permitido por D2.
