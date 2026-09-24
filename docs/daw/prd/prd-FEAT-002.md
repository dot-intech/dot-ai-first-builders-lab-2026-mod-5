# PRD FEAT-002: Extraer la sesión y RepositoryError de qa-access a src/shared

| Field | Value |
|-------|-------|
| Ticket | FEAT-002 |
| Tracker | none |
| Date | 2026-09-24 |
| PRD loops | 1 |

## Contexto y Problema

FEAT-001a implementó la sesión de usuario (servicio, repositorios, cookie, errores y reglas) dentro de
la feature `src/features/qa-access/`, junto al backdoor de acceso QA. Era correcto mientras qa-access
era la única feature, pero la sesión no es propia del acceso QA: el login real por magic link y
cualquier feature que necesite al usuario de la sesión activa la van a usar.

FEAT-001b (registro de consumo por foto, pausado en PLAN) necesita resolver el usuario de la sesión
desde una feature nueva, `consumos`. Durante su planificación surgieron dos problemas:

1. **Acoplamiento entre features.** Para obtener el usuario, `consumos` tendría que importar el
   servicio de sesión, la cookie y los errores de `qa-access`. El usuario decidió que la sesión sea un
   componente compartido, importado por ambas features, y no una dependencia de una feature a otra.
2. **Errores de datos duplicados.** Si cada feature define su propio `RepositoryError`, una server
   action de `consumos` que solo reconoce su clase no atrapa el `RepositoryError` que lanza la sesión.
   Ese error llega a Next sin atrapar y se registra con su `cause`, que desde drizzle-orm 0.44 incluye
   el SQL con emails y `token_hash`. Es la fuga que cerró la ADR-005.

Este ticket es un refactor: mueve la sesión y el error de datos a `src/shared/` sin cambiar el
comportamiento que ve el usuario.

### Sujetos involucrados

**Desarrolladores de NutraShot**: necesitan resolver el usuario de la sesión desde cualquier feature
sin acoplarla a qa-access.

**Usuario QA**: no debe notar ningún cambio en el acceso directo ni en la sesión.

## Objetivos

Que la sesión de usuario y el error de acceso a datos vivan en un módulo compartido de `src/shared/`,
del que dependan `qa-access` y las features futuras, con un único punto de entrada para obtener el
usuario de la sesión activa, sin cambiar el comportamiento observable de la aplicación.

## Functional Requirements

- FR-01: El sistema debe proveer el servicio de sesión (`getSession`, `crearSesion` e
  `iniciarSesionParaEmail`, que reemplaza a `iniciarSesionQa`) desde un módulo compartido en
  `src/shared/`, y no desde `src/features/qa-access/`.
- FR-02: El sistema debe proveer los repositorios de sesiones y de usuarios desde el módulo compartido
  de sesión.
- FR-03: El sistema debe proveer los errores de sesión (`SessionNotFoundError`,
  `SessionExpiredError`) desde el módulo compartido de sesión.
- FR-04: El sistema debe proveer las reglas de sesión (ventana de inactividad de 24 h, cookie
  `secure` por entorno, normalización de email) y los tipos `Usuario` y `Sesion` desde el módulo
  compartido de sesión.
- FR-05: El sistema debe proveer el nombre y las opciones de la cookie de sesión desde el módulo
  compartido de sesión.
- FR-06: El sistema debe proveer una única clase `RepositoryError` y su función de envoltura
  `conRepositoryError` desde `src/shared/`, usadas por toda la capa de datos.
- FR-07: El sistema debe proveer una función compartida que, a partir del token de la cookie de
  sesión, devuelva uno de tres resultados: el usuario de la sesión activa, "sin sesión" (token
  ausente, inválido, inexistente o expirado) o "error" (fallo de acceso a datos).
- FR-08: La pantalla de acceso QA (`/dev-login`) debe resolver el estado de la sesión usando la
  función compartida de FR-07.
- FR-09: La feature `qa-access` debe conservar solo lo propio del acceso QA: la regla de entornos
  permitidos, la comparación con el email de QA, `QaAccessDeniedError`, el flujo de acceso QA
  (`autenticarAccesoQa`), la server action, el registro de eventos y el botón.
- FR-10: El sistema debe impedir que un módulo de `src/shared/` importe código de `src/features/`,
  mediante un test automatizado.

## Non-Functional Requirements

- NFR-01: El refactor debe tener 0 cambios de comportamiento observable: el 100% de los tests
  existentes debe pasar, con cambios limitados a rutas de import, rutas de mocks, ubicación de los
  archivos de test y el renombre `iniciarSesionQa` → `iniciarSesionParaEmail` (identificador y título
  del `describe` que la prueba), aprobado por el usuario el 2026-09-24. 0 aserciones modificadas.
- NFR-02: La cobertura de tests debe mantenerse >= 80% en líneas, ramas y funciones (umbral de
  `vitest.config.ts`).
- NFR-03: El refactor debe agregar 0 dependencias nuevas y 0 migraciones de base de datos.
- NFR-04: El `RepositoryError` compartido debe conservar un `message` fijo y el error original solo
  en `cause`: 0 interpolaciones del error original en `message` ni en logs.

