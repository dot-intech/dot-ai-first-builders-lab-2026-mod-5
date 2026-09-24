# Spec FEAT-001a: Acceso directo de QA sin magic link

| Field | Value |
|-------|-------|
| Ticket | FEAT-001a |
| PRD | docs/daw/prd/prd-FEAT-001a.md |
| Tier | FEATURE |
| Date | 2026-09-18 |
| Spec loops | 0 |

## Summary

Este es el primer código del repositorio: además del mecanismo de acceso QA, este spec bootstrapea
el proyecto Next.js 15 base. Se implementa un mecanismo de acceso directo (sin magic link) para un
único email de QA configurado por variable de entorno, deshabilitado incondicionalmente en
producción. La sesión se modela en PostgreSQL con una ventana deslizante de 24h de inactividad; el
token de sesión viaja como cookie `httpOnly` y se persiste hasheado (nunca en texto plano). El
diseño sigue la convención de `AGENTS.md`: `src/features/qa-access/{ui,domain,data}`, con la UI
hablando siempre a través de un service, nunca directo a la BD.

**Justificación de la dependencia nueva — Drizzle ORM (`drizzle-orm` + `drizzle-kit`):** AGENTS.md
declara `Database | PostgreSQL` pero no fija un ORM/query builder. Se eligió Drizzle sobre las
alternativas por:
- Tipado end-to-end sin un paso de generación de cliente separado (a diferencia de Prisma, cuyo
  `prisma generate` es un paso de build adicional).
- Query builder SQL-like, compatible con el modo `strict` de TypeScript y la regla "No `any`" de
  AGENTS.md — el compilador infiere los tipos de cada tabla directamente del schema.
- Migraciones como SQL plano generado por `drizzle-kit` (diffs auditables en el repo), en vez de un
  formato binario o propietario.
- Footprint de runtime chico y buena compatibilidad con el App Router de Next.js 15.
- Alternativa descartada: `pg` crudo + SQL a mano — se descartó por falta de type-safety
  automático y más código repetitivo (decisión tomada explícitamente con el usuario en PLAN).

**Estrategia de BD compartida (señalada por `daw-arch-auditor`, decidida con el usuario en PLAN):**
el cliente de Drizzle y el schema se crean directamente en `src/shared/db/{client,schema}.ts`, no
dentro de `features/qa-access`, porque FEAT-001b va a necesitar el mismo cliente y va a agregar su
propia tabla (`consumos`) al mismo schema. Los repositories de `qa-access` (Block 4) importan desde
ahí; ningún futuro ticket tiene que refactorizar la ubicación del cliente o del schema.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 6 |
| FR-02 | Block 4, Block 6 |
| FR-03 | Block 3, Block 6 |
| FR-04 | Block 5, Block 6 |
| NFR-01 | Strategy: Block 3 (regla pura `sesionExpiradaPorInactividad`) + Block 5 (`session-service` actualiza `last_activity_at` en cada lectura válida) |
| NFR-02 | Strategy: Block 6 (`ui/actions.ts` setea la cookie con `httpOnly` + `sameSite=lax`) |
| AC-01 | Block 6 |
| AC-02 | Block 4, Block 6 |
| AC-03 | Block 3, Block 6 |
| AC-04 | Block 6 |
| AC-05 | Block 5 |
| AC-06 | Block 5 |

## Dependencies between blocks

1 → 2, 3, 4, 5, 6 (todo depende del bootstrap)
2 → 4 (el schema debe existir antes que los repositories)
3 → 5, 6 (reglas y errores tipados antes del service y la action)
4 → 5 (repositories antes del service, que los orquesta)
5 → 6 (service antes de la action/UI que lo consume)

Orden de ejecución: 1 → 2 → 3 → 4 → 5 → 6.

## Block 1 — Bootstrap del proyecto

**Files**
- `package.json` (new) — scripts (`dev`, `build`, `test`, `lint`), dependencias: `next@15`,
  `react`, `react-dom`, `drizzle-orm`, `drizzle-kit`, `pg`, `typescript`, `vitest`,
  `eslint`, `prettier`.
