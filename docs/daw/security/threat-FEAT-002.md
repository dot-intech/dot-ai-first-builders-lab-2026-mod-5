# Threat Model FEAT-002: Extraer la sesión y RepositoryError de qa-access a src/shared

| Field | Value |
|-------|-------|
| Ticket | FEAT-002 |
| Date | 2026-09-24 |
| Result | PASSED |

## Alcance

Refactor sin cambio de comportamiento (PRD FEAT-002, NFR-01). No agrega endpoints, tablas,
dependencias ni variables de entorno. El análisis se centra en dos riesgos: **regresiones de
seguridad** al mover código que ya está mitigado (threat model de FEAT-001a) y **superficies nuevas**
que aparecen al volver genérico y compartido lo que antes era interno de qa-access.

Componentes introducidos o modificados:

1. `src/shared/errors/repository-error.ts` y `src/shared/db/con-repository-error.ts`
   (`RepositoryError`, `conRepositoryError`), movidos desde qa-access.
2. `src/shared/sesion/domain/session-service.ts`: `getSession` y `crearSesion` (movidos) e
   `iniciarSesionParaEmail` (hoy `iniciarSesionQa`, renombrada y movida).
3. `src/shared/sesion/data/`: `sesion-repository.ts` y `usuario-repository.ts` (movidos).
4. `src/shared/sesion/ui/cookie-sesion.ts`: nombre y opciones de la cookie (movido).
5. `src/shared/sesion/ui/usuario-de-sesion.ts`: `resolverUsuarioDeSesion(token)` (**nuevo**).
6. `src/features/qa-access/ui/acceso-qa.ts` y `estado-sesion.ts` (modificados para usar shared), y
   `src/app/dev-login/page.tsx` (cambia imports).
7. Test guardián de dependencias en `src/shared/` (nuevo; solo corre en test).

## Fronteras de confianza

| ID | Frontera | Descripción |
|----|----------|--------------|
| TB1 | Browser ↔ Next.js server | El token crudo de la cookie `nutrashot_session` entra al servidor y llega a `resolverUsuarioDeSesion`/`getSession`. Es input no confiable. |
| TB2 | Next.js server ↔ PostgreSQL | Los repositorios de `shared/sesion/data` consultan `usuarios` y `sesiones` vía Drizzle. |
| TB3 | Código de servidor ↔ código invocable desde el cliente | Un archivo con `'use server'` convierte cada export en un endpoint. Los módulos de `shared/sesion` no deben cruzar esta frontera. |
| TB4 | Next.js server ↔ logs del servidor | Lo que se registra al atrapar un `RepositoryError` (el `cause` trae SQL con emails y `token_hash`). |

## Análisis STRIDE por componente

### 1. `RepositoryError` y `conRepositoryError` (shared)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | N/A: no maneja identidad | — | — | No aplica |
| Tampering | N/A: no persiste ni transforma datos | — | — | No aplica |
| Repudiation | N/A: no registra; el registro es de quien atrapa | — | — | No aplica |
| Information Disclosure | Al mover la clase se pierde el `message` fijo o se interpola el error original, y el SQL con `token_hash` llega a logs o a la respuesta (TB4) | Low | High | Se mueve con `git mv`, sin reescribir; los tests actuales de `message` fijo y `cause` se conservan sin cambiar sus aserciones (NFR-04) |
| Information Disclosure | Quedan dos clases (una vieja y una nueva) y un `catch` por `instanceof` deja escapar el error sin atrapar, que Next registra completo (TB4) | Low | High | La ubicación vieja deja de existir; `pnpm exec tsc --noEmit` falla ante cualquier import colgado; búsqueda final de rutas viejas en `src/` |
| Denial of Service | N/A | — | — | No aplica |
| Elevation of Privilege | N/A | — | — | No aplica |

