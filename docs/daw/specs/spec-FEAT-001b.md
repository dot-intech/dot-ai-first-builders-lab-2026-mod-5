# Spec FEAT-001b: Registrar consumo a partir de una foto (captura/galería) con análisis de IA

| Field | Value |
|-------|-------|
| Ticket | FEAT-001b |
| PRD | docs/daw/prd/prd-FEAT-001b.md |
| Tier | FEATURE |
| Date | 2026-09-26 |
| Spec loops | 2 |

## Summary

Feature nueva `src/features/consumos/{ui,domain,data}` y ruta `/consumos/nuevo`. El usuario elige o
saca una foto; el navegador la reduce y reencodea a JPEG con canvas (~1280 px, < ~900 KB, sin EXIF)
y la envía a una server action. El servidor valida la imagen (bytes mágicos JPEG + tope), la analiza
con `gemini-3.1-flash-lite` vía `@google/genai` (adaptador en `data/`, abort a 25 s), normaliza el
desglose a enteros que suman 100 y devuelve la estimación. El usuario la revisa, la edita y la
guarda: una segunda action valida los datos y los persiste en la tabla nueva `consumos`, asociados al
usuario de la sesión (`resolverUsuarioDeSesion`, `src/shared`). El flujo de pantalla es un reductor
puro; el contenedor cliente solo conecta eventos.

Decisiones: ADR-007 (nota 2026-09-25), ADR-008 (tests de UI interactiva y CSS Modules), ADR-009
(integración con el modelo de visión). Amenazas y mitigaciones: `docs/daw/security/threat-FEAT-001b.md`
(las "M-n" de este documento son sus "Mitigaciones incorporadas al spec").

**Terminología.** "Consumo" (PRD, glosario de `AGENTS.md`) = entidad `Consumo` / tabla `consumos`.
"Bitácora de consumos del usuario" (FR-02, FR-04) = filas de `consumos` con su `usuario_id`.
"Desglose nutricional" (FR-08) = `DesgloseNutricional { carbohidratos, proteinas, grasas, otros }`
(porcentajes enteros), que en la UI se muestran como "Carbohidratos", "Proteínas", "Grasas" y "Otros
Nutrientes". "Estimación" = `EstimacionNutricional { descripcion, calorias, desglose }`, lo que se
muestra tras analizar (FR-06, FR-07, FR-08). "Usuario de la sesión activa" (FR-14) = resultado
`{ tipo: 'usuario' }` de `resolverUsuarioDeSesion`.

**Decisión de producto documentada (D1).** Sin sesión, las actions devuelven `{ tipo: 'sin-sesion' }`
y la página `/consumos/nuevo` redirige a `RUTA_LOGIN` (`src/app/rutas.ts`, hoy `'/dev-login'`). En
producción esa ruta responde 404 hasta que exista el login real (fuera de alcance); aceptado por el
usuario el 2026-09-24.