- `tsconfig.json` (new) — `strict: true`.
- `next.config.ts` (new).
- `eslint.config.mjs` (new).
- `.prettierrc` (new).
- `vitest.config.ts` (new).
- `.env.example` (new) — `DATABASE_URL`, `QA_ACCESS_EMAIL` (documentados, sin valores reales).
- `drizzle.config.ts` (new).
- `src/env.ts` (new) — lectura y validación tipada de variables de entorno.
- `.gitignore` (modified) — agrega `node_modules/`, `.next/`, `.env`, `.env*.local`, `coverage/`.

**Logic**

`src/env.ts` centraliza la lectura de env vars: exporta un objeto `env` tipado
(`{ nodeEnv: string; databaseUrl: string; qaAccessEmail: string | undefined }`), leyendo
`process.env.NODE_ENV`, `process.env.DATABASE_URL`, `process.env.QA_ACCESS_EMAIL` una sola vez. La
variable del email de QA se nombra explícitamente `QA_ACCESS_EMAIL` (sin prefijo `NEXT_PUBLIC_`,
para que Next.js nunca la incluya en el bundle del cliente — mitigación del threat model).

**Error handling**
- Si `DATABASE_URL` no está definida al arrancar → lanza `EnvValidationError` (tipado, en
  `src/env.ts`) con un mensaje que indica la variable faltante. Nunca un `catch` silencioso.
- `QA_ACCESS_EMAIL` es opcional a nivel de tipos (si no está configurada, el backdoor
  simplemente nunca matchea ningún email — comportamiento cubierto en Block 6).

**Required tests**
- [ ] `env.test.ts` — "debe lanzar EnvValidationError si DATABASE_URL no está definida" (test
      first: falla porque `env.ts` no existe, luego pasa).
- [ ] `env.test.ts` — "debe devolver `qaAccessEmail` como `undefined` si la variable no está seteada".
- [ ] `env.test.ts` — "debe exponer `nodeEnv` tal cual viene de `process.env.NODE_ENV`".

**Completion criterion**
`pnpm install && pnpm test` corre sin errores de configuración; los 3 tests de `env.test.ts` pasan;
`pnpm lint` y `pnpm exec tsc --noEmit` no reportan errores.

## Block 2 — Esquema de BD (Drizzle)

**Files**
- `src/shared/db/schema.ts` (new) — tablas `usuarios` y `sesiones`. Ubicación compartida a
  propósito: FEAT-001b agrega `consumos` a este mismo archivo/schema, sin refactor.
- `drizzle/migrations/0000_init.sql` (new, generado por `drizzle-kit generate`).

**Data model**

- **`usuarios`**
  - `id`: `uuid`, PK, default `gen_random_uuid()`.
  - `email`: `text`, NOT NULL, UNIQUE.
  - `created_at`: `timestamptz`, NOT NULL, default `now()`.
- **`sesiones`**
  - `id`: `uuid`, PK, default `gen_random_uuid()`.
  - `usuario_id`: `uuid`, NOT NULL, FK → `usuarios.id`, `ON DELETE CASCADE`.
  - `token_hash`: `text`, NOT NULL, UNIQUE — hash SHA-256 del token de sesión (nunca el valor
    crudo, ver threat model).
  - `last_activity_at`: `timestamptz`, NOT NULL, default `now()`.
  - `created_at`: `timestamptz`, NOT NULL, default `now()`.
  - Índice explícito sobre `usuario_id` (además del índice único implícito de `token_hash`).

**Error handling**
- Violación de la constraint UNIQUE en `usuarios.email` o `sesiones.token_hash` → PostgreSQL
  rechaza el INSERT (error de BD, no envuelto en este bloque — Block 4 es quien lo traduce a un
  error de dominio).

