# Spec FEAT-002: Extraer la sesión y RepositoryError de qa-access a src/shared

| Field | Value |
|-------|-------|
| Ticket | FEAT-002 |
| PRD | docs/daw/prd/prd-FEAT-002.md |
| Tier | FEATURE |
| Date | 2026-09-24 |
| Spec loops | 1 |

## Summary

Refactor sin cambio de comportamiento. La sesión (servicio, repositorios, errores, reglas, tipos y
cookie) y el error de acceso a datos salen de `src/features/qa-access/` y pasan a un módulo compartido
por capas: `src/shared/sesion/{domain,data,ui}`, `src/shared/errors/repository-error.ts` y
`src/shared/db/con-repository-error.ts`. `iniciarSesionQa` pasa a ser `iniciarSesionParaEmail` en el
servicio compartido, y se agrega `resolverUsuarioDeSesion` como único punto de entrada para obtener el
usuario de la sesión activa. Un test guardián protege las reglas de dependencia de la ADR-007. Los
archivos se mueven con `git mv` y los tests viajan con su código conservando sus aserciones.

Decisiones: ADR-007 (`docs/adr/adr-007-sesion-y-repository-error-compartidos.md`). Amenazas y
mitigaciones: `docs/daw/security/threat-FEAT-002.md`.

**Terminología.** "Módulo compartido de sesión" (PRD) = `src/shared/sesion/`. "Función compartida"
(FR-07) = `resolverUsuarioDeSesion`, con resultados `{ tipo: 'usuario' }` ("usuario"),
`{ tipo: 'sin-sesion' }` ("sin sesión") y `{ tipo: 'error' }` ("error").

**Renombre aprobado.** `iniciarSesionQa` → `iniciarSesionParaEmail` cambia ese identificador en los
imports y mocks de `acceso-qa.ts`, `acceso-qa.test.ts` y `dev-login-page.test.tsx`, y el título del
`describe` que lo prueba. Lo aprobó el usuario el 2026-09-24 como parte de NFR-01: las aserciones no
cambian.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 2 |
| FR-02 | Block 2 |
| FR-03 | Block 2 |
| FR-04 | Block 2 |
| FR-05 | Block 3 |
| FR-06 | Block 1 |
| FR-07 | Block 3 |
| FR-08 | Block 3 |
| FR-09 | Block 2, Block 3, Block 4 |
| FR-10 | Block 4 |
| NFR-01 | Strategy: movimientos con `git mv`; los tests existentes se mueven o se reparten sin cambiar sus aserciones (solo imports, rutas de `vi.mock`, ubicación y el renombre aprobado); la suite completa (`pnpm test:unit` y `pnpm test:integration`) pasa al final de cada bloque |
| NFR-02 | Strategy: tests nuevos para `resolverUsuarioDeSesion` y `conRepositoryError`; los umbrales de `vitest.config.ts` no cambian; se excluye `src/shared/**/domain/types.ts` de la cobertura (solo tipos, igual que la exclusión existente); `pnpm test:coverage` en la verificación final |
| NFR-03 | Strategy: no se toca `package.json`, `pnpm-lock.yaml`, `drizzle/` ni `src/shared/db/schema.ts` (salvo un comentario); la verificación final lo comprueba con `git diff --stat main` |
| NFR-04 | Strategy: `RepositoryError` se mueve sin reescribir; sus tests de `message` fijo, `operation` y `cause` se mueven con sus aserciones intactas (Block 1) |

## Dependencies between blocks

Secuenciales: **Block 1 → Block 2 → Block 3 → Block 4**. Cada bloque deja el repo compilando y con la
suite en verde.

- Block 2 depende de Block 1: los repositorios movidos importan `RepositoryError` y
  `conRepositoryError` desde `src/shared`.
- Block 3 depende de Block 2: `resolverUsuarioDeSesion` usa `getSession` y los errores de sesión del
  módulo compartido, y la cookie usa `cookieSesionEsSecure` de las reglas compartidas.
- Block 4 depende de Blocks 1–3: el guardián solo pasa cuando `qa-access` ya no contiene módulos de
  sesión.

