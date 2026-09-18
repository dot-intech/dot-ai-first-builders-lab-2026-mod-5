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
  `SessionNotFoundError`.

**Logic**

`rules.ts` exporta funciones puras, sin I/O (corrección pedida por `daw-arch-auditor`: no leen
`process.env` internamente, reciben todo por parámetro):
- `esEntornoNoProductivo(nodeEnv: string): boolean` — `true` si `nodeEnv !== 'production'`.
- `emailCoincideConQa(email: string, qaAccessEmail: string | undefined): boolean`.
- `sesionExpiradaPorInactividad(lastActivityAt: Date, now: Date): boolean` — `true` si
  `now - lastActivityAt > 24h`.

`errors.ts` define las tres clases de error tipadas que van a lanzar `session-service.ts` y
`ui/actions.ts` (Block 5 y 6) — ninguna captura genérica en esos bloques.

**Error handling**
- Este bloque no maneja errores en runtime (son funciones puras) — define las clases de error que
  los bloques siguientes usan.

**Required tests**
- [ ] `rules.test.ts` — "esEntornoNoProductivo debe devolver false para 'production'" (test first).
- [ ] `rules.test.ts` — "esEntornoNoProductivo debe devolver true para 'development' y 'test'".
- [ ] `rules.test.ts` — "sesionExpiradaPorInactividad debe devolver false a las 23h59m de
      inactividad y true a las 24h01m" (casos límite).
- [ ] `rules.test.ts` — "emailCoincideConQa debe devolver false si qaAccessEmail es undefined".

**Completion criterion**
Los 4 tests de `rules.test.ts` pasan; `rules.ts` no importa `process` en ningún lado (verificable
por grep en CODE).

## Block 4 — Datos: cliente Drizzle y repositories

**Files**
- `src/shared/db/client.ts` (new) — cliente Drizzle sobre `pg`, usa `env.databaseUrl` con
  `sslmode=require`. Ubicación compartida (ver nota de estrategia de BD en el Summary): FEAT-001b
  reusa este mismo cliente en vez de crear otro pool de conexión.
- `src/features/qa-access/data/usuario-repository.ts` (new) — `findByEmail`,
  `findOrCreateByEmail`. Importa la tabla `usuarios` desde `src/shared/db/schema.ts` y el cliente
  desde `src/shared/db/client.ts`.
- `src/features/qa-access/data/sesion-repository.ts` (new) — `create`, `findByTokenHash`,
  `touchLastActivity`. Importa la tabla `sesiones` desde `src/shared/db/schema.ts`.
- `src/features/qa-access/data/errors.ts` (new) — `RepositoryError`.

**Logic**

`findOrCreateByEmail` usa `INSERT ... ON CONFLICT (email) DO NOTHING` seguido de `SELECT`, para que
la creación sea idempotente ante llamadas concurrentes sin que la constraint UNIQUE de Block 2
burbujee como excepción no manejada.

**Error handling**
- Cualquier error de conexión o de query se envuelve en un `RepositoryError` tipado (nuevo en este
  bloque, en `data/errors.ts`) antes de propagarse — nunca se deja pasar el error crudo de `pg`
  hacia domain.

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
Los 5 tests pasan contra la BD de test; ningún repository importa `domain/session-service.ts`
(dirección de dependencia correcta: data no depende de domain).

## Block 5 — Servicio de sesión

**Files**
- `src/features/qa-access/domain/session-service.ts` (new) — `crearSesion`, `getSession`.

**Logic**

- `crearSesion(usuarioId)`: genera un token con `crypto.randomBytes(32)`, calcula su hash SHA-256,
  llama a `sesionRepository.create` con el hash, devuelve el **token crudo** (para que Block 6 lo
  ponga en la cookie — el crudo nunca se persiste).