**Required tests** *(co-ubicado: `src/shared/db/schema.integration.test.ts` — sigue al schema en
su nueva ubicación compartida)*
- [ ] `schema.integration.test.ts` — "insertar dos usuarios con el mismo email debe fallar por la
      constraint UNIQUE" (test first: falla porque la tabla no existe, luego pasa tras migrar).
- [ ] `schema.integration.test.ts` — "insertar dos sesiones con el mismo token_hash debe fallar por
      la constraint UNIQUE".
- [ ] `schema.integration.test.ts` — "eliminar un usuario debe eliminar en cascada sus sesiones".

**Completion criterion**
`drizzle-kit generate` produce la migración inicial; aplicada contra una BD de test, los 3 tests de
`schema.integration.test.ts` pasan (cada test crea y limpia sus propios datos, per Rule #0 de
`testing.instructions.md`).

## Block 3 — Dominio: reglas y errores tipados

**Files**
- `src/features/qa-access/domain/types.ts` (new) — tipos `Usuario`, `Sesion`.
- `src/features/qa-access/domain/rules.ts` (new) — funciones puras.
- `src/features/qa-access/domain/errors.ts` (new) — `QaAccessDeniedError`, `SessionExpiredError`,
  `SessionNotFoundError`, `RepositoryError` (movida acá desde `data/errors.ts`, ver Block 4 —
  ADR-005: `ui/` necesita reconocer el error sin importar de `data`).

**Logic**

`rules.ts` exporta funciones puras, sin I/O (corrección pedida por `daw-arch-auditor`: no leen
`process.env` internamente, reciben todo por parámetro):
- `esEntornoPermitidoParaAccesoQa(nodeEnv: string): boolean` — `true` solo si `nodeEnv` está en una
  allowlist explícita de entornos permitidos (`development`, `test`, `staging`); cualquier otro
  valor — incluida una `NODE_ENV` de producción, vacía o desconocida — es fail-closed. Reemplaza el
  diseño original por denylist (`nodeEnv !== 'production'`), corregido durante CODE (ADR-001).
- `emailCoincideConQa(email: string, qaAccessEmail: string | undefined): boolean`.
- `sesionExpiradaPorInactividad(lastActivityAt: Date, now: Date): boolean` — `true` si
  `now - lastActivityAt > 24h`.

`errors.ts` define las tres clases de error tipadas que van a lanzar `session-service.ts` y
`ui/actions.ts` (Block 5 y 6) — ninguna captura genérica en esos bloques.

**Error handling**
- Este bloque no maneja errores en runtime (son funciones puras) — define las clases de error que
  los bloques siguientes usan.

**Required tests**
- [ ] `rules.test.ts` — "esEntornoPermitidoParaAccesoQa debe devolver true para 'development',
      'test' y 'staging'" (test first).
- [ ] `rules.test.ts` — "esEntornoPermitidoParaAccesoQa debe devolver false para 'production' y
      cualquier valor fuera de la lista de permitidos (comparación exacta)".
- [ ] `rules.test.ts` — "sesionExpiradaPorInactividad debe devolver false a las 23h59m de
      inactividad y true a las 24h01m" (casos límite).
- [ ] `rules.test.ts` — "emailCoincideConQa debe devolver false si qaAccessEmail es undefined".

**Completion criterion**
Los 4 tests de `rules.test.ts` pasan; `rules.ts` no importa `process` en ningún lado (verificable
por grep en CODE).

## Block 4 — Datos: cliente Drizzle y repositories

**Files**
- `src/shared/db/client.ts` (new) — cliente Drizzle sobre `pg`, usa `env.databaseUrl`. El `sslmode`
  lo decide la propia `DATABASE_URL`; el código no lo fuerza (corregido durante CODE — ver SAST I-3
  y threat model F-TM-07, asunción documentada de despliegue). Ubicación compartida (ver nota de
  estrategia de BD en el Summary): FEAT-001b reusa este mismo cliente en vez de crear otro pool de
  conexión.
