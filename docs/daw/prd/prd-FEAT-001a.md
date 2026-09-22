# PRD FEAT-001a: Acceso directo de QA sin magic link

| Field | Value |
|-------|-------|
| Ticket | FEAT-001a |
| Tracker | none |
| Date | 2026-09-18 |
| PRD loops | 0 |

## Contexto y Problema

Ninguna funcionalidad de NutraShot que dependa de "el usuario autenticado" puede construirse
todavía, porque el login real (magic link, RF-01 a RF-03a del PRD general) es un ticket separado y
no existe. Para no bloquear el resto del desarrollo, este ticket implementa la porción de
RF-03b/AC-03b/AC-03c del PRD general: un mecanismo de acceso directo para un único email de QA,
configurado por variable de entorno, que otorga una sesión sin exigir magic link — únicamente fuera
de producción.

Este ticket es fundacional: es la sub-parte `a` de la división de FEAT-001 (ver
`docs/daw/prd/prd-FEAT-001.md`). FEAT-001b (el flujo de registro de consumo a partir de una foto)
depende de que exista un usuario de sesión activa, que este ticket provee.

### Sujetos involucrados

**Usuario QA**: una única persona (o proceso automatizado de testing) que usa el email configurado
por variable de entorno para acceder a la aplicación sin pasar por el login real, únicamente en
entornos no productivos.

## Objetivos

Que exista una manera de autenticarse como el usuario de QA fuera de producción, sin depender del
login real (que se implementará en un ticket futuro), de forma que el resto de la aplicación pueda
construirse y probarse asumiendo un usuario de sesión activo.

## Functional Requirements

- FR-01: El sistema debe permitir un mecanismo de acceso directo (sin magic link) para un único
  email de QA, configurado explícitamente por variable de entorno.
- FR-02: El sistema debe crear automáticamente una cuenta de usuario asociada al email de QA la
  primera vez que se utiliza el mecanismo de acceso directo, sin requerir un paso de registro
  separado.
- FR-03: El sistema debe deshabilitar incondicionalmente el mecanismo de acceso directo de QA
  cuando `NODE_ENV=production`, sin depender únicamente de que la variable de email de QA no esté
  configurada.
- FR-04: El sistema debe establecer una sesión activa para el usuario de QA al utilizar el
  mecanismo de acceso directo, identificable por el resto de la aplicación en solicitudes
  subsiguientes.

## Non-Functional Requirements

- NFR-01: La sesión establecida por el mecanismo de acceso directo debe expirar tras 24 horas de
  inactividad, igual que cualquier otra sesión de la aplicación (ver RNF-06 del PRD general).
- NFR-02: La cookie de sesión debe configurarse como mínimo con los flags `httpOnly` y
  `sameSite=lax`.

## Acceptance Criteria

- AC-01 (FR-01): WHEN una solicitud de acceso llega con el email configurado como usuario de QA y
  `NODE_ENV` es distinto de `production`, THE system SHALL otorgarle una sesión activa sin exigir
  un magic link.
- AC-02 (FR-02): WHEN el email de QA se utiliza por primera vez con el mecanismo de acceso directo,
  THE system SHALL crear automáticamente una cuenta de usuario asociada a ese email.
- AC-03 (FR-03): IF `NODE_ENV=production`, THEN THE system SHALL rechazar el mecanismo de acceso
  directo de QA incondicionalmente, incluso si la variable de email de QA está configurada.
- AC-04 (FR-04): WHEN se otorga acceso mediante el mecanismo directo, THE system SHALL establecer
  una cookie de sesión que identifique al usuario en solicitudes subsiguientes.
- AC-05 (FR-04): WHILE la sesión no ha estado inactiva por 24 horas continuas, THE system SHALL
  mantenerla válida.
- AC-06 (FR-04): IF la sesión estuvo inactiva más de 24 horas, THEN THE system SHALL exigir un
  nuevo acceso mediante el mecanismo directo antes de permitir cualquier acción.

## Out of Scope

- Login real por magic link y su pantalla de inicio de sesión (RF-01, RF-02, RF-03, RF-03a del PRD
  general).
- Expiración del link de acceso a los 15 minutos (RNF-01 del PRD general) — no aplica, este
  mecanismo no usa links.
- Cierre de sesión explícito (RF-17 del PRD general) — se resuelve junto con el login real.
- Tablero principal y cualquier pantalla que no sea necesaria para verificar este mecanismo.
- Cualquier funcionalidad que use la sesión activa (registro de consumos, historial, etc.) — se
  implementa en FEAT-001b y siguientes, que toman esta sesión como dependencia.
- Soporte de más de un usuario de QA o múltiples roles.

## Risks and Mitigations

- **Riesgo:** una mala configuración de `NODE_ENV` podría dejar el mecanismo habilitado en
  producción → *Mitigación:* el chequeo se evalúa en cada solicitud (no se cachea a nivel de build),
  y se cubre con un test de seguridad específico que verifica el rechazo incondicional en
  `NODE_ENV=production` (NFR de seguridad, FR-03).
- **Riesgo:** la variable de entorno con el email de QA podría filtrarse o ser adivinada →
  *Mitigación:* el mecanismo solo funciona fuera de producción, donde el impacto de un acceso no
  autorizado es acotado a datos de prueba.

## Dependencies

- Next.js 15 (App Router) para el manejo de sesión (cookies, middleware o route handlers).
- PostgreSQL para la tabla de usuarios.
- Variable de entorno para el email de QA (nombre a definir en PLAN).