## Block 1 — `RepositoryError` y `conRepositoryError` a `src/shared`

**Files**
- `src/shared/errors/repository-error.ts` (new) — la clase `RepositoryError`, movida sin cambios desde
  `src/features/qa-access/domain/errors.ts`, con su JSDoc.
- `src/shared/errors/repository-error.test.ts` (new) — el `describe('RepositoryError')` movido desde
  `src/features/qa-access/domain/errors.test.ts`, con sus aserciones intactas.
- `src/shared/db/con-repository-error.ts` (new, `git mv` de `src/features/qa-access/data/errors.ts`) —
  `conRepositoryError`, importando `RepositoryError` de `../errors/repository-error`.
- `src/shared/db/con-repository-error.test.ts` (new) — tests unitarios de `conRepositoryError`.
- `src/features/qa-access/domain/errors.ts` (modified) — se quita `RepositoryError`.
- `src/features/qa-access/domain/errors.test.ts` (modified) — se quita el `describe('RepositoryError')`.
- Importadores de `RepositoryError` o `conRepositoryError` (modified, solo imports):
  `src/features/qa-access/data/sesion-repository.ts`, `data/usuario-repository.ts`,
  `data/sesion-repository.integration.test.ts`, `data/usuario-repository.integration.test.ts`,
  `ui/actions.ts`, `ui/actions.test.ts`, `ui/acceso-qa.test.ts`, `ui/estado-sesion.ts`,
  `ui/estado-sesion.test.ts` (todos bajo `src/features/qa-access/`) y
  `src/app/dev-login/dev-login-page.test.tsx`.

**Logic**
Se mueve la clase y la función de envoltura sin cambiar su código. `repository-error.ts` no importa
nada; `con-repository-error.ts` solo importa `RepositoryError`. Ningún archivo de UI importa
`src/shared/db/con-repository-error.ts` (ADR-007).

**Error handling**
- Falla de una consulta de datos: `conRepositoryError` la traduce a `RepositoryError(operation,
  { cause })` y la relanza; nunca la traga ni devuelve un valor por defecto.
- El `message` de `RepositoryError` es fijo; el error original viaja solo en `cause` y nunca se
  interpola (NFR-04).

**Required tests**
- [ ] `repository-error.test.ts` (movido): instancia de `Error` con `name` propio, `message` fijo para
  cualquier operación, `operation` pública, `cause` conservado — validates AC-06
- [ ] `repository-error.test.ts` (movido): el `message` no contiene el SQL, los parámetros ni el mensaje
  del error original — validates AC-06, NFR-04
- [ ] `con-repository-error.test.ts`: devuelve el valor de la consulta cuando no falla — validates AC-06
- [ ] `con-repository-error.test.ts`: ante una consulta que lanza, relanza un `RepositoryError` con la
  `operation` recibida y el error original en `cause` (no lo traga) — validates AC-06
- [ ] Tests de integración de los repositorios (con sus imports actualizados) siguen verificando que
  un fallo de BD llega como `RepositoryError` — validates AC-06

**Completion criterion**
`src/features/qa-access/domain/errors.ts` ya no exporta `RepositoryError`,
`src/features/qa-access/data/errors.ts` no existe, `pnpm exec tsc --noEmit` y `pnpm lint` pasan, y
`pnpm test:unit` y `pnpm test:integration` pasan.

## Block 2 — Dominio y datos de la sesión a `src/shared/sesion`

**Files**
- `src/shared/sesion/domain/types.ts` (new, `git mv` de `src/features/qa-access/domain/types.ts`) —
  `Usuario`, `Sesion`. El archivo de qa-access deja de existir.
- `src/shared/sesion/domain/errors.ts` (new) — `SessionNotFoundError` y `SessionExpiredError`, movidos
  sin cambios desde `src/features/qa-access/domain/errors.ts`.
- `src/shared/sesion/domain/rules.ts` (new) — `INACTIVIDAD_MAXIMA_MS`, `sesionExpiradaPorInactividad`,
  `cookieSesionEsSecure` (con su lista privada de entornos) y `normalizarEmail`, movidos sin cambios.