- `src/features/qa-access/data/usuario-repository.ts` (new) — `findByEmail`,
  `findOrCreateByEmail`, `findById`. Importa la tabla `usuarios` desde `src/shared/db/schema.ts`, el
  cliente desde `src/shared/db/client.ts` y `normalizarEmail`/`Usuario` desde `domain/rules` y
  `domain/types` (dirección de dependencia intencional, ver Completion criterion más abajo).
- `src/features/qa-access/data/sesion-repository.ts` (new) — `create`, `findByTokenHash`,
  `touchLastActivity`. Importa la tabla `sesiones` desde `src/shared/db/schema.ts` y `Sesion` desde
  `domain/types`.
- `src/features/qa-access/data/errors.ts` (new) — `conRepositoryError` (helper que ejecuta una
  consulta y traduce cualquier fallo a `RepositoryError`). La clase `RepositoryError` en sí vive en
  `domain/errors.ts` (Block 3), no acá — corregido durante CODE (ADR-005).

**Logic**

`findOrCreateByEmail` usa `INSERT ... ON CONFLICT (email) DO NOTHING` seguido de `SELECT`, para que
la creación sea idempotente ante llamadas concurrentes sin que la constraint UNIQUE de Block 2
burbujee como excepción no manejada.

**Error handling**
- Cualquier error de conexión o de query se envuelve en un `RepositoryError` tipado (definido en
  `domain/errors.ts`, Block 3; este bloque solo aporta el helper `conRepositoryError` en
  `data/errors.ts` que lo lanza) antes de propagarse — nunca se deja pasar el error crudo de `pg`
  hacia domain. Corregido durante CODE (ADR-005): la clase se movió de `data` a `domain` para que
  `ui/` pudiera reconocerla sin importar de `data`.

**Required tests**
- [ ] `usuario-repository.integration.test.ts` — "findOrCreateByEmail crea el usuario la primera
      vez y lo reutiliza la segunda" (test first, contra BD de test; crea y limpia sus propios
      datos).
- [ ] `sesion-repository.integration.test.ts` — "create + findByTokenHash devuelve la sesión
      creada".
- [ ] `sesion-repository.integration.test.ts` — "findByTokenHash con un hash inexistente devuelve
      null (no lanza)".
- [ ] `sesion-repository.integration.test.ts` — "touchLastActivity actualiza `last_activity_at`".
- [ ] `usuario-repository.integration.test.ts` — "ante un error de conexión/query de `pg`, lanza
      `RepositoryError` en vez de propagar el error crudo" (simulado con un cliente `pg` mockeado
      que rechaza la query) — valida el error documentado arriba.

**Completion criterion**
Los 5 tests pasan contra la BD de test; ningún repository importa `domain/session-service.ts` — esa
dirección (domain orquesta a data, nunca al revés) es la que no se cruza. Los repositories sí
importan `domain/rules` (`normalizarEmail`) y `domain/types` (los tipos `Usuario`/`Sesion`), y
`domain/errors` (`RepositoryError`): es la dirección de dependencia intencional del diseño, corregida
durante CODE frente a la redacción original de este bloque (ADR-004, ADR-005).

## Block 5 — Servicio de sesión

**Files**
- `src/features/qa-access/domain/session-service.ts` (new) — `crearSesion`, `iniciarSesionQa`,
  `getSession`. `iniciarSesionQa` se agregó durante CODE (ADR-004): no estaba en el diseño original
  de este bloque.

**Logic**

- `crearSesion(usuarioId, now = new Date())`: genera un token con `crypto.randomBytes(32)`, calcula
  su hash SHA-256, llama a `sesionRepository.create` con el hash y `now` (reloj de la app, no el
  default de la BD), devuelve el **token crudo** (para que Block 6 lo ponga en la cookie — el crudo
  nunca se persiste). El parámetro `now` se agregó durante CODE para que `last_activity_at` y
  `created_at` los fije la app, no la BD.
- `iniciarSesionQa(email)`: crea o reutiliza el usuario (`usuarioRepository.findOrCreateByEmail`) y
  le abre una sesión con `crearSesion`. Orquesta lo que Block 6 llamaba directamente a los
  repositories — agregado durante CODE (ADR-004) para que la única pieza de `domain` que importa de
  `data` sea este service, no `ui/`.