- `getSession(tokenCrudo)`: hashea el token recibido, busca por `token_hash` vía
  `sesionRepository.findByTokenHash`. Si no existe → lanza `SessionNotFoundError`. Si
  `sesionExpiradaPorInactividad(sesion.lastActivityAt, new Date())` → lanza `SessionExpiredError`.
  Si es válida → llama a `sesionRepository.touchLastActivity` (ventana deslizante, NFR-01) y
  devuelve el usuario asociado.

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
- `src/features/qa-access/ui/actions.ts` (new) — server action `qaBackdoorLogin` (`'use server'`).
- `src/features/qa-access/ui/qa-login-button.tsx` (new) — client component `QaLoginButton`.
- `src/app/dev-login/page.tsx` (new) — server component.
- `src/app/layout.tsx` (new) — layout raíz mínimo.
- `src/app/page.tsx` (new) — placeholder de home (redirige o enlaza a `/dev-login` mientras no
  exista el tablero real).

**API contract** *(server action, no hay un endpoint REST clásico)*
- **Invocación:** `qaBackdoorLogin()` — Server Action de Next.js, sin parámetros (por diseño: el
  email nunca viaja desde el cliente, mitigación del threat model). Se invoca desde el `action` de
  un `<form>` que envuelve `QaLoginButton`.
- **Respuesta:** en éxito, setea la cookie de sesión (`httpOnly`, `sameSite=lax`, `secure` si
  `env.nodeEnv === 'production'`, aunque en producción la request nunca llega a este punto porque
  `esEntornoNoProductivo` la corta antes) y redirige a `/dev-login`. En error, redirige a
  `/dev-login?error=1` (mensaje genérico, sin detalle interno).
- **Auth:** ninguna — este server action ES el mecanismo de autenticación.

**Logic**

`qaBackdoorLogin`:
1. Lee `env.nodeEnv` y `env.qaAccessEmail` (los únicos puntos donde se lee `process.env`, por
   diseño de Block 3).
2. Si `!esEntornoNoProductivo(env.nodeEnv)` → lanza `QaAccessDeniedError` (capturado por el propio
   action, que redirige con error genérico) — nunca continúa.
3. Si `env.qaAccessEmail` no está configurado → mismo `QaAccessDeniedError`.
4. `usuarioRepository.findOrCreateByEmail(env.qaAccessEmail)`.
5. `sessionService.crearSesion(usuario.id)` → token crudo.
6. Setea la cookie con el token crudo y los flags de seguridad.
7. Loguea (server-side, sin exponer el token) el resultado: `{ event: 'qa_backdoor_login',
   outcome: 'granted' | 'denied', reason?, timestamp }`.

**Aclaración de capas (pedida por `daw-arch-auditor`):** en los pasos 2 y 3, `ui/actions.ts`
llama a `domain/rules.ts` únicamente para validación pura (sin efectos secundarios, sin BD). La
única llamada de este bloque hacia `data/*` es a través de `domain/session-service.ts`
(`sessionService.crearSesion`) y de los repositories directamente para la búsqueda/creación de
usuario — la UI nunca construye ni ejecuta una query por sí misma.

`src/app/dev-login/page.tsx` (server component):
- Chequea `esEntornoNoProductivo(env.nodeEnv)` **de nuevo, en la página** (defensa en profundidad
  — segunda capa independiente del action). Si es producción → `notFound()` (no renderiza nada,
  ni el botón ni pistas de que el mecanismo existe).
- Si no es producción: intenta `getSession()` a partir de la cookie actual.
  - Si hay sesión válida → muestra "Conectado como {email}" (llamando a `getSession()`, que es el
    caller real del `session-service` dentro del alcance de este ticket — gap señalado por
    `daw-impact-scanner`).
  - Si no hay sesión (o expiró) → muestra `QaLoginButton` dentro de un `<form action={...}>`.

**Error handling**
- `QaAccessDeniedError` → capturado en `qaBackdoorLogin`, redirige a `/dev-login?error=1` con
  mensaje genérico ("No se pudo iniciar sesión"). Nunca expone si la causa fue producción vs. env
  var faltante.
- `SessionExpiredError` / `SessionNotFoundError` (al llamar `getSession()` desde la página) →
  capturadas en `dev-login/page.tsx`, tratadas como "no hay sesión" (se muestra el botón de login,
  sin redirigir a ningún lado que no exista todavía).

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
