# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Unreleased]

### Added
- [FEAT-001c] Carga manual y manejo de baja confianza en el registro de consumo por foto. Si el
  análisis falla, el usuario puede cargar a mano la descripción, las calorías y el desglose (que debe
  sumar 100; `origen = manual`). El modelo informa su confianza (no se persiste) y con confianza <= 70
  se muestra una advertencia con tres salidas: cargar otra imagen, revisar los datos (guardar exige
  marcar una casilla de confirmación) o cancelar. El guardado es idempotente por `solicitudId`
  (columna `solicitud_id`, índice único `(usuario_id, solicitud_id)` y migración 0002, que también
  admite `'manual'` en el CHECK de `origen`): reintentar no duplica la fila. El guardado se corta a
  los 30 s con aviso y el borrador intacto, y si la sesión vence se avisa antes de ir a iniciar
  sesión. Decisiones en ADR-010.
- [FEAT-001b] Registrar un consumo a partir de una foto (cámara o galería): análisis con el modelo de
  visión de Gemini (`gemini-3.1-flash-lite`, `@google/genai`) que estima descripción, calorías y
  desglose nutricional (carbohidratos/proteínas/grasas/otros, normalizado a que sume 100). El usuario
  revisa y edita el resultado antes de guardar; `/consumos/nuevo` (server component con redirect a
  `/dev-login` sin sesión), tabla `consumos` con sus CHECKs, y 2 reglas nuevas del guardián de
  dependencias (la UI no importa `data`/`shared/db`; código `'use client'` no importa el SDK, `env.ts`
  ni servicios de servidor).
- [FEAT-001a] Acceso directo de QA sin magic link: server action `qaBackdoorLogin` que crea/reutiliza
  un usuario por email configurado (`QA_ACCESS_EMAIL`) y abre una sesión con cookie `httpOnly`,
  restringida a entornos no productivos (allowlist explícita). Sesión con ventana deslizante de 24h
  de inactividad. Página `/dev-login` (404 fuera de los entornos permitidos).

### Changed
- [FEAT-002] La sesión (servicio, repositorios, cookie, errores y reglas) y `RepositoryError` pasan
  de `src/features/qa-access/` a un módulo compartido en `src/shared/` (`sesion/{domain,data,ui}`,
  `errors/`, `db/`), sin cambio de comportamiento. `iniciarSesionQa` pasa a llamarse
  `iniciarSesionParaEmail`. Nuevo `resolverUsuarioDeSesion` como punto de entrada único al usuario de
  la sesión, y test guardián de las reglas de dependencias de la ADR-007 (`shared` no importa de
  `features`, sin imports entre features, sin `'use server'` en `shared`).

### Fixed
- [FIX-003] La pantalla de inicio de "Registrar consumo" ya no se desplaza en horizontal en pantallas
  angostas (240–320 px): `.campo` tiene `max-width: 100%` y el `<input type="file">`, que medía ~327 px,
  se ajusta al ancho. `/dev-login` con sesión activa ofrece enlaces al inicio y a "Registrar consumo".
  Se salda la deuda de ADR-010: el tiempo límite del análisis pasa a `TIEMPO_LIMITE_ANALISIS_MS` en
  `domain/rules.ts`, junto al del guardado, y se elimina el wrapper vacío `despacharEvento`. Sin cambios
  de comportamiento ni de esquema.
- [FIX-001] `docs/daw/specs/spec-FEAT-001a.md` corregida para reflejar las decisiones tomadas durante
  CODE (ADR-001 a ADR-006) y el hallazgo W-2 de la verificación: nombres de función, ubicación de
  `RepositoryError`, dirección de dependencias `data`↔`domain` y archivos/firmas reales de los
  Blocks 5 y 6. Sin cambios de código.
- [FIX-002] El índice de `docs/daw/prd/prd-FEAT-001.md` marca FEAT-001b y FEAT-001c como mergeados
  (PR #4 y #5 ya en `main`). Sin cambios de código.