- `getSession(tokenCrudo, now = new Date())`: hashea el token recibido, busca por `token_hash` vía
  `sesionRepository.findByTokenHash`. Si no existe → lanza `SessionNotFoundError`. Si
  `sesionExpiradaPorInactividad(sesion.lastActivityAt, now)` → lanza `SessionExpiredError`. Si es
  válida → llama a `sesionRepository.touchLastActivity` (ventana deslizante, NFR-01) y busca al
  usuario con `usuarioRepository.findById`; si no existe → `SessionNotFoundError`. Devuelve el
  `Usuario` asociado (no solo valida: es el caller real del service dentro del alcance de este
  ticket, gap señalado por `daw-impact-scanner` en PLAN de FEAT-001a).

**Input validation**
- `tokenCrudo` llega desde la cookie del cliente — input no confiable. Se trata como string
  opaco: si está vacío o ausente → `SessionNotFoundError` inmediata, sin llegar a hashear ni
  consultar la BD. Se rechaza (misma excepción) cualquier valor de más de 128 caracteres, como
  defensa adicional para no hashear strings arbitrariamente largos provistos por un atacante.

**Error handling**
- `SessionNotFoundError` y `SessionExpiredError` (de Block 3) se lanzan explícitamente — el caller
  (Block 6 / la página `/dev-login`) decide cómo mostrarlas, nunca se capturan aquí.

**Required tests**
- [ ] `session-service.test.ts` — "crearSesion devuelve un token de 256 bits y persiste solo su
      hash" (mockeando `sesionRepository`, per "mock the I/O layer").
- [ ] `session-service.test.ts` — "getSession con un token válido y actividad reciente devuelve el
      usuario y actualiza last_activity_at" — valida AC-05.
- [ ] `session-service.test.ts` — "getSession con más de 24h de inactividad lanza
      SessionExpiredError" — valida AC-06 (sad path).
- [ ] `session-service.test.ts` — "getSession con un token que no matchea ninguna fila lanza
      SessionNotFoundError" — sad path.
- [ ] `session-service.test.ts` — "getSession con token vacío o de más de 128 caracteres lanza
      SessionNotFoundError sin llamar al repository" — valida la sección de Input validation.

**Completion criterion**
Los 4 tests pasan; `session-service.ts` es la única pieza de `domain` que importa algo de `data`
(regla de capas de AGENTS.md).

## Block 6 — Backdoor (server action) + UI mínima

**Files**
- `src/features/qa-access/ui/actions.ts` (new) — server action `qaBackdoorLogin` (`'use server'`,
  único export del archivo a propósito).
- `src/features/qa-access/ui/acceso-qa.ts` (new) — `autenticarAccesoQa({nodeEnv, qaAccessEmail})`,
  sin `'use server'`: valida entorno/email y llama a `iniciarSesionQa`. Agregado durante CODE
  (ADR-004) para separar la validación parametrizada del server action.
- `src/features/qa-access/ui/cookie-sesion.ts` (new) — `NOMBRE_COOKIE_SESION`,
  `opcionesCookieSesion(nodeEnv)` (usa `cookieSesionEsSecure`). Agregado durante CODE.
- `src/features/qa-access/ui/estado-sesion.ts` (new) — `resolverEstadoSesion(tokenCookie)`, usado
  por la página para traducir el resultado de `getSession` a un estado de UI. Agregado durante CODE.
- `src/features/qa-access/ui/registro-acceso-qa.ts` (new) — `registrarEventoAccesoQa(evento)`, log
  de auditoría JSON por evento (nivel según resultado: granted→info, denied→warn, error→error;
  copia los campos uno a uno, nunca vuelca el evento entero). Agregado durante CODE.
- `src/features/qa-access/ui/qa-login-button.tsx` (new) — client component `QaLoginButton`.
- `src/app/dev-login/page.tsx` (new) — server component.
- `src/app/layout.tsx` (new) — layout raíz mínimo.
- `src/app/page.tsx` (new) — placeholder de home (redirige o enlaza a `/dev-login` mientras no
  exista el tablero real).

