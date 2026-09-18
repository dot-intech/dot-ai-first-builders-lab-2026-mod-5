# Threat Model FEAT-001a: Acceso directo de QA sin magic link

| Field | Value |
|-------|-------|
| Ticket | FEAT-001a |
| Date | 2026-09-18 |
| Result | PASSED |

## Superficies de ataque identificadas

1. Server action del backdoor (`ui/actions.ts` → `qaBackdoorLogin`).
2. Cookie / token de sesión (creado por `domain/session-service.ts`).
3. Tablas `usuarios` y `sesiones` en PostgreSQL.
4. Variables de entorno del proceso (`QA_ACCESS_EMAIL`, `DATABASE_URL`).

## Fronteras de confianza

| ID | Frontera | Descripción |
|----|----------|--------------|
| TB1 | Browser ↔ Next.js server | Server action y cookie de sesión |
| TB2 | Next.js server ↔ PostgreSQL | Repositories vía Drizzle |
| TB3 | Next.js server ↔ variables de entorno del proceso | Configuración de despliegue (NODE_ENV, secrets) |

## Análisis STRIDE por componente

### Server action `qaBackdoorLogin` (ui/actions.ts)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Elevation of Privilege | Otorga sesión sin contraseña por diseño | Medium | High | Doble chequeo de `NODE_ENV` (server action Y página `/dev-login`); NO acepta el email como parámetro del cliente (solo lee `process.env.QA_ACCESS_EMAIL` en el borde); test de seguridad dedicado que verifica el rechazo incondicional en producción |
| Spoofing | N/A — no hay identidad de cliente que suplantar (el email no viaja desde el cliente) | — | — | Por diseño, no aplica |
| Tampering | El cliente no puede alterar la decisión de acceso | Low | Low | La decisión depende únicamente de config server-side |
| Repudiation | No hay registro de uso del backdoor | High | Low | Loguear (server-side) cada sesión creada y cada intento rechazado por entorno, sin exponer el token ni el email en texto plano innecesariamente — confirmado con el usuario, se mantiene en Block 6 |
| Information Disclosure | Mensajes de error podrían confirmar si el backdoor está deshabilitado por env faltante vs. producción | Low | Medium | Respuestas de error genéricas |
| DoS | Abuso del endpoint creando sesiones repetidamente | Low | Low | **Riesgo aceptado** — ver sección "Riesgos aceptados" abajo |

### Sesión / cookie (domain/session-service.ts)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Spoofing | Adivinación o fijación del token de sesión | Low | High | `crypto.randomBytes(32)` (≥256 bits), nunca secuencial ni derivado de datos predecibles |
| Tampering | Modificación del valor de la cookie | Low | Medium | La búsqueda de sesión valida contra un hash almacenado; un token alterado no matchea ninguna fila (fail securely) |
| Information Disclosure | Robo del token vía XSS o vía brecha de BD | Low | High | Cookie `httpOnly` (inaccesible por JS) + `sameSite=lax`; en BD se almacena un **hash SHA-256** del token, nunca el valor crudo |
| Elevation of Privilege | Token de sesión robado de la BD permite suplantar al usuario | Low | High | Mismo hash SHA-256 — un dump de la tabla `sesiones` no expone tokens usables directamente |

### Datos en PostgreSQL (usuarios, sesiones)

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Information Disclosure | Exposición del email (PII) o del token (credential) | Low | Medium/High | Ver clasificación y cifrado abajo |
| Tampering | Inyección SQL | Low | Critical | Drizzle ORM (query builder parametrizado), nunca SQL concatenado a mano |

### Variables de entorno

| STRIDE | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| Information Disclosure | `QA_ACCESS_EMAIL` bundleada al cliente si se nombra `NEXT_PUBLIC_*` | Low | Medium | La convención de nombres prohíbe el prefijo `NEXT_PUBLIC_` para esta variable; se lee únicamente en código server-side |
| Information Disclosure | `DATABASE_URL` filtrada en logs o commiteada | Low | Critical | `.env` en `.gitignore` (ya corregido en el bootstrap), nunca loguear la connection string |

## Clasificación de datos sensibles (F-TM-05)