### 2. Servicio de sesión (`shared/sesion/domain/session-service.ts`)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | `iniciarSesionParaEmail(email)` crea una sesión para cualquier email sin verificar identidad. Como ahora es genérica y compartida, una feature futura podría llamarla con un email que viene del cliente y abrir un bypass de autenticación | Low | High | JSDoc y ADR-007 fijan el contrato: el caller debe haber verificado la identidad antes (acceso QA: entorno permitido + email de config; login real: magic link). El único caller en este ticket es `acceso-qa.ts`, que no recibe el email del cliente (sin cambios respecto de FEAT-001a) |
| Tampering | Un token alterado en la cookie (TB1) | Low | Medium | Sin cambios: se valida formato y largo máximo y se busca por hash SHA-256; un token alterado no coincide con ninguna fila |
| Repudiation | El inicio de sesión deja de registrarse al mover el código | Low | Low | El registro sigue en `qa-access/ui/actions.ts` (`qa_backdoor_login`), que no se mueve |
| Information Disclosure | El token crudo se persiste o se registra | Low | High | Sin cambios: solo se persiste el hash; el servicio no registra |
| Denial of Service | Sin cambios respecto de FEAT-001a (riesgo aceptado #2 de ese threat model sigue vigente) | Low | Low | No hay superficie nueva |
| Elevation of Privilege | La ventana de inactividad de 24 h o la validación del token cambian al mover las reglas | Low | High | Las reglas se mueven sin modificar; `rules.test.ts` y `session-service.test.ts` conservan sus aserciones (NFR-01) |

### 3. Repositorios (`shared/sesion/data/`)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | N/A | — | — | No aplica |
| Tampering | Inyección SQL (TB2) | Low | Critical | Sin cambios: Drizzle con query builder parametrizado |
| Repudiation | N/A | — | — | No aplica |
| Information Disclosure | Un `vi.mock` de `shared/db/client` con ruta vieja deja de aplicarse y un test de integración corre contra otra base, o un test unitario deja de probar lo que dice | Medium | Medium | Las rutas de los mocks se actualizan al mover cada test; la búsqueda final de rutas viejas incluye los strings de `vi.mock` |
| Denial of Service | N/A | — | — | No aplica |
| Elevation of Privilege | Una feature importa `shared/sesion/data` directamente y salta el servicio | Low | Medium | Matriz de dependencias de la ADR-007: nadie fuera de `shared/sesion` importa `shared/sesion/data`; `iniciarSesionParaEmail` evita que qa-access lo necesite |

### 4. Cookie de sesión (`shared/sesion/ui/cookie-sesion.ts`)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | N/A | — | — | No aplica |
| Tampering | Al mover el archivo cambian el nombre o las opciones de la cookie | Low | Medium | Se mueve sin cambios; `cookie-sesion.test.ts` conserva sus aserciones (AC-05) |
| Repudiation | N/A | — | — | No aplica |
| Information Disclosure | Se pierde `httpOnly` o `secure` por entorno (robo del token por XSS o por red) | Low | High | Mismo test; `cookieSesionEsSecure` se mueve sin cambios (ADR-002) |
| Denial of Service | N/A | — | — | No aplica |
| Elevation of Privilege | N/A | — | — | No aplica |

### 5. `resolverUsuarioDeSesion` (`shared/sesion/ui/usuario-de-sesion.ts`, nuevo)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | Si el archivo llevara `'use server'` (TB3), cualquiera podría invocarla desde el cliente con tokens arbitrarios y usarla como oráculo para probar tokens | Low | High | Invariante de la ADR-007: ningún archivo de `src/shared/` lleva `'use server'`. El test guardián lo verifica (mitigación 3) |
| Tampering | Token alterado (TB1) | Low | Medium | Delega en `getSession(token ?? '')`, que valida formato, largo y hash |
| Repudiation | Como no registra, un caller que ignore `{ tipo: 'error' }` convierte un fallo de base de datos en un catch silencioso | Medium | Medium | Contrato en JSDoc y ADR-007: el caller registra `operation` con su propio evento; `estado-sesion.ts` usa un `switch` exhaustivo y conserva el evento `dev_login_page` (AC-10) |
| Information Disclosure | El resultado distingue "sesión inexistente" de "expirada" y filtra información sobre tokens | Low | Low | Los dos casos devuelven el mismo `{ tipo: 'sin-sesion' }` (AC-08) |
| Information Disclosure | El resultado `error` incluye el mensaje o el `cause` del `RepositoryError` (TB4) | Low | High | Solo devuelve `operation`, una etiqueta sin datos (AC-09) |
| Denial of Service | Tokens muy largos | Low | Low | Sin cambios: `getSession` rechaza tokens de más de 128 caracteres sin hashearlos |
| Elevation of Privilege | Un error no esperado se traduce a "sin sesión" o a "usuario" | Low | High | Solo atrapa `SessionNotFoundError`, `SessionExpiredError` y `RepositoryError` por `instanceof`; cualquier otro error se relanza |

### 6. qa-access y `/dev-login` (modificados)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | El acceso QA se habilita fuera de los entornos permitidos al reorganizar imports | Low | High | La regla de entornos y su doble chequeo (server action y página) no se mueven; sus tests de seguridad se conservan |
| Tampering | N/A | — | — | No aplica |
| Repudiation | Se pierde el evento `dev_login_page` ante un error | Low | Low | `estado-sesion.test.ts` conserva la aserción del evento |
| Information Disclosure | Mensajes de error que distinguen causas | Low | Medium | Sin cambios: mensajes genéricos |
| Denial of Service | N/A | — | — | No aplica |
| Elevation of Privilege | N/A | — | — | No aplica |

### 7. Test guardián de dependencias

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | N/A: solo corre en test | — | — | No aplica |
| Tampering | Un import se escapa del chequeo (alias `@/`, `export … from`, `import()`, `vi.mock`) y el acoplamiento vuelve sin que nadie lo note | Medium | Low | El test resuelve cada especificador a una ruta y compara contra `src/features/` y `src/shared/`; cubre todas esas formas |
| Repudiation | N/A | — | — | No aplica |
| Information Disclosure | N/A | — | — | No aplica |
| Denial of Service | N/A | — | — | No aplica |
| Elevation of Privilege | N/A | — | — | No aplica |

## Clasificación de datos sensibles (F-TM-05)

Los mismos datos de FEAT-001a; este ticket no agrega ninguno.

| Dato | Clasificación | Dónde pasa ahora |
|---|---|---|
| `usuarios.email` | PII | `shared/sesion/data/usuario-repository.ts` |
| Token de sesión crudo (cookie) | Credential-equivalente | TB1 → `resolverUsuarioDeSesion` → `getSession` |
| `sesiones.token_hash` | Derivado de credential | `shared/sesion/data/sesion-repository.ts` |
| `cause` de `RepositoryError` (SQL con email y `token_hash`) | PII + derivado de credential | Solo en memoria; nunca en `message`, logs ni resultados |
| `DATABASE_URL` | Credential | Sin cambios (`src/env.ts`, `shared/db/client.ts`) |

## Cifrado (F-TM-07)

Sin cambios respecto de FEAT-001a:

- **En tránsito:** PostgreSQL con `sslmode=require` en la `DATABASE_URL` de producción (pendiente
  de FEAT-001a: nada lo verifica en deployment); cookie con `secure` salvo en `development` y `test`
  (ADR-002).
- **En reposo:** el token se persiste solo como hash SHA-256. El cifrado del email a nivel de columna
  sigue delegado al proveedor de PostgreSQL, según la asunción documentada en FEAT-001a.

## Dependencias (W-TM-01)

El refactor no agrega dependencias (NFR-03), así que no hay superficie nueva de cadena de suministro.

## Disponibilidad (W-TM-02)

No hay endpoints nuevos ni cambios en el costo de las operaciones. El riesgo aceptado #2 de FEAT-001a
(sin rate limiting en el backdoor) sigue vigente sin cambios.

## Riesgos aceptados

Ninguno nuevo. Los riesgos aceptados #1 y #2 de `threat-FEAT-001a.md` siguen vigentes sin cambios.

## Mitigaciones a incorporar en la spec

1. Movimientos con `git mv`, sin reescribir; los tests conservan sus aserciones y solo cambian
   imports, rutas de mocks y ubicación (NFR-01, NFR-04).
2. Borrar las ubicaciones viejas (no dejar copias) y correr `pnpm exec tsc --noEmit` y una búsqueda
   de rutas viejas en `src/`, incluidos los strings de `vi.mock`.
3. Test guardián en `src/shared/` con tres reglas: `src/shared` no importa de `src/features`; una
   feature no importa de otra; ningún archivo de `src/shared` lleva la directiva `'use server'`.
   Resuelve rutas relativas, alias `@/`, `export … from`, `import()` y `vi.mock`.
4. JSDoc de `iniciarSesionParaEmail`: el caller es responsable de haber verificado la identidad; nunca
   se llama con un email que venga del cliente sin verificar.
5. JSDoc de `resolverUsuarioDeSesion`: sin `'use server'`; el caller registra `operation` ante
   `{ tipo: 'error' }` y nunca copia el error; "inexistente" y "expirada" no se distinguen.
6. `estado-sesion.ts` usa un `switch` exhaustivo sobre `tipo` y conserva el evento `dev_login_page`.
7. ADR-007 registra la matriz de dependencias, el encapsulamiento de `shared/sesion/data`, el
   invariante de `'use server'` y el contrato de registro del caller.

## Resumen

Riesgos identificados: 25 (sin contar los N/A). Por probabilidad × impacto: C:0 H:0 M:3 L:22.

- **Medios (3):** mocks con rutas viejas, un caller que ignora el resultado `error` e imports que se
  escapan del guardián. Tienen probabilidad media e impacto medio o bajo, y los tres quedan mitigados
  en la spec (mitigaciones 2, 5, 6 y 3).
- **Bajos (22):** varios tienen impacto alto (fuga del `cause`, `'use server'` en shared,
  `iniciarSesionParaEmail` con un email sin verificar, cambios en la cookie o en la ventana de
  inactividad), pero su probabilidad es baja y quedan mitigados por diseño o por tests. El resto no
  cambia respecto de FEAT-001a.

Resultado: **PASSED**. Todos los componentes tienen análisis STRIDE completo, las fronteras de
confianza están declaradas, los datos sensibles están clasificados y no hay riesgos sin mitigación
ni aceptaciones nuevas.