**API contract** *(server action, no hay un endpoint REST clásico)*
- **Invocación:** `qaBackdoorLogin()` — Server Action de Next.js, sin parámetros (por diseño: el
  email nunca viaja desde el cliente, mitigación del threat model). Se invoca desde el `action` de
  un `<form>` que envuelve `QaLoginButton`.
- **Respuesta:** en éxito, setea la cookie de sesión (`httpOnly`, `sameSite=lax`, `secure` según
  `cookieSesionEsSecure(nodeEnv)` — corregido durante CODE, ADR-002 — aunque en producción la
  request nunca llega a este punto porque `esEntornoPermitidoParaAccesoQa` la corta antes) y
  redirige a `/dev-login`. En error, redirige a `/dev-login?error=1` (mensaje genérico, sin detalle
  interno).
- **Auth:** ninguna — este server action ES el mecanismo de autenticación.

**Logic**

`qaBackdoorLogin`:
1. Llama a `autenticarAccesoQa({nodeEnv: env.nodeEnv, qaAccessEmail: env.qaAccessEmail})`
   (`ui/acceso-qa.ts`) — los únicos puntos donde se lee `process.env` siguen siendo Block 1/3, esta
   función solo recibe los valores por parámetro. Corregido durante CODE (ADR-004): la validación y
   la orquestación se separaron del server action.
2. `autenticarAccesoQa` valida `esEntornoPermitidoParaAccesoQa(nodeEnv)` y el email de QA; si
   cualquiera falla, lanza `QaAccessDeniedError` (capturado por `qaBackdoorLogin`, que redirige con
   error genérico) — nunca continúa.
3. Si pasa la validación, `autenticarAccesoQa` llama a `sessionService.iniciarSesionQa(email)`, que
   crea o reutiliza el usuario y abre la sesión — devuelve el token crudo.
4. `qaBackdoorLogin` setea la cookie con `opcionesCookieSesion(env.nodeEnv)` (`ui/cookie-sesion.ts`).
5. Loguea vía `registrarEventoAccesoQa` (`ui/registro-acceso-qa.ts`, sin exponer el token) el
   resultado: `{ event: 'qa_backdoor_login', outcome: 'granted' | 'denied' | 'error', reason?,
   operation?, timestamp }`.

**Aclaración de capas (pedida por `daw-arch-auditor`, corregida durante CODE — ADR-004):**
`ui/actions.ts` llama a `ui/acceso-qa.ts` para la validación (que a su vez llama a `domain/rules.ts`,
sin efectos secundarios). La única llamada de este bloque hacia `data/*` es a través de
`domain/session-service.ts` (`iniciarSesionQa` → `crearSesion`) — la UI nunca construye ni ejecuta
una query por sí misma ni importa de `data/` directamente.

`src/app/dev-login/page.tsx` (server component):
- Chequea `esEntornoPermitidoParaAccesoQa(env.nodeEnv)` **de nuevo, en la página** (defensa en
  profundidad — segunda capa independiente del action). Si no está permitido → `notFound()` (no
  renderiza nada, ni el botón ni pistas de que el mecanismo existe).
- Si está permitido: llama a `resolverEstadoSesion(tokenCookie)` (`ui/estado-sesion.ts`, agregado
  durante CODE), que a su vez llama a `getSession()` — el caller real del `session-service` dentro
  del alcance de este ticket, gap señalado por `daw-impact-scanner`.
  - Si hay sesión válida → muestra "Conectado como {email}".
  - Si no hay sesión (o expiró, o hubo un `RepositoryError`) → muestra `QaLoginButton` dentro de un
    `<form action={...}>`, o un mensaje de error genérico si fue un `RepositoryError`.

**Error handling**
- `QaAccessDeniedError` → capturado en `qaBackdoorLogin`, redirige a `/dev-login?error=1` con
  mensaje genérico ("No se pudo iniciar sesión"). Nunca expone si la causa fue producción vs. env
  var faltante.