- `src/shared/sesion/domain/rules.test.ts` (new) — los `describe` de `cookieSesionEsSecure`,
  `INACTIVIDAD_MAXIMA_MS`, `sesionExpiradaPorInactividad` y `normalizarEmail`, movidos desde
  `src/features/qa-access/domain/rules.test.ts`.
- `src/shared/sesion/domain/session-service.ts` (new, `git mv`) — `crearSesion`, `getSession` e
  `iniciarSesionParaEmail` (renombrada desde `iniciarSesionQa`, mismo código). JSDoc de
  `iniciarSesionParaEmail`: el caller debe haber verificado la identidad; nunca se llama con un email
  del cliente sin verificar (threat model, mitigación 4).
- `src/shared/sesion/domain/session-service.test.ts` (new, `git mv`) — los tres `describe`; el de
  `iniciarSesionQa` pasa a `iniciarSesionParaEmail`. Sus `vi.mock('../data/...')` siguen válidos.
- `src/shared/sesion/data/sesion-repository.ts` y `usuario-repository.ts` (new, `git mv`) — imports a
  `../../db/client`, `../../db/schema`, `../../errors/repository-error`,
  `../../db/con-repository-error` y a `../domain/*`.
- `src/shared/sesion/data/sesion-repository.integration.test.ts` y
  `usuario-repository.integration.test.ts` (new, `git mv`) — `vi.mock('../../db/client')` e imports con
  la profundidad nueva.
- `src/features/qa-access/domain/rules.ts` (modified) — queda con `esEntornoPermitidoParaAccesoQa` y
  `emailCoincideConQa`; importa `normalizarEmail` de `src/shared/sesion/domain/rules`.
- `src/features/qa-access/domain/rules.test.ts` (modified) — queda con los `describe` de
  `esEntornoPermitidoParaAccesoQa`, la lista de entornos permitidos y `emailCoincideConQa`.
- `src/features/qa-access/domain/errors.ts` (modified) — queda solo con `QaAccessDeniedError` y
  `QaAccessDeniedReason`.
- `src/features/qa-access/domain/errors.test.ts` (modified) — importa `SessionExpiredError` y
  `SessionNotFoundError` desde `src/shared/sesion/domain/errors` (features → shared, permitido); sus
  aserciones no cambian.
- `src/features/qa-access/ui/acceso-qa.ts` (modified) — importa `normalizarEmail` de shared e
  `iniciarSesionParaEmail` del servicio compartido.
- `src/features/qa-access/ui/acceso-qa.test.ts` (modified) — `vi.mock` e import del servicio
  compartido, con el identificador renombrado.
- `src/features/qa-access/ui/cookie-sesion.ts` (modified) — importa `cookieSesionEsSecure` de shared
  (se mueve en Block 3).
- `src/features/qa-access/ui/estado-sesion.ts` y `estado-sesion.test.ts` (modified) — imports y
  `vi.mock` de `getSession`, errores y tipo `Usuario` desde shared.
- `src/app/dev-login/dev-login-page.test.tsx` (modified) — imports de errores y `vi.mock` del servicio
  compartido (`getSession`, `iniciarSesionParaEmail`).
- `vitest.config.ts` (modified) — agrega `'src/shared/**/domain/types.ts'` a `coverage.exclude`, con el
  mismo comentario que la exclusión existente.

**Logic**
Se mueve código sin cambiar su comportamiento. Los archivos que mezclan sesión y acceso QA
(`errors.ts`, `rules.ts` y sus tests) se reparten: lo de sesión va a `src/shared/sesion/domain/` y lo
de QA se queda. `session-service.ts` se mueve entero y su función de inicio de sesión se renombra.
Después de este bloque, `src/features/qa-access/data/` queda vacío y se borra.

**Input validation**
Sin cambios. `getSession` sigue validando el token recibido de la cookie (input no confiable): tipo
`string` verificado en runtime, largo de 1 a 128 caracteres; fuera de eso lanza
`SessionNotFoundError` sin consultar la BD.