| Dato | Clasificación |
|---|---|
| `usuarios.email` | PII |
| `sesiones.token` (crudo, solo en cookie) | Credential-equivalente |
| `sesiones.token_hash` (almacenado en BD) | Derivado de credential |
| `QA_ACCESS_EMAIL` (env var) | Config sensible |
| `DATABASE_URL` (env var) | Credential |

## Cifrado (F-TM-07)

- **En tránsito:** conexión a PostgreSQL con `sslmode=require` en `DATABASE_URL`; cookie de sesión con `secure: true` cuando `NODE_ENV=production` (el `session-service` se reutilizará para el login real en tickets futuros, aunque el backdoor de QA esté deshabilitado en producción).
- **En reposo:** el token de sesión se persiste como hash SHA-256, nunca en texto plano. El cifrado a nivel de columna del email (PII) se delega a la infraestructura del proveedor de PostgreSQL — asunción documentada, a confirmar antes de manejar usuarios reales (fuera del alcance de FEAT-001a, que solo maneja al usuario de QA).

## Riesgos aceptados

### 1. Exposición de un entorno no productivo (HIGH)

| Campo | Valor |
|---|---|
| Riesgo | Si un entorno no productivo (staging/preview) queda públicamente expuesto en internet sin ningún control de red, cualquiera que conozca la URL y el email de QA configurado podría obtener una sesión sin contraseña. |
| Quién lo acepta | dot.dev.intech@gmail.com (dueño del proyecto) |
| Justificación | Es una decisión de topología de red/infraestructura, fuera del alcance del código de este ticket. Las mitigaciones de aplicación disponibles ya están incorporadas: doble chequeo de `NODE_ENV`, el server action no acepta el email como parámetro del cliente, y hay un test de seguridad dedicado que verifica el rechazo incondicional en producción. |
| Condiciones de revisión | Se revisa cuando se implemente el login real (magic link) y este backdoor quede deprecado/retirado, o cada 6 meses — lo que ocurra primero. |

### 2. Sin rate limiting en el backdoor (LOW)

| Campo | Valor |
|---|---|
| Riesgo | El server action `qaBackdoorLogin` no tiene límite de intentos — alguien podría invocarlo repetidamente para crear sesiones/filas en `sesiones` sin freno. |
| Quién lo acepta | dot.dev.intech@gmail.com (dueño del proyecto) |
| Justificación | Impacto bajo: mecanismo deshabilitado en producción, sin usuarios reales todavía (solo el usuario de QA), y el abuso más costoso posible es crecimiento de filas en una tabla, no una brecha de datos. Agregar rate limiting ahora es complejidad no justificada para este alcance. |
| Condiciones de revisión | Se revisa junto con el riesgo #1 (cuando este backdoor se retire), o antes si se observa abuso real en algún entorno no productivo. |

## Mitigaciones incorporadas al spec

1. Token de sesión: `crypto.randomBytes(32)` + hash SHA-256 antes de persistir en `sesiones.token_hash`.
2. `qaBackdoorLogin` no recibe el email como parámetro; lo lee de `process.env.QA_ACCESS_EMAIL` en el borde (`ui/actions.ts`).
3. Cookie: `httpOnly` + `sameSite=lax` + `secure` condicional a `NODE_ENV=production`.
4. La env var del email nunca se nombra con prefijo `NEXT_PUBLIC_`.
5. Logging de intentos (éxito/rechazo por entorno) sin exponer el token ni el email en texto plano salvo necesidad estricta de debug.
6. `DATABASE_URL` con `sslmode=require`.
7. `pnpm audit` sobre `drizzle-orm`/`drizzle-kit`/`pg` antes de fijar versiones en el lockfile.

## Resumen

Riesgos: C:0 H:1 (mitigado + riesgo residual aceptado #1) M:3 (mitigados) L:4 (3 mitigados, 1 aceptado #2)
Resultado: **PASSED** — todo riesgo identificado tiene mitigación aplicada o aceptación formal con
los 3 campos que exige F-TM-04 (quién, justificación, condición de revisión). Ambas aceptaciones
fueron confirmadas explícitamente por el usuario.