**Dependencia nueva: `@google/genai` 2.24.0.** Justificación (regla "no new libraries without
justifying them in the spec"): es la librería oficial de Google para la API de Gemini que declara el
Stack de `AGENTS.md` ("genai"); versión `latest` al 2026-09-24, publicada por Google (`google-wombot`,
`ofrobots`); 4 dependencias directas (`ws`, `p-retry`, `protobufjs`, `google-auth-library`). Se fija
exacta y se corre `pnpm audit` antes de commitear el lockfile (precedente ADR-003). Verificado en sus
tipos (2.24.0): `ai.models.generateContent({ model, contents, config })`, `config.abortSignal`,
`config.responseMimeType`, `config.responseSchema`, `response.text`, `ApiError.status`; sin
`httpOptions.retryOptions` el SDK no reintenta.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 7, Block 8 |
| FR-02 | Block 2, Block 4, Block 5, Block 6 |
| FR-03 | Block 7, Block 8 |
| FR-04 | Block 2, Block 4, Block 5, Block 6 |
| FR-05 | Block 1, Block 4, Block 5, Block 6 |
| FR-06 | Block 4, Block 5, Block 8 |
| FR-07 | Block 4, Block 5, Block 8 |
| FR-08 | Block 3, Block 5, Block 8 |
| FR-09 | Block 7, Block 8 |
| FR-10 | Block 4, Block 6, Block 8 |
| FR-11 | Block 3, Block 7, Block 8 |
| FR-12 | Block 8 |
| FR-13 | Block 7, Block 8 |
| FR-14 | Block 2, Block 5, Block 6 |
| FR-15 | Block 4, Block 6, Block 7, Block 8 |
| NFR-01 | Strategy: una sola llamada al modelo más liviano del Stack (`gemini-3.1-flash-lite`), imagen reducida en el cliente a ~1280 px / < ~900 KB antes de subir (menos transferencia en 4G y menos tokens de imagen), sin reintentos del SDK y sin pasos intermedios en el servidor (no se decodifica la imagen). Se mide a mano en VERIFY con la key real (10 fotos, se reporta el p95); no es automatizable porque depende del servicio externo |
| NFR-02 | Strategy: `abortSignal: AbortSignal.timeout(25_000)` en el servidor (Block 4) + temporizador de 30 s en el cliente que arranca al elegir la imagen (incluye el reencodeo) y pasa el flujo a error (Blocks 7 y 8); ninguna espera supera 30 s desde que el usuario eligió la foto |
| NFR-03 | Strategy: CSS Modules mobile-first (ADR-008): una columna fluida (`width: 100%`, `max-width: 32rem`, centrada), tipografía y controles en `rem`, inputs y botones con alto mínimo táctil de 44 px, imágenes con `max-width: 100%`; Next agrega `<meta name="viewport">` por defecto. Verificación manual en VERIFY a 426×240 (240p), 360×640 y 3840×2160 (4K) |
| NFR-04 | Strategy: la imagen solo existe en memoria del request (`Uint8Array` → base64 hacia Google); ningún `fs`, ni columna, ni log la recibe; errores del SDK envueltos con mensaje fijo y `registro-consumo.ts` copia campo por campo (Blocks 4 y 6, M-4, M-6, M-7). Tests que espían `console.*` y verifican que no aparece el base64 |

## Dependencies between blocks

Secuenciales: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9**. Cada bloque deja el repo compilando y con la suite
en verde.

- Block 2 no depende de Block 1 en código, pero va después para que la dependencia y la configuración
  estén antes que cualquier archivo de la feature.
- Block 3 depende de Block 2 solo por los límites (`DESCRIPCION_MAX`, `CALORIAS_MAX`), que el schema
  replica en sus CHECKs con los mismos valores.
- Block 4 depende de 1 (SDK y `env.geminiApiKey`), 2 (tabla) y 3 (tipos y errores).
- Block 5 depende de 3 y 4. Block 6 depende de 5. Block 7 depende de 3 (tipos) y de los tipos de
  resultado de 6. Block 8 depende de 6 y 7. Block 9 depende de que todos los archivos existan.

## Block 1 — Dependencia y configuración

**Files**
- `package.json` (modified) — `"@google/genai": "2.24.0"` exacto en `dependencies`.
- `pnpm-lock.yaml` (modified) — generado por `pnpm add @google/genai@2.24.0 --save-exact`.
- `src/env.ts` (modified) — `Env.geminiApiKey: string | undefined`.
- `src/env.test.ts` (modified) — casos de `GEMINI_API_KEY` y `vi.stubEnv('GEMINI_API_KEY', '')` en `beforeEach`.
- `.env.example` (modified) — `GEMINI_API_KEY=` documentada.

**Logic**
`buildEnv()` lee `process.env.GEMINI_API_KEY?.trim()`; vacía o solo espacios → `undefined` (misma
regla que `QA_ACCESS_EMAIL`). Es opcional: sin ella la app arranca y solo el análisis falla (Block 4).
Comentario en el código: nunca prefijar con `NEXT_PUBLIC_` (M-8). `.env.example` explica que es
opcional, que nunca lleva `NEXT_PUBLIC_`, que antes de usuarios reales debe ser de un proyecto con
facturación y que conviene ponerle presupuesto o cuota (riesgos aceptados #1 y #2, ADR-009).

**Input validation**
- `GEMINI_API_KEY`: string; se aplica `trim`; vacía → no configurada. Sin validación de formato (la
  valida Google).

**Error handling**
- Falta `GEMINI_API_KEY` → no es error al arrancar (`geminiApiKey: undefined`); el adaptador lo
  traduce a `AnalisisImagenError('no-configurado')` (Block 4).

**Required tests**
- [ ] `env.geminiApiKey` es el valor recortado cuando `GEMINI_API_KEY` tiene espacios alrededor.
- [ ] Error handling: `GEMINI_API_KEY` ausente → `geminiApiKey` es `undefined` y `buildEnv` no lanza.
- [ ] Error handling: `GEMINI_API_KEY` de solo espacios → `undefined`.
- [ ] Los tests existentes de `env.test.ts` siguen pasando sin cambiar aserciones.

**Completion criterion**
`pnpm exec tsc --noEmit`, `pnpm lint` y `pnpm test:unit` pasan; `package.json` tiene `"@google/genai":
"2.24.0"` sin `^`; `pnpm audit` corrido y su resultado informado al usuario (M-13). Si reporta
vulnerabilidades altas o críticas en el árbol nuevo, el bloque no se da por terminado ni se commitea
el lockfile hasta que el usuario decida.

## Block 2 — Tabla `consumos` y migración

**Files**
- `src/shared/db/schema.ts` (modified) — tabla `consumos`.
- `src/shared/db/schema.test.ts` (modified) — helper `columnaDe` acepta `typeof consumos`; tests de la tabla.
- `src/shared/db/schema.integration.test.ts` (modified) — CHECKs contra la BD real.
- `drizzle/migrations/0001_consumos.sql` (new) — generado con `pnpm exec drizzle-kit generate --name consumos`.
- `drizzle/migrations/meta/0001_snapshot.json` (new) — generado.
- `drizzle/migrations/meta/_journal.json` (modified) — entrada `idx: 1`, `tag: 0001_consumos`.

**Logic**
Migración aditiva (solo `CREATE TABLE`, `CREATE INDEX`, FK y CHECKs); se revisa el SQL generado y no
puede contener `DROP` ni `ALTER ... TYPE` (M-12). `origen` es `text` + CHECK, no `pgEnum`: quitar un
valor de un enum sería una migración destructiva.

**Data model**
Tabla `consumos`:

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | `uuid` | PK, `defaultRandom()` |
| `usuario_id` | `uuid` | NOT NULL, FK → `usuarios.id` `ON DELETE CASCADE` |
| `descripcion` | `text` | NOT NULL, CHECK `char_length(descripcion) BETWEEN 1 AND 500` |
| `calorias` | `integer` | NOT NULL, CHECK `calorias BETWEEN 0 AND 10000` |
| `pct_carbohidratos` | `smallint` | NOT NULL, CHECK `BETWEEN 0 AND 100` |
| `pct_proteinas` | `smallint` | NOT NULL, CHECK `BETWEEN 0 AND 100` |
| `pct_grasas` | `smallint` | NOT NULL, CHECK `BETWEEN 0 AND 100` |
| `pct_otros` | `smallint` | NOT NULL, CHECK `BETWEEN 0 AND 100` |
| `origen` | `text` | NOT NULL, CHECK `origen IN ('camara','galeria')` |
| `created_at` | `timestamptz` | NOT NULL, `defaultNow()` |

CHECK de tabla: `pct_carbohidratos + pct_proteinas + pct_grasas + pct_otros = 100`. Índice
`consumos_usuario_id_idx` sobre `usuario_id`. Sin UNIQUE (un usuario puede registrar muchos consumos).
Nombres de CHECK: `consumos_<columna>_check` y `consumos_desglose_suma_check`.

**Error handling**
- Violación de CHECK o FK al insertar → la BD rechaza; en la app llega como `RepositoryError` vía
  `conRepositoryError` (Block 4). Aquí se prueba que la BD efectivamente rechaza.

**Required tests**
- [ ] Unit: columnas, tipos, `notNull`, PK con default, FK a `usuarios` con `onDelete: 'cascade'` e índice `consumos_usuario_id_idx` (validates AC-02, AC-04, AC-14 a nivel de modelo).
- [ ] Integration: inserta un consumo válido para un usuario existente y lo lee de vuelta.
- [ ] Integration, error: porcentajes que suman 99 → la BD rechaza (`consumos_desglose_suma_check`).
- [ ] Integration, error: `calorias = 10001` y `calorias = -1` → rechazo.
- [ ] Integration, error: `descripcion = ''` y de 501 caracteres → rechazo.
- [ ] Integration, error: `origen = 'otro'` → rechazo.
- [ ] Integration, error: `usuario_id` inexistente → rechazo por FK.
- [ ] Integration: borrar el usuario borra sus consumos (cascade).
- [ ] Unit: `0001_consumos.sql` no contiene `DROP` ni `ALTER ... TYPE` (lee el archivo y busca las sentencias, sin distinguir mayúsculas).

**Completion criterion**
`pnpm test:unit` pasa (incluido el test que lee el SQL); con la BD de test levantada y migrada,
`pnpm test:integration` pasa. Si `drizzle-kit generate` produce sentencias destructivas, el bloque no se
da por terminado: se descarta la migración y se consulta al usuario.

## Block 3 — Dominio: tipos, reglas y errores

**Files**
- `src/features/consumos/domain/types.ts` (new) — `OrigenImagen`, `DesgloseNutricional`, `EstimacionNutricional`, `DatosConsumo`, `NuevoConsumo`, `Consumo`.
- `src/features/consumos/domain/rules.ts` (new) — límites y funciones puras.
- `src/features/consumos/domain/rules.test.ts` (new)
- `src/features/consumos/domain/errors.ts` (new) — `AnalisisImagenError`, `DatosConsumoInvalidosError`.
- `src/features/consumos/domain/errors.test.ts` (new)

**Logic**
- Tipos: `OrigenImagen = 'camara' | 'galeria'`; `DesgloseNutricional = { carbohidratos; proteinas;
  grasas; otros }` (enteros); `EstimacionNutricional = { descripcion; calorias; desglose }`;
  `DatosConsumo = EstimacionNutricional & { origen }`; `NuevoConsumo = DatosConsumo & { usuarioId }`;
  `Consumo = NuevoConsumo & { id; createdAt: Date }`.
- Constantes: `DESCRIPCION_MAX = 500`, `CALORIAS_MAX = 10000`, `IMAGEN_MAX_BYTES = 950_000`.
- `esJpeg(bytes: Uint8Array): boolean` — primeros 3 bytes `FF D8 FF`.
- `validarImagen(bytes: Uint8Array): void` — vacía, mayor a `IMAGEN_MAX_BYTES` o no JPEG →
  `AnalisisImagenError('imagen-invalida')` (M-4, A9).
- `normalizarDesglose(crudo: { carbohidratos; proteinas; grasas; otros }, calorias: number):
  DesgloseNutricional` — valores finitos y ≥ 0 con suma > 0; escala a 100 y reparte el redondeo por
  mayor resto (empates por orden fijo carbohidratos → proteinas → grasas → otros). **Consumo de 0 kcal**
  (agua, café solo): si `calorias === 0` y los 4 valores son 0 → `{ carbohidratos: 0, proteinas: 0,
  grasas: 0, otros: 100 }`, para cumplir la suma 100 de FR-08 y el CHECK de la BD. Degenerado
  (negativo, `NaN`, infinito, o suma 0 con `calorias > 0`) → `AnalisisImagenError('respuesta-invalida')`.
- `sumaDesglose(d): number` — suma simple, la usa la UI para avisar antes de guardar.
- `validarDatosConsumo(entrada: unknown): DatosConsumo` — construye un objeto **nuevo** solo con
  `descripcion`, `calorias`, `desglose` y `origen`; cualquier otro campo (p. ej. `usuarioId`) se
  descarta (M-3, A5). Estas funciones son puras: no importan `data/`, sesión ni `env` (A6).
- `AnalisisImagenError(reason, options?)`: `reason: 'imagen-invalida' | 'no-configurado' | 'timeout' |
  'fallo' | 'respuesta-invalida'`; `message` fijo `'No se pudo analizar la imagen'`; el original solo
  en `cause`. `DatosConsumoInvalidosError(campo)`: `campo: 'forma' | 'descripcion' | 'calorias' |
  'desglose' | 'origen'`; `message` fijo `'Los datos del consumo no son válidos'`.

**Input validation**
- Imagen: `Uint8Array`, 1..950 000 bytes, bytes mágicos JPEG.
- `validarDatosConsumo`: objeto no nulo; `descripcion` string, se aplica `trim`, 1..500 caracteres;
  `calorias` entero 0..10000; `desglose` objeto con los 4 campos enteros 0..100 que suman exactamente
  100 (sin normalizar: los editados que no suman 100 se rechazan); `origen` `'camara' | 'galeria'`.

**Error handling**
- Imagen vacía, grande o no JPEG → `AnalisisImagenError('imagen-invalida')`.
- Desglose del modelo degenerado → `AnalisisImagenError('respuesta-invalida')`.
- Desglose todo en 0 con 0 kcal → no es error: `otros: 100`.
- Entrada que no es objeto → `DatosConsumoInvalidosError('forma')`.
- Descripción vacía, no string o > 500 → `DatosConsumoInvalidosError('descripcion')`.
- Calorías no enteras o fuera de 0..10000 → `DatosConsumoInvalidosError('calorias')`.
- Porcentajes faltantes, no enteros, fuera de 0..100 o que no suman 100 → `DatosConsumoInvalidosError('desglose')`.
- Origen desconocido → `DatosConsumoInvalidosError('origen')`.

**Required tests**
- [ ] `normalizarDesglose` con `{ 33.3, 33.3, 33.3, 0.1 }` devuelve enteros que suman exactamente 100 (validates AC-08).
- [ ] `normalizarDesglose` con valores que ya suman 100 los devuelve iguales; con suma 50 los escala al doble (validates AC-08).
- [ ] `normalizarDesglose` resuelve empates en el orden fijo documentado.
- [ ] `normalizarDesglose` con los 4 valores en 0 y `calorias = 0` → `{ 0, 0, 0, otros: 100 }` (validates AC-08).
- [ ] Error handling: `normalizarDesglose` con negativo, `NaN`, `Infinity`, o suma 0 con `calorias = 150` → `AnalisisImagenError` con `reason: 'respuesta-invalida'`.
- [ ] `validarImagen` acepta un JPEG mínimo (`FF D8 FF …`).
- [ ] Error handling: `validarImagen` con 0 bytes, con 950 001 bytes, con un PNG (`89 50 4E 47`) y con texto → `reason: 'imagen-invalida'`.
- [ ] `validarDatosConsumo` con datos válidos devuelve un objeto nuevo, con `descripcion` sin espacios de borde (validates AC-11).
- [ ] `validarDatosConsumo` descarta `usuarioId` y cualquier campo extra del resultado.
- [ ] Error handling: `null`, string o array → `DatosConsumoInvalidosError('forma')`.
- [ ] Error handling: descripción `''`, `'   '`, 501 caracteres o número → `campo: 'descripcion'`.
- [ ] Error handling: calorías `-1`, `10001`, `12.5` o `'100'` → `campo: 'calorias'`.
- [ ] Error handling: porcentajes que suman 99, con un `101`, con un decimal o con una clave faltante → `campo: 'desglose'`.
- [ ] Error handling: `origen: 'otro'` → `campo: 'origen'`.
- [ ] `errors.test.ts`: ambos errores tienen `message` fijo que no incluye el `reason`, el `campo` ni el `cause`; conservan `cause`; `name` correcto; son `instanceof Error`.

**Completion criterion**
`pnpm test:unit` pasa con 100 % de líneas y ramas en `rules.ts` y `errors.ts`; `tsc` y `lint` limpios.

## Block 4 — Datos: adaptador del modelo de visión y repository

**Files**
- `src/features/consumos/data/modelo-vision.ts` (new) — único importador de `@google/genai` (ADR-009).
- `src/features/consumos/data/modelo-vision.test.ts` (new) — `vi.mock('@google/genai')` y `vi.mock` de `../../../env` con getter.
- `src/features/consumos/data/consumo-repository.ts` (new) — `crearConsumo`.
- `src/features/consumos/data/consumo-repository.integration.test.ts` (new)

**Logic**
- `MODELO_VISION = 'gemini-3.1-flash-lite'`, `TIMEOUT_MODELO_MS = 25_000`.
- `analizarConModeloVision(imagen: Uint8Array): Promise<EstimacionCruda>` donde `EstimacionCruda =
  { descripcion: string; calorias: number; desglose: { carbohidratos; proteinas; grasas; otros } }`
  (números sin normalizar):
  1. Lee `env.geminiApiKey` dentro de la función; `undefined` → `AnalisisImagenError('no-configurado')`.
  2. `new GoogleGenAI({ apiKey })` y `ai.models.generateContent({ model: MODELO_VISION, contents:
     [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: <base64> } }, { text:
     PROMPT } ] }], config: { responseMimeType: 'application/json', responseSchema, abortSignal:
     AbortSignal.timeout(TIMEOUT_MODELO_MS) } })`. Sin `retryOptions` (sin reintentos).
  3. `PROMPT` en español (Latinoamérica): identificar alimentos y bebida, descripción amigable,
     breve y concisa (máximo 200 caracteres) que mencione la bebida si hay, calorías totales estimadas
     y porcentaje de las calorías que aportan carbohidratos, proteínas, grasas y otros nutrientes.
     `responseSchema`: objeto con `descripcion` (string), `calorias` (number) y los 4 porcentajes
     (number), todos requeridos.
  4. `response.text` se parsea con `JSON.parse` a una variable `unknown` (A4) y pasa por
     `interpretarRespuestaModelo(valor: unknown): EstimacionCruda` (guard escrito a mano, exportado
     para test): objeto con `descripcion` string no vacía tras `trim` y ≤ 500; `calorias` número
     finito entre 0 y 10000, que se redondea a entero; los 4 porcentajes números finitos.
  5. **Todo** fallo se envuelve en `AnalisisImagenError(reason, { cause })` (M-6, A3): abort o
     `TimeoutError` → `'timeout'`; `ApiError` u otro error de red/SDK → `'fallo'`; `text` vacío, JSON
     inválido o guard fallido → `'respuesta-invalida'`. Nunca loguea ni persiste nada (NFR-04).
- `crearConsumo(nuevo: NuevoConsumo): Promise<Consumo>` —
  `conRepositoryError('consumos.crear', () => db.insert(consumos).values(...).returning())`, y mapea
  la fila a `Consumo` (sin exponer nombres de columnas).

**Input validation**
- `analizarConModeloVision` recibe bytes ya validados por el service (Block 5); la salida del modelo
  es no confiable y se valida con `interpretarRespuestaModelo` (tipos, largo ≤ 500, rango de calorías).
- `crearConsumo` recibe un `NuevoConsumo` ya validado; la BD vuelve a imponer los CHECKs (Block 2).

**Error handling**
- Sin key → `AnalisisImagenError('no-configurado')`, sin llamar al SDK.
- Abort por 25 s → `AnalisisImagenError('timeout')`.
- `ApiError` (4xx/5xx) o error de red → `AnalisisImagenError('fallo')`, con el original en `cause`.
- `response.text` vacío o `undefined`, JSON inválido, o guard fallido → `AnalisisImagenError('respuesta-invalida')`.
- Error de BD en `crearConsumo` → `RepositoryError('consumos.crear')` (compartido); nunca se loguea el original.

**Required tests**
- [ ] `generateContent` se llama con `model: 'gemini-3.1-flash-lite'`, la imagen como `inlineData` JPEG en base64 y el prompt de texto (validates AC-05).
- [ ] La config incluye `responseMimeType: 'application/json'`, `responseSchema` y un `abortSignal`; no incluye `retryOptions`.
- [ ] Una respuesta válida devuelve `EstimacionCruda` con descripción y calorías redondeadas (validates AC-06, AC-07).
- [ ] Error handling: sin `geminiApiKey` → `reason: 'no-configurado'` y `GoogleGenAI` no se instancia.
- [ ] Error handling: el mock rechaza con un error de abort/`TimeoutError` → `reason: 'timeout'`.
- [ ] Error handling: el mock rechaza con un `ApiError` 500 y con un `TypeError` de red → `reason: 'fallo'`, `cause` preservado.
- [ ] Error handling: `text` `undefined`, `'no es json'`, descripción vacía, descripción de 501 caracteres, calorías `-5` o `'300'`, porcentaje faltante → `reason: 'respuesta-invalida'`.
- [ ] El `message` de todos los errores es el fijo y no contiene el nombre del modelo, la key ni texto de la respuesta (validates AC-10).
- [ ] En los caminos de error, `console.*` espiado no recibe el base64 de la imagen ni el texto de la respuesta (NFR-04).
- [ ] Integration: `crearConsumo` inserta y devuelve el `Consumo` con `id` y `createdAt` (validates AC-02, AC-04, AC-14).
- [ ] Integration, error: `crearConsumo` con `usuarioId` inexistente → `RepositoryError` con `operation: 'consumos.crear'` y `message` fijo.

**Completion criterion**
`pnpm test:unit` pasa sin red (el SDK siempre mockeado) y con 100 % de líneas en `modelo-vision.ts`;
`pnpm test:integration` pasa con la BD de test.

## Block 5 — Service de dominio

**Files**
- `src/features/consumos/domain/consumo-service.ts` (new) — `analizarImagen`, `guardarConsumo`.
- `src/features/consumos/domain/consumo-service.test.ts` (new) — `vi.mock` con factory de `../data/modelo-vision` y `../data/consumo-repository`.

**Logic**
Único archivo de `domain` que importa de `data/` (A6, nota de ADR-007).
- `analizarImagen(bytes: Uint8Array): Promise<EstimacionNutricional>` → `validarImagen` →
  `analizarConModeloVision` → `normalizarDesglose(crudo.desglose, crudo.calorias)` → estimación con
  `calorias` entero.
- `guardarConsumo(usuarioId: string, entrada: unknown): Promise<Consumo>` → `validarDatosConsumo` →
  `crearConsumo({ ...datos, usuarioId })`. `usuarioId` llega por parámetro (lo resuelve la capa ui
  desde la sesión) y nunca desde `entrada` (M-1).

**Input validation**
- Delegada en `validarImagen` y `validarDatosConsumo` (Block 3).

**Error handling**
- Propaga sin atrapar: `AnalisisImagenError` (de validación, del adaptador o de la normalización),
  `DatosConsumoInvalidosError` y `RepositoryError`. Decidir la respuesta es de la capa ui (ADR-004).

**Required tests**
- [ ] `analizarImagen` con JPEG válido llama al adaptador y devuelve el desglose normalizado a 100 (validates AC-05, AC-06, AC-07, AC-08).
- [ ] Error handling: `analizarImagen` con bytes PNG → `AnalisisImagenError('imagen-invalida')` sin llamar al adaptador.
- [ ] Error handling: el adaptador lanza `AnalisisImagenError('timeout')` → se propaga igual (validates AC-15).
- [ ] Error handling: el adaptador devuelve porcentajes todos en 0 con calorías > 0 → `AnalisisImagenError('respuesta-invalida')`.
- [ ] El adaptador devuelve 0 kcal y porcentajes todos en 0 → estimación con `otros: 100` (validates AC-08).
- [ ] `guardarConsumo('u-1', datos)` llama a `crearConsumo` con `usuarioId: 'u-1'` aunque `datos` traiga `usuarioId: 'otro'` (validates AC-14).
- [ ] `guardarConsumo` con `origen: 'camara'` y con `origen: 'galeria'` persiste ese origen (validates AC-02, AC-04).
- [ ] Error handling: datos que suman 99 → `DatosConsumoInvalidosError` sin llamar al repository.
- [ ] Error handling: el repository lanza `RepositoryError` → se propaga igual.

**Completion criterion**
`pnpm test:unit` pasa con 100 % de líneas y ramas en `consumo-service.ts`.

## Block 6 — Capa ui del servidor: sesión, registro y server actions

**Files**
- `src/features/consumos/ui/registro-consumo.ts` (new) — log de auditoría.
- `src/features/consumos/ui/registro-consumo.test.ts` (new)
- `src/features/consumos/ui/sesion-consumo.ts` (new) — `resolverUsuarioConsumo(token)`.
- `src/features/consumos/ui/sesion-consumo.test.ts` (new)
- `src/features/consumos/ui/operaciones-consumo.ts` (new) — lógica de las actions, sin `'use server'`.
- `src/features/consumos/ui/operaciones-consumo.test.ts` (new)
- `src/features/consumos/ui/actions.ts` (new) — `'use server'`, exactamente 2 exports.
- `src/features/consumos/ui/actions.test.ts` (new)

**Logic**
- `registrarEventoConsumo(evento)`: `event: 'consumo_analisis' | 'consumo_guardado' | 'consumo_sesion'`,
  `outcome: 'ok' | 'rechazado' | 'error'`, `reason?`, `operation?`. Una línea JSON; nivel info/warn/error
  según `outcome`; copia campo por campo (`event`, `outcome`, `reason`, `operation`, `timestamp`) y
  nunca la imagen, la respuesta del modelo, `usuarioId` ni `cause` (M-7). Mismo patrón que
  `registro-acceso-qa.ts`.
- `resolverUsuarioConsumo(token: string | undefined)`: llama a `resolverUsuarioDeSesion` y, con un
  `switch` exhaustivo sin `default`, devuelve `{ tipo: 'usuario'; usuarioId } | { tipo: 'sin-sesion' }
  | { tipo: 'error' }`; ante `error` registra `{ event: 'consumo_sesion', outcome: 'error', operation }`
  (contrato de ADR-007). Lo usan las actions y la página (A2).
- `operaciones-consumo.ts` recibe todo por parámetro (token de la cookie y la entrada), sin leer
  `next/headers` ni `env`:
  - `analizarFoto(token, formData: unknown): Promise<ResultadoAnalisis>` con `ResultadoAnalisis =
    { tipo: 'estimacion'; estimacion: EstimacionNutricional } | { tipo: 'sin-sesion' } | { tipo: 'error' }`.
  - `guardar(token, datos: unknown): Promise<ResultadoGuardado>` con `ResultadoGuardado =
    { tipo: 'guardado' } | { tipo: 'datos-invalidos' } | { tipo: 'sin-sesion' } | { tipo: 'error' }`.
  - Atrapan solo `AnalisisImagenError`, `DatosConsumoInvalidosError` y `RepositoryError` por
    `instanceof`, registran `reason`/`operation` y devuelven el resultado; cualquier otro error se
    relanza (ADR-005). Nunca devuelven mensajes técnicos al cliente (FR-10).
- `actions.ts` (`'use server'`): `analizarFotoConsumo(formData: unknown)` y
  `guardarNuevoConsumo(datos: unknown)`; leen `NOMBRE_COOKIE_SESION` de `cookies()` y delegan. **Únicos
  exports del archivo** (M-2), documentado en JSDoc como en `qa-access/ui/actions.ts`. No usan
  `redirect` (D1).

**API contract**
Server actions de Next (POST al endpoint de actions de la ruta, invocadas desde el cliente):
- `analizarFotoConsumo` — Request: `FormData` con el campo `imagen: Blob` (JPEG ≤ 950 000 bytes).
  Response: `ResultadoAnalisis`. Auth: cookie `nutrashot_session` válida; sin ella →
  `{ tipo: 'sin-sesion' }`. Errores: `{ tipo: 'error' }` (imagen inválida, sin key, timeout, fallo o
  respuesta inválida del modelo, error de sesión); cuerpo > 1 MB → Next rechaza antes de ejecutar
  (el cliente lo maneja, Block 7).
- `guardarNuevoConsumo` — Request: objeto `{ descripcion: string; calorias: number; desglose:
  { carbohidratos: number; proteinas: number; grasas: number; otros: number }; origen: 'camara' |
  'galeria' }`. Response: `ResultadoGuardado`. Auth: igual que la anterior; `usuarioId` solo de la
  sesión. Errores: `{ tipo: 'datos-invalidos' }` (validación), `{ tipo: 'error' }` (BD o sesión).

**Input validation**
- `formData`: debe ser `instanceof FormData`; `imagen` debe ser `instanceof Blob`; `size` ≤ 950 000 se
  verifica antes de leer los bytes; después se aplica `validarImagen` (Block 3).
- `datos`: `unknown`, validado por `validarDatosConsumo` (Block 3).
- Token: string de la cookie o `undefined`, validado por `resolverUsuarioDeSesion`.

**Error handling**
- Sin sesión o sesión expirada → `{ tipo: 'sin-sesion' }`, sin log de error.
- Error de datos al resolver la sesión → log `consumo_sesion`/`error` con `operation` → `{ tipo: 'error' }`.
- `formData` que no es `FormData`, sin `imagen`, `imagen` que no es `Blob` o demasiado grande → log
  `consumo_analisis`/`rechazado`/`reason: 'imagen-invalida'` → `{ tipo: 'error' }`.
- `AnalisisImagenError` → log `consumo_analisis`/`rechazado` (`imagen-invalida`) o `error` (resto) con
  `reason` → `{ tipo: 'error' }`.
- `DatosConsumoInvalidosError` → log `consumo_guardado`/`rechazado`/`reason: campo` → `{ tipo: 'datos-invalidos' }`.
- `RepositoryError` → log `consumo_guardado`/`error`/`operation` → `{ tipo: 'error' }`.
- Cualquier otro error → se relanza (no se traga).

**Required tests**
- [ ] `registro-consumo`: nivel según `outcome` y JSON con solo los 5 campos, aunque el evento traiga campos extra (validates AC-10 del lado de logs; NFR-04).
- [ ] `sesion-consumo`: `usuario` → `{ tipo: 'usuario', usuarioId }` (validates AC-14).
- [ ] Error handling: `sesion-consumo` con `sin-sesion` → `{ tipo: 'sin-sesion' }` sin log.
- [ ] Error handling: `sesion-consumo` con `error` → `{ tipo: 'error' }` y un log con `operation`, sin copiar otro dato.
- [ ] `analizarFoto` con sesión y JPEG válido → `{ tipo: 'estimacion' }` con la estimación del service (validates AC-05, AC-06, AC-07, AC-08).
- [ ] Error handling: `analizarFoto` sin sesión → `{ tipo: 'sin-sesion' }` y el service no se llama.
- [ ] Error handling: `analizarFoto` con `formData` no `FormData`, sin `imagen`, con `imagen` string o con `Blob` de 950 001 bytes → `{ tipo: 'error' }` y log `imagen-invalida`, sin llamar al service.
- [ ] Error handling: el service lanza `AnalisisImagenError('timeout')` y `('fallo')` → `{ tipo: 'error' }`, log `outcome: 'error'` con `reason` y sin detalles técnicos en el resultado (validates AC-15, AC-10).
- [ ] Error handling: el service lanza `AnalisisImagenError('imagen-invalida')` → `{ tipo: 'error' }` y log `outcome: 'rechazado'` (nivel warn).
- [ ] Error handling: resolución de sesión con `error` → `{ tipo: 'error' }`.
- [ ] `guardar` con sesión y datos válidos → `{ tipo: 'guardado' }` y el service recibe el `usuarioId` de la sesión (validates AC-02, AC-04, AC-14).
- [ ] Error handling: `guardar` con `DatosConsumoInvalidosError` → `{ tipo: 'datos-invalidos' }`.
- [ ] Error handling: `guardar` con `RepositoryError` → `{ tipo: 'error' }` y log con `operation`.
- [ ] Error handling: `guardar` sin sesión → `{ tipo: 'sin-sesion' }` sin llamar al service.
- [ ] Error handling: un `Error` genérico del service se relanza en ambas operaciones.
- [ ] `actions`: `Object.keys(await import('./actions'))` es exactamente `['analizarFotoConsumo', 'guardarNuevoConsumo']` (M-2).
- [ ] `actions`: leen la cookie `nutrashot_session` (`next/headers` mockeado) y delegan en `operaciones-consumo` con el token.

**Completion criterion**
`pnpm test:unit` pasa con 100 % de líneas en los 4 módulos; ningún archivo de `consumos/ui` importa
de `features/qa-access` (lo comprueba el guardián existente).

## Block 7 — Lógica del flujo en el cliente

**Files**
- `src/features/consumos/ui/flujo-nuevo-consumo.ts` (new) — reductor puro y tipos de estado/evento.
- `src/features/consumos/ui/flujo-nuevo-consumo.test.ts` (new)
- `src/features/consumos/ui/reducir-imagen.ts` (new) — cálculo puro de dimensiones y calidad.
- `src/features/consumos/ui/reducir-imagen.test.ts` (new)
- `src/features/consumos/ui/canvas-imagen.ts` (new) — `reencodearComoJpeg(file)` con canvas; sin test (ADR-008).
- `src/features/consumos/ui/procesar-imagen.ts` (new) — `procesarImagen` y `procesarGuardado`: traducen los resultados a eventos del flujo, con dependencias inyectadas.
- `src/features/consumos/ui/procesar-imagen.test.ts` (new)
- `vitest.config.ts` (modified) — `coverage.exclude` suma `src/features/consumos/ui/nuevo-consumo.tsx`, `src/features/consumos/ui/canvas-imagen.ts` y `src/css-modules.d.ts`, cada uno con su comentario (ADR-008).

**Logic**
- Estados: `inicio` · `procesando { solicitudId, origen }` · `revision { solicitudId, origen, borrador,
  aviso?: 'desglose-no-suma-100' | 'datos-invalidos' | 'error-al-guardar' }` · `guardando { solicitudId,
  origen, borrador }` · `guardado` · `error`. `borrador` guarda los campos editables como strings.
- Eventos: `imagen-elegida { origen, solicitudId }`, `analisis-ok { solicitudId, estimacion }`,
  `analisis-fallo { solicitudId }`, `tiempo-agotado { solicitudId }`, `campo-editado { campo, valor }`,
  `guardar { solicitudId }`, `guardado-ok { solicitudId }`, `guardado-fallo { solicitudId, tipo:
  'datos-invalidos' | 'error' }`, `sin-sesion`, `cancelar`, `reintentar`, `registrar-otro`.
- `cancelar` desde `inicio`, `procesando`, `revision` y `error` → `inicio`, sin datos (FR-13, AC-13).
  En `guardando` se ignora (mismo estado): el insert ya está en camino y "cancelar" mentiría; por eso
  esa pantalla no ofrece Cancelar. AC-13 no incluye el paso de guardado.
- `reintentar` solo en `error` → `inicio` (el usuario vuelve a sacar o elegir la foto; la foto anterior
  no se retiene). `registrar-otro` solo en `guardado` → `inicio`.
- `guardar` solo en `revision`; en `guardando` (doble clic) se ignora. Un evento con `solicitudId` distinto
  del vigente se ignora (A7, M-11). `tiempo-agotado` en `procesando` → `error` (NFR-02). `guardar` con
  un borrador cuyos porcentajes no suman 100 (usa `sumaDesglose`) → sigue en `revision` con
  `aviso: 'desglose-no-suma-100'` y no pasa a `guardando`.
- `datosDesdeBorrador(borrador, origen): unknown` convierte los strings a números; la validación real
  la hace el servidor.
- `calcularDimensiones(ancho, alto, maximo = 1280)`: escala proporcional para que el lado mayor sea ≤
  `maximo` (sin agrandar). `siguienteCalidad(bytes, calidad)`: si el blob supera 900 000 bytes baja la
  calidad en 0,1 (mínimo 0,5); si con 0,5 sigue grande → error.
- `ImagenNoProcesableError(reason: 'no-legible' | 'demasiado-grande')` vive en `reducir-imagen.ts`
  (puro, testeado).
- `canvas-imagen.ts`: `createImageBitmap(file)` → canvas → `toBlob('image/jpeg', calidad)`, usando las
  dos funciones puras. El reencodeo descarta EXIF (M-5). Si el navegador no decodifica la imagen
  (p. ej. HEIC) lanza `ImagenNoProcesableError('no-legible')`; si con calidad 0,5 sigue > 900 000
  bytes, `ImagenNoProcesableError('demasiado-grande')`.
- `procesarImagen({ archivo, solicitudId }, { reencodear, analizar }): Promise<EventoFlujo>`: reencodea,
  arma el `FormData` (`imagen`) y llama a la action inyectada. `{ tipo: 'estimacion' }` →
  `analisis-ok`; `{ tipo: 'sin-sesion' }` → `sin-sesion`; `{ tipo: 'error' }`, `reencodear` que lanza
  o `analizar` que rechaza (cuerpo > 1 MB, red) → `analisis-fallo` (A8). Nunca lanza.
- `procesarGuardado({ borrador, origen, solicitudId }, { guardar }): Promise<EventoFlujo>`:
  `guardado` → `guardado-ok`; `datos-invalidos` / `error` → `guardado-fallo` con ese tipo;
  `sin-sesion` → `sin-sesion`; `guardar` que rechaza → `guardado-fallo` `error`. Nunca lanza.
- El contenedor (Block 8) solo despacha lo que devuelven estas dos funciones y el evento del
  temporizador; no decide nada (ADR-008). `procesarGuardado` se ejecuta **solo en reacción a la
  transición a `guardando`** (efecto ligado a `estado.tipo === 'guardando'` y su `solicitudId`), nunca
  directamente en el clic de "Guardar": así un doble clic o un desglose que no suma 100 no llaman a la
  action (un solo insert por solicitud).

**Input validation**
- `campo-editado`: `campo` en `descripcion | calorias | carbohidratos | proteinas | grasas | otros`;
  `valor` string; la descripción se corta en la UI a `DESCRIPCION_MAX` (el servidor vuelve a validar).
- `calcularDimensiones`: ancho y alto enteros > 0; si no → lanza `RangeError`.

**Error handling**
- `analisis-fallo` o `tiempo-agotado` vigentes → `error` (FR-15).
- `guardado-fallo` `datos-invalidos` → `revision` con `aviso: 'datos-invalidos'`; `error` → `revision`
  con `aviso: 'error-al-guardar'`, conservando el borrador editado (no se pierde lo editado).
- `sin-sesion` → `inicio`; el contenedor además pide `router.refresh()` y la página redirige (Block 8).
- Evento no vigente o no válido para el estado actual → mismo estado (sin lanzar).
- `calcularDimensiones` con 0 o negativos → `RangeError`.
- La imagen sigue siendo > 900 000 bytes con calidad 0,5 → `siguienteCalidad` devuelve `null` y `canvas-imagen` lanza `ImagenNoProcesableError('demasiado-grande')`.
- `ImagenNoProcesableError` (ilegible o demasiado grande) o rechazo de la action (cuerpo > 1 MB, red) → `procesarImagen` devuelve `analisis-fallo` (A8).
- Rechazo de `guardar` (red) → `procesarGuardado` devuelve `guardado-fallo` `error`.

**Required tests**
- [ ] `imagen-elegida` con `origen: 'camara'` desde `inicio` → `procesando` con ese origen (validates AC-01, AC-09).
- [ ] `imagen-elegida` con `origen: 'galeria'` → `procesando` con ese origen (validates AC-03, AC-09).
- [ ] `analisis-ok` vigente → `revision` con el borrador precargado con descripción, calorías y los 4 porcentajes (validates AC-06, AC-07, AC-08, AC-11).
- [ ] `campo-editado` actualiza solo ese campo del borrador (validates AC-11).
- [ ] `guardar` con porcentajes que suman 100 → `guardando`; `guardado-ok` → `guardado` (validates AC-02, AC-04).
- [ ] Error handling: un segundo `guardar` en `guardando` devuelve el mismo estado (doble clic).
- [ ] `cancelar` desde `inicio`, `procesando`, `revision` y `error` → `inicio` (validates AC-13).
- [ ] `cancelar` en `guardando` devuelve el mismo estado.
- [ ] `reintentar` en `error` → `inicio` (validates AC-15).
- [ ] `registrar-otro` en `guardado` → `inicio`.
- [ ] Error handling: `analisis-fallo` vigente → `error` (validates AC-15).
- [ ] Error handling: `tiempo-agotado` vigente en `procesando` → `error` (validates AC-15).
- [ ] Error handling: `analisis-ok` con `solicitudId` viejo (después de `cancelar` o `tiempo-agotado`) se ignora.
- [ ] Error handling: `guardar` con porcentajes que suman 99 → `revision` con `aviso: 'desglose-no-suma-100'`.
- [ ] Error handling: `guardado-fallo` `datos-invalidos` → `revision` con `aviso: 'datos-invalidos'`; `error` → `revision` con `aviso: 'error-al-guardar'` y el mismo borrador.
- [ ] Error handling: `sin-sesion` → `inicio`.
- [ ] Error handling: eventos no válidos para el estado (`guardar` en `inicio`, `analisis-ok` en `revision`, `campo-editado` en `procesando`, `reintentar` en `revision`, `registrar-otro` en `inicio`) devuelven el mismo estado sin lanzar.
- [ ] `procesarImagen` con resultado `estimacion` → `analisis-ok` con el `solicitudId` y la estimación (validates AC-06).
- [ ] Error handling: `procesarImagen` con `reencodear` que lanza `ImagenNoProcesableError('no-legible')` y `('demasiado-grande')` → `analisis-fallo`, sin llamar a `analizar` (validates AC-15).
- [ ] Error handling: `procesarImagen` con `analizar` que rechaza (simula cuerpo > 1 MB) y con resultado `{ tipo: 'error' }` → `analisis-fallo` (validates AC-15).
- [ ] Error handling: `procesarImagen` con resultado `sin-sesion` → evento `sin-sesion`.
- [ ] `procesarImagen` arma un `FormData` con el campo `imagen` igual al blob reencodeado.
- [ ] `procesarGuardado`: `guardado` → `guardado-ok` (validates AC-02).
- [ ] Error handling: `procesarGuardado` con `datos-invalidos`, `error`, `sin-sesion` y con `guardar` que rechaza → el evento documentado para cada caso.
- [ ] `datosDesdeBorrador` convierte los strings a números y agrega el `origen`.
- [ ] `calcularDimensiones(4000, 3000)` → `1280 × 960`; `(800, 600)` → sin cambios; `(3000, 4000)` → `960 × 1280`.
- [ ] Error handling: `calcularDimensiones(0, 100)` → `RangeError`.
- [ ] `siguienteCalidad`: ≤ 900 000 → sin cambio; > 900 000 → baja 0,1; con 0,5 y grande → `null`.

**Completion criterion**
`pnpm test:unit` pasa con 100 % de líneas y ramas en `flujo-nuevo-consumo.ts`, `reducir-imagen.ts` y
`procesar-imagen.ts`;
`pnpm test:coverage` respeta los umbrales con las 3 exclusiones exactas.

## Block 8 — Pantallas, página `/consumos/nuevo` y link desde la home

**Files**
- `src/features/consumos/ui/pantallas-nuevo-consumo.tsx` (new) — componentes presentacionales por estado.
- `src/features/consumos/ui/pantallas-nuevo-consumo.test.tsx` (new) — `renderToStaticMarkup`.
- `src/features/consumos/ui/nuevo-consumo.tsx` (new) — `'use client'`, contenedor fino (ADR-008).
- `src/features/consumos/ui/nuevo-consumo.module.css` (new) — estilos mobile-first (NFR-03).
- `src/css-modules.d.ts` (new) — `declare module '*.module.css'` (ADR-008).
- `src/app/rutas.ts` (new) — `RUTA_LOGIN = '/dev-login'` (D1).
- `src/app/consumos/nuevo/page.tsx` (new) — server component, `dynamic = 'force-dynamic'`.
- `src/app/consumos/nuevo/page.test.tsx` (new)
- `src/app/page.tsx` (modified) — link "Registrar consumo" a `/consumos/nuevo`.
- `src/app/page.test.tsx` (modified)

**Logic**
- Pantallas (props en, JSX afuera, sin estado):
  - `PantallaInicio`: dos `<input type="file" accept="image/*">`, uno con `capture="environment"`
    ("Tomar foto") y otro sin `capture` ("Elegir de la galería"), más un link "Cancelar" a `/` que
    sale del flujo sin guardar nada (AC-13, paso "selección de imagen"). El sistema operativo gestiona
    el permiso de cámara; si se niega, el navegador ofrece el selector de archivos.
  - `PantallaProcesando`: indicador (`role="status"`, texto "Analizando tu foto…") y "Cancelar".
  - `PantallaRevision`: formulario editable (descripción, calorías, 4 porcentajes con las etiquetas
    "Carbohidratos", "Proteínas", "Grasas" y "Otros Nutrientes"), la línea "Esta información es una
    estimación y puede ser inexacta.", el aviso cuando corresponda ("Los porcentajes deben sumar 100.",
    "Revisá los datos: hay valores que no son válidos." o "No pudimos guardar. Probá de nuevo."),
    "Guardar" y "Cancelar".
  - `PantallaGuardando`: indicador (`role="status"`, texto "Guardando…") **sin** "Cancelar".
  - `PantallaError`: "No pudimos analizar la imagen. Probá de nuevo." + "Reintentar" + "Cancelar".
  - `PantallaGuardado`: "Consumo guardado" + "Registrar otro" (despacha `registrar-otro`).
  - "Reintentar" de `PantallaError` despacha `reintentar` (vuelve a elegir foto).
  Ninguna muestra endpoint, payload, nombre de modelo ni texto de errores (FR-10). Sin
  `dangerouslySetInnerHTML` (M-10).
- `nuevo-consumo.tsx`: `useReducer` con el reductor del Block 7, genera `solicitudId`
  (`crypto.randomUUID()`), llama a `procesarImagen`/`procesarGuardado` inyectando
  `reencodearComoJpeg` y las actions, programa el temporizador de 30 s **al despachar
  `imagen-elegida`** (cubre el reencodeo y la action; se limpia al salir de `procesando`) y despacha
  los eventos que devuelven; `procesarGuardado` corre en un efecto que reacciona a la transición a
  `guardando` (Block 7), no en el handler del clic; ante `sin-sesion` además hace `router.refresh()`. Solo importa del reductor, de
  `procesar-imagen.ts`, de las pantallas, de `canvas-imagen.ts`, de `actions.ts` y de
  `domain/rules.ts`/`types.ts` (guardián, Block 9).
- `page.tsx`: lee la cookie, `resolverUsuarioConsumo`; `sin-sesion` → `redirect(RUTA_LOGIN)`; `error` →
  "No se pudo verificar la sesión"; `usuario` → `<NuevoConsumo />`. Importa solo de
  `features/consumos/ui` (`sesion-consumo`, `nuevo-consumo`), `shared/sesion/ui/cookie-sesion` y
  `../../rutas`; nunca del service ni de `data/`.
- Home: agrega `<Link href="/consumos/nuevo">Registrar consumo</Link>` sin quitar el link de QA.

**Input validation**
- Inputs de archivo: `accept="image/*"`; el tipo real lo impone el reencodeo a JPEG y el servidor.
- Campos del formulario: descripción `maxLength={500}`; calorías y porcentajes `type="number"`,
  `inputMode="numeric"`, `min` y `max` (0..10000 y 0..100), `step="1"`; el servidor revalida.

**Error handling**
- `error` de sesión en la página → mensaje genérico, sin detalles.
- Sin sesión en la página → `redirect(RUTA_LOGIN)` (en producción termina en 404, D1).
- Errores del flujo → `PantallaError` con el mensaje fijo (FR-15).
- Desglose que no suma 100, datos inválidos o error al guardar → aviso visible en `PantallaRevision`,
  con el borrador intacto.

**Required tests**
- [ ] `PantallaInicio` renderiza un input con `capture="environment"` y otro sin `capture`, ambos `accept="image/*"` (validates AC-01, AC-03).
- [ ] `PantallaInicio` renderiza un link "Cancelar" con `href="/"` (validates AC-13).
- [ ] `PantallaProcesando` renderiza el indicador con `role="status"` y el botón "Cancelar" (validates AC-09, AC-13).
- [ ] `PantallaRevision` muestra la descripción, las calorías y los 4 porcentajes con sus etiquetas como campos editables (validates AC-06, AC-07, AC-08, AC-11).
- [ ] `PantallaRevision` incluye la línea "puede ser inexacta" (validates AC-12).
- [ ] `PantallaRevision` muestra el texto de cada uno de los 3 avisos cuando `aviso` está definido.
- [ ] `PantallaGuardando` muestra el indicador con `role="status"` y **no** tiene botón "Cancelar".
- [ ] `PantallaGuardado` muestra "Consumo guardado" y el botón "Registrar otro".
- [ ] Error handling: `PantallaError` muestra el mensaje fijo y los botones "Reintentar" y "Cancelar" (validates AC-15, AC-13).
- [ ] Ninguna pantalla contiene `gemini`, `generativelanguage`, `apiKey` ni `inlineData` en el HTML (validates AC-10).
- [ ] `page.test.tsx`: con sesión renderiza el contenedor `NuevoConsumo` (mock) (validates AC-14).
- [ ] Error handling: `page.test.tsx` sin sesión → `redirect` con `'/dev-login'` (mock que lanza centinela).
- [ ] Error handling: `page.test.tsx` con `error` de sesión → mensaje genérico, sin detalles.
- [ ] `src/app/page.test.tsx`: la home tiene un link a `/consumos/nuevo` y conserva el de QA.

**Completion criterion**
`pnpm test:unit`, `tsc --noEmit` (con `src/css-modules.d.ts` y sin `next-env.d.ts`) y `pnpm lint` pasan;
`pnpm build` compila la ruta `/consumos/nuevo`; los tests no afirman nombres de clase CSS (ADR-008) y se
confirma en este bloque cómo se comporta un `*.module.css` bajo Vitest 4.1.11 con `css.include: []`.

## Block 9 — Guardián de dependencias ampliado

**Files**
- `src/shared/reglas-de-dependencias.test.ts` (modified) — dos reglas nuevas con sus tests de funciones puras y del escaneo real.

**Logic**
Reglas nuevas (nota de ADR-007, D4, M-9):
1. Un archivo en `src/features/*/ui/**` o `src/app/**` no importa (ruta resuelta) nada dentro de
   `src/features/*/data` ni de `src/shared/db`.
2. Un archivo con directiva inicial `'use client'` no importa: rutas dentro de `*/data/`, archivos
   `*-service.ts`, `src/env.ts`, ni el especificador externo `@google/genai` (que `resolverEspecificador`
   devuelve como `null`, así que se compara el especificador crudo).
Reutiliza `extraerEspecificadores`, `resolverEspecificador` y el patrón de `tieneDirectivaUseServer`
(generalizado a `tieneDirectiva(contenido, nombre)` sin cambiar su comportamiento para `'use server'`).

**Error handling**
- Violación → el test falla con la lista `ruta → 'especificador'`, igual que las reglas existentes.
- Directiva mal detectada (comentarios antes, comillas dobles) → cubierta por los tests de `tieneDirectiva`.

**Required tests**
- [ ] Función pura, regla 1: un archivo ficticio de `src/features/consumos/ui` que importa `../data/x` y uno de `src/app` que importa `shared/db/client` → 2 violaciones; uno que importa `shared/sesion/ui` → 0.
- [ ] Función pura, regla 2: un `'use client'` que importa `@google/genai`, `../../../env`, `../domain/consumo-service` o `../data/x` → 4 violaciones; uno que importa `./flujo-nuevo-consumo` o `../domain/rules` → 0.
- [ ] Error handling: `tieneDirectiva` detecta `'use client'` con comentarios previos y con comillas dobles, y no lo detecta dentro de un string posterior.
- [ ] Escaneo real de `src/`: 0 violaciones de las reglas nuevas.
- [ ] Los tests existentes del guardián pasan sin cambiar sus aserciones.

**Completion criterion**
`pnpm test:unit` pasa con el guardián ampliado y el escaneo real de `src/` en 0 violaciones.

## Rollback

La migración `0001_consumos` es aditiva. Para revertir el ticket: revertir los commits de la rama y,
en una BD que ya la aplicó, `DROP TABLE consumos` a mano, solo con la aprobación del usuario porque
borra datos. Hasta tener usuarios reales, la tabla solo contiene consumos de prueba del usuario de QA.
Indicadores para aplicarlo: la migración falla en un entorno, o el flujo guarda datos incorrectos.

## Final verification

- `pnpm install --frozen-lockfile`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm exec prettier --check .`
  y `pnpm test:unit` pasan; `pnpm test:integration` pasa con la BD de test migrada; `pnpm test:coverage`
  respeta 80/80/80.
- `pnpm build` compila.
- Ningún test llama a la API de Google (el SDK está mockeado en todos los tests que lo alcanzan).
- `git diff main --stat` no toca `config/` ni `src/features/qa-access/**`.
- Manual, en VERIFY, con la `GEMINI_API_KEY` cargada por el usuario: confirmar que el ID
  `gemini-3.1-flash-lite` responde; recorrer cámara (móvil) y galería; medir 10 análisis (NFR-01, p95 <
  10 s); verificar el layout en los extremos del PRD, 426×240 (240p) y 3840×2160 (4K), y en 360×640 como
móvil típico (NFR-03); probar la descripción con el ejemplo del
  PRD (pollo, arroz y vino, AC-06, revisión manual).