**Error handling**
- Token vacío, demasiado largo o de tipo inválido: `getSession` lanza `SessionNotFoundError`.
- Hash sin sesión o usuario inexistente: `getSession` lanza `SessionNotFoundError`.
- Sesión con más de 24 h de inactividad: `getSession` lanza `SessionExpiredError` sin tocar
  `last_activity_at`.
- Fallo de BD en cualquier repositorio: se propaga `RepositoryError` sin capturarlo, desde
  `getSession`, `crearSesion` e `iniciarSesionParaEmail` (esta última sin crear la sesión si falla el
  usuario).

**Required tests**
- [ ] `session-service.test.ts` (movido): `crearSesion` y `getSession` (token válido, hash SHA-256,
  reloj por defecto) — validates AC-01, AC-02
- [ ] `session-service.test.ts` (movido): `getSession` lanza `SessionNotFoundError` con token vacío,
  de 129 caracteres, de tipo inválido, hash sin sesión y usuario inexistente — validates AC-03
- [ ] `session-service.test.ts` (movido): `getSession` lanza `SessionExpiredError` con más de 24 h de
  inactividad y sin tocar `last_activity_at` — validates AC-03
- [ ] `session-service.test.ts` (movido): propagación de `RepositoryError` desde `findByTokenHash`,
  `findById`, `touchLastActivity` y `crearSesion` — validates AC-02, AC-06
- [ ] `session-service.test.ts` (movido, `describe` renombrado): `iniciarSesionParaEmail` llama a
  `findOrCreateByEmail`, abre la sesión con el id devuelto, devuelve el token cuyo hash se persistió y
  propaga `RepositoryError` del usuario (sin crear sesión) y de la sesión — validates AC-01
- [ ] Integration tests de `sesion-repository` y `usuario-repository` (movidos) — validates AC-02
- [ ] `src/shared/sesion/domain/rules.test.ts` (movido): inactividad (bordes 23h59m, 24h, 24h01m,
  fechas inválidas, fecha futura), `cookieSesionEsSecure`, la lista privada no exportada y
  `normalizarEmail` — validates AC-04
- [ ] `src/features/qa-access/domain/rules.test.ts` y `errors.test.ts` (reducidos): conservan sus
  casos de QA y de distinción por `instanceof` — validates AC-03
- [ ] `acceso-qa.test.ts` (imports y mock actualizados): sigue verificando el inicio de sesión QA vía
  `iniciarSesionParaEmail` — validates AC-01

**Completion criterion**
`src/features/qa-access/domain/` contiene solo `errors.ts`, `rules.ts` y sus tests;
`src/features/qa-access/data/` no existe; `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test:unit` y
`pnpm test:integration` pasan.

## Block 3 — Cookie, `resolverUsuarioDeSesion` y `/dev-login`

**Files**
- `src/shared/sesion/ui/cookie-sesion.ts` (new, `git mv` de `src/features/qa-access/ui/cookie-sesion.ts`)
  — importa `cookieSesionEsSecure` de `../domain/rules`.
- `src/shared/sesion/ui/cookie-sesion.test.ts` (new, `git mv`) — aserciones intactas.
- `src/shared/sesion/ui/usuario-de-sesion.ts` (new) — `resolverUsuarioDeSesion` y el tipo
  `ResultadoUsuarioDeSesion`. Sin `'use server'`.
- `src/shared/sesion/ui/usuario-de-sesion.test.ts` (new) — tests unitarios con `getSession` mockeado.
- `src/features/qa-access/ui/estado-sesion.ts` (modified) — usa `resolverUsuarioDeSesion` con un
  `switch` exhaustivo sobre `tipo`; conserva la firma de `resolverEstadoSesion` y el registro
  `dev_login_page` con `operation` ante `{ tipo: 'error' }`.
- `src/features/qa-access/ui/estado-sesion.test.ts` (modified, solo si hace falta ajustar un import) —
  sigue mockeando `getSession` en el servicio compartido; sus aserciones no cambian.
- `src/features/qa-access/ui/actions.ts`, `actions.test.ts` y `actions.integration.test.ts` (modified)
  — importan la cookie desde `src/shared/sesion/ui/cookie-sesion`.