- `RepositoryError` → capturado también en `qaBackdoorLogin` (agregado durante CODE), mismo
  redirect genérico; nunca se propaga el `cause` (puede traer SQL con emails/`token_hash`).
- `SessionExpiredError` / `SessionNotFoundError` (al llamar `getSession()` desde
  `resolverEstadoSesion`) → tratadas como "no hay sesión" (se muestra el botón de login).
- `RepositoryError` (al llamar `getSession()` desde `resolverEstadoSesion`) → agregado durante CODE:
  se loguea solo por `operation` y la página muestra "No se pudo verificar la sesión", sin redirigir
  a ningún lado que no exista todavía.

**Nota sobre tests de componentes (agregado durante CODE — ADR-006):** los tests de
`qa-login-button.tsx` y `dev-login/page.tsx` usan `renderToStaticMarkup` (de `react-dom/server`) en
vez de una librería de testing de componentes nueva, para no introducir una dependencia no
justificada en el spec original.

**Required tests**
- [ ] `actions.integration.test.ts` — "qaBackdoorLogin con NODE_ENV=development y
      QA_ACCESS_EMAIL configurado crea usuario, crea sesión y setea la cookie con httpOnly +
      sameSite=lax" — valida AC-01, AC-02, AC-04, NFR-02.
- [ ] `actions.integration.test.ts` — "qaBackdoorLogin con NODE_ENV=production lanza
      QaAccessDeniedError incondicionalmente, incluso con QA_ACCESS_EMAIL configurado" — valida
      AC-03 (sad path, test de seguridad dedicado para NFR-06 de la PRD).
- [ ] `actions.integration.test.ts` — "qaBackdoorLogin sin QA_ACCESS_EMAIL configurado lanza
      QaAccessDeniedError" — sad path.
- [ ] `dev-login-page.test.tsx` — "en producción, la página responde 404 y no renderiza el botón"
      (defensa en profundidad).
- [ ] `dev-login-page.test.tsx` — "con una sesión válida en la cookie, la página muestra el email
      del usuario conectado en vez del botón".
- [ ] `dev-login-page.test.tsx` — "sin cookie de sesión, o con una expirada (SessionNotFoundError /
      SessionExpiredError), la página muestra el botón de login en vez del estado conectado" —
      valida el manejo de errores documentado arriba.

**Completion criterion**
Los 6 tests de este bloque pasan; `pnpm dev` levanta la app, `/dev-login` en `NODE_ENV=development`
muestra el botón, y tras usarlo la página muestra "Conectado como {email}"; con
`NODE_ENV=production` la ruta responde 404.

## Final verification

- `pnpm test` (todos los bloques) pasa con cobertura ≥ 80% líneas/branches/funciones sobre el
  código nuevo (mínimo de `.daw/rules/testing.instructions.md`).
- `pnpm lint` y `pnpm exec tsc --noEmit` sin errores.
- Cada AC de `docs/daw/prd/prd-FEAT-001a.md` (AC-01 a AC-06) tiene al menos un test que lo valida
  (trazabilidad completa, ver tabla de Coverage arriba).
- El backdoor rechaza incondicionalmente en `NODE_ENV=production`, verificado por un test
  específico (no solo por inspección manual).
- Ningún archivo nuevo loguea el token de sesión ni el email de QA en texto plano fuera de lo
  estrictamente necesario para el log de auditoría descrito en Block 6.

> **Nota 2026-09-24 (FEAT-002):** después de mergeado este ticket, la sesión (servicio, repositorios,
> cookie, errores y reglas de sesión) y `RepositoryError` se movieron de `src/features/qa-access/` a
> `src/shared/`, sin cambio de comportamiento. Las rutas de esta spec reflejan el estado de FEAT-001a.
> Ubicaciones actuales y matriz de dependencias: ADR-007 y `docs/daw/specs/spec-FEAT-002.md`.