## Acceptance Criteria

- AC-01 (FR-01): WHEN una feature o página necesita validar, crear o iniciar una sesión, THE system
  SHALL importar `getSession`, `crearSesion` o `iniciarSesionParaEmail` desde el módulo compartido de
  sesión en `src/shared/`.
- AC-02 (FR-02): WHEN el servicio de sesión accede a la base de datos, THE system SHALL usar los
  repositorios de sesiones y de usuarios del módulo compartido de sesión.
- AC-03 (FR-03): IF un token de sesión no existe o superó la ventana de inactividad, THEN THE system
  SHALL lanzar `SessionNotFoundError` o `SessionExpiredError` importados desde el módulo compartido de
  sesión.
- AC-04 (FR-04): WHEN se evalúa la inactividad de una sesión, el atributo `secure` de la cookie o la
  normalización de un email, THE system SHALL usar las reglas del módulo compartido de sesión, con el
  mismo resultado que antes del refactor para las mismas entradas.
- AC-05 (FR-05): WHEN el acceso QA emite la cookie de sesión, THE system SHALL usar el nombre
  `nutrashot_session` y las opciones (`httpOnly`, `sameSite: 'lax'`, `secure` por entorno, `path: '/'`)
  provistas por el módulo compartido de sesión.
- AC-06 (FR-06): IF falla una consulta de la capa de datos, THEN THE system SHALL lanzar el
  `RepositoryError` único de `src/shared/`, con `message` fijo, `operation` como etiqueta y el error
  original solo en `cause`.
- AC-07 (FR-07): WHEN la función compartida recibe el token de una sesión válida, THE system SHALL
  devolver el resultado "usuario" con el usuario de la sesión activa.
- AC-08 (FR-07): IF el token es ausente, inválido, inexistente o de una sesión expirada, THEN THE
  system SHALL devolver el resultado "sin sesión" sin distinguir entre esos casos.
- AC-09 (FR-07): IF la resolución de la sesión falla por un `RepositoryError`, THEN THE system SHALL
  devolver el resultado "error" junto con la `operation`, sin propagar la excepción.
- AC-10 (FR-08): WHEN se carga `/dev-login`, THE system SHALL mostrar los mismos estados que antes del
  refactor (conectado con el email, sin sesión con el botón, error de verificación) y registrar el
  mismo evento `dev_login_page` ante un error.
- AC-11 (FR-09): WHEN se lista el contenido de `src/features/qa-access/`, THE system SHALL contener
  solo los módulos propios del acceso QA enumerados en FR-09 y sus tests.
- AC-12 (FR-10): IF un archivo de `src/shared/` importa desde `src/features/`, THEN THE system SHALL
  hacer fallar el test automatizado de dependencias.

## Out of Scope

- Cualquier cambio de comportamiento de la sesión (duración, ventana de inactividad, formato del
  token, hash, cookie).
- Login real por magic link y cierre de sesión.
- Cambios de esquema de base de datos o migraciones.
- Migración a Drizzle 1.x (pendiente de la ADR-003, queda para un ticket propio).
- Limpieza de pendientes de FEAT-001a no relacionados (CSP, borrado de sesiones expiradas, el `.pyc`
  versionado).
- La feature `consumos` (FEAT-001b), que consumirá este módulo una vez mergeado.
- Reescribir las ADR existentes: solo se agrega una ADR nueva y notas de referencia.

## Risks and Mitigations

- **Riesgo:** un import o un mock con ruta vieja hace que un test pase sin probar el código real
  (por ejemplo, un `vi.mock` que apunta a un archivo que ya no existe) → *Mitigación:* los mocks
  apuntan a las rutas nuevas, y se verifica que no queden referencias a las rutas viejas con una
  búsqueda en todo `src/`.
- **Riesgo:** mover `RepositoryError` rompe el `instanceof` en algún `catch` que siga importando una
  copia vieja → *Mitigación:* la clase se mueve, no se copia; la ubicación vieja deja de existir y el
  typecheck (`pnpm exec tsc --noEmit`) falla ante cualquier import colgado.
- **Riesgo:** el módulo compartido termina dependiendo de una feature y reproduce el acoplamiento →
  *Mitigación:* test automatizado de dependencias (FR-10).
- **Riesgo:** las referencias de la spec de FEAT-001a y las ADR-004/005 quedan desactualizadas →
  *Mitigación:* ADR nueva que documenta el cambio y notas "ver ADR nueva" en los documentos afectados.

## Dependencies

- **FEAT-001a** (acceso directo de QA): código de origen que se refactoriza. Ya mergeado a main.
- **FEAT-001b** (registro de consumo por foto): no es dependencia; es el ticket que motiva este
  refactor y que se retoma después de mergearlo.
- ADR-004 y ADR-005: decisiones vigentes sobre capas y errores de datos que la ADR nueva actualiza.
- Next.js 15, TypeScript 5.x, Drizzle ORM y Vitest, según la sección Stack de `AGENTS.md`.