- `src/app/dev-login/page.tsx` y `dev-login-page.test.tsx` (modified) — importan
  `NOMBRE_COOKIE_SESION` desde shared.
- `src/shared/db/schema.ts` (modified, solo comentario) — el comentario de cabecera nombra a
  `src/shared/sesion/data` como consumidor de las tablas, en lugar de `qa-access`.

**Logic**
`resolverUsuarioDeSesion(token: string | undefined): Promise<ResultadoUsuarioDeSesion>` llama a
`getSession(token ?? '')` (igual que hoy `estado-sesion.ts`, para que las aserciones de
`estado-sesion.test.ts` sigan idénticas) y traduce el resultado:

```ts
type ResultadoUsuarioDeSesion =
  | { tipo: 'usuario'; usuario: Usuario }
  | { tipo: 'sin-sesion' }
  | { tipo: 'error'; operation: string };
```

No lee `next/headers`: el caller lee la cookie. No registra nada: el caller registra `operation` con
su propio evento y nunca copia el error (ADR-007). JSDoc con ese contrato y con el invariante de no
llevar `'use server'`. `estado-sesion.ts` mapea `usuario` → `conectada` con el email, `sin-sesion` →
`sin-sesion` y `error` → registra `{ event: 'dev_login_page', outcome: 'error', operation }` y devuelve
`error`.

**Input validation**
El token viene de una cookie (input no confiable): `string | undefined`. `undefined` se pasa como `''`.
La validación de tipo y largo (1 a 128) la hace `getSession`; `resolverUsuarioDeSesion` no agrega
reglas ni procesa el token.

**Error handling**
- `SessionNotFoundError` (token ausente, inválido o sin sesión): devuelve `{ tipo: 'sin-sesion' }`.
- `SessionExpiredError`: devuelve el mismo `{ tipo: 'sin-sesion' }`, sin distinguirlo (AC-08).
- `RepositoryError`: devuelve `{ tipo: 'error', operation }` sin propagar la excepción y sin incluir
  `message` ni `cause` (AC-09).
- Cualquier otro error: se relanza sin modificar (nunca catch silencioso).

**Required tests**
- [ ] `usuario-de-sesion.test.ts`: con token válido devuelve `{ tipo: 'usuario', usuario }` — validates AC-07
- [ ] `usuario-de-sesion.test.ts`: con `SessionNotFoundError` devuelve `{ tipo: 'sin-sesion' }` — validates AC-08
- [ ] `usuario-de-sesion.test.ts`: con `SessionExpiredError` devuelve exactamente el mismo resultado que
  con `SessionNotFoundError` — validates AC-08
- [ ] `usuario-de-sesion.test.ts`: con token `undefined` llama a `getSession('')` y devuelve
  `{ tipo: 'sin-sesion' }` — validates AC-08
- [ ] `usuario-de-sesion.test.ts`: con `RepositoryError` devuelve `{ tipo: 'error', operation }`, sin
  lanzar y sin propiedades `message` ni `cause` en el resultado — validates AC-09
- [ ] `usuario-de-sesion.test.ts`: con un error de otro tipo lo relanza — validates AC-09
- [ ] `cookie-sesion.test.ts` (movido): nombre `nutrashot_session`, `httpOnly`, `sameSite: 'lax'`,
  `path: '/'`, sin `maxAge`, `secure` por entorno — validates AC-05
- [ ] `estado-sesion.test.ts` (sin cambiar aserciones): conectada, sin sesión (inexistente y expirada),
  error con evento `dev_login_page` y `operation`, error inesperado relanzado — validates AC-10
- [ ] `dev-login-page.test.tsx` (imports y mocks actualizados): los estados de la página siguen
  iguales — validates AC-10
- [ ] `actions.test.ts` y `actions.integration.test.ts` (import actualizado): la cookie emitida sigue
  con el mismo nombre y opciones — validates AC-05

**Completion criterion**
`src/features/qa-access/ui/` ya no contiene `cookie-sesion.ts`; `resolverUsuarioDeSesion` tiene 100%
de cobertura de ramas; `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test:unit` y
`pnpm test:integration` pasan.

## Block 4 — Test guardián de dependencias

**Files**
- `src/shared/reglas-de-dependencias.test.ts` (new) — escanea `src/` con `node:fs` y verifica las
  reglas de la ADR-007 que se pueden automatizar.

**Logic**
El test recorre los `.ts` y `.tsx` de `src/` (incluidos los tests) y extrae los especificadores de
módulo de: `import … from`, `import '…'`, `export … from`, `import('…')` y `vi.mock('…')`. Cada
especificador se resuelve a una ruta dentro de `src/`: los relativos contra la carpeta del archivo, y
el alias `@/…` contra `src/`. Los paquetes externos se ignoran. Así compara rutas resueltas, no texto,
y no se marca a sí mismo por contener la palabra "features". Reglas:

1. Ningún archivo de `src/shared/` importa algo que resuelva dentro de `src/features/` (FR-10).
2. Ningún archivo de `src/features/<X>/` importa algo que resuelva dentro de `src/features/<Y>/` con
   `Y ≠ X` (ADR-007; el usuario la sumó más allá de FR-10).
3. Ningún archivo de `src/shared/` contiene la directiva `'use server'` o `"use server"` como primera
   sentencia (threat model, mitigación 3).
4. `src/features/qa-access/` no contiene módulos de sesión: no existen
   `domain/session-service.ts`, `domain/types.ts`, `ui/cookie-sesion.ts` ni la carpeta `data/`
   (FR-09).

La extracción y la resolución son funciones puras dentro del mismo archivo de test, con sus propios
casos de prueba sobre strings de ejemplo, para que un cambio en el parser no desactive el guardián sin
que se note.

**Error handling**
- Violación de cualquier regla: el test falla con un mensaje que lista cada archivo y el especificador
  o la directiva que la incumple.
- Especificador que no resuelve a ninguna ruta de `src/` (paquete externo): se ignora; no es un error.

**Required tests**
- [ ] Regla 1: ningún archivo de `src/shared/` importa de `src/features/` — validates AC-12
- [ ] Regla 2: ninguna feature importa de otra feature — validates AC-12 (regla de ADR-007)
- [ ] Regla 3: ningún archivo de `src/shared/` lleva `'use server'` — validates AC-12 (mitigación 3)
- [ ] Regla 4: `src/features/qa-access/` no contiene módulos de sesión — validates AC-11
- [ ] Parser: detecta especificadores en `import … from`, `import '…'`, `export … from`, `import()` y
  `vi.mock()` — validates AC-12
- [ ] Resolución: `../../features/x`, `@/features/x` y `./algo` resuelven a la ruta correcta; `react`
  y `node:fs` se ignoran (sad path: especificador externo) — validates AC-12
- [ ] Violación simulada: un archivo ficticio de shared que importa de features y uno con
  `'use server'` producen el mensaje de falla con archivo y especificador — validates AC-12

**Completion criterion**
El test guardián pasa sobre el código real y sus casos del parser pasan; `pnpm test:unit` pasa.

## Final verification

- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test:unit`, `pnpm test:integration` y
  `pnpm test:coverage` pasan, con los umbrales de 80% sin cambios (NFR-02).
- Búsqueda de rutas viejas en `src/`: no quedan referencias a `qa-access/domain/session-service`,
  `qa-access/domain/types`, `qa-access/data/`, `qa-access/ui/cookie-sesion` ni a `RepositoryError` o
  errores de sesión importados desde `qa-access/domain/errors`, incluidos los strings de `vi.mock`.
- `git diff --stat main` no muestra cambios en `package.json`, `pnpm-lock.yaml` ni `drizzle/`
  (NFR-03).
- La revisión del diff de los tests muestra solo cambios de imports, rutas de mocks, ubicación y el
  renombre aprobado, más los tests nuevos (NFR-01).
- Prueba manual en desarrollo: `/dev-login` sin sesión muestra el botón; tras el acceso QA muestra
  "Conectado como …" (AC-10).
- **Rollback:** no hay migraciones ni cambios de datos; revertir el merge restaura el estado anterior.
