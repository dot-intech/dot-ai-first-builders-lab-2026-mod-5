# Verificación FIX-003: Deuda de ADR-010, CSS de PantallaInicio y enlace en /dev-login

| Field | Value |
|-------|-------|
| Ticket | FIX-003 |
| Tier | FIX |
| Fix-plan | `docs/daw/specs/fix-FIX-003.md` |
| RCA | `docs/daw/specs/rca-FIX-003.md` |
| Implementación | commit `c87dab2` |
| Fecha | 2026-10-02 |
| Rondas | 1 |
| Result | **PASSED** (0 FAIL, 4 WARN no bloqueantes) |

## Resultados por regla

| ID | Chequeo | Resultado |
|---|---|---|
| F-VER-02 | Los 8 pasos del fix-plan están implementados, sin código de más ni de menos | ✅ PASS — verificado por `daw-module-verifier` (agente que no escribió el código) con evidencia `archivo:línea` por paso |
| F-VER-06 | Los tests listados en el fix-plan existen y pasan | ✅ PASS — `rules.test.ts` (`TIEMPO_LIMITE_ANALISIS_MS` vale `30_000`) y `dev-login-page.test.tsx` (enlaces en `conectada`; sin `href=` en `sin sesión` y `error`) |
| Regresión (FIX) | El test de regresión reproduce el defecto: falla antes y pasa después | ✅ PASS — ver "Test de regresión del desborde" y "Evidencia de test primero" |
| F-VER-03 | Cobertura ≥ 80% líneas, ramas y funciones | ✅ PASS — suite completa: 100% sentencias (478/478), ramas (309/309), funciones (133/133) y líneas (472/472). `nuevo-consumo.tsx` sigue excluido por ADR-008 |
| F-VER-04 | Camino triste de cada función con entrada | ✅ PASS — el cambio no agrega funciones con entrada; los estados `sin sesión` y `error` de `/dev-login` conservan sus tests |
| F-VER-05 | Lint y type checker sin errores | ✅ PASS — `tsc --noEmit`, `eslint .` y `prettier --check .` limpios |
| Sin regresión | Suite completa | ✅ PASS — 780/780 (712 unit + 68 integración) |
| Threat model | Mitigaciones de `threat-FIX-003.md` aplicadas | ✅ PASS — `href` literales, sin lectura de `searchParams`, 404 fuera de los entornos permitidos intacto |
| SAST (CODE) | `docs/daw/security/sast-FIX-003.md` | ✅ PASSED, 0 vulnerabilidades |
| ADR-010 | Nota de resolución correcta, texto original conservado | ✅ PASS |
| W-VER-01 / W-VER-03 | Código muerto, imports sin uso, tests frágiles | ✅ Sin hallazgos |

## Test de regresión del desborde

Chromium headless (el de Playwright), `iframe` del ancho indicado, con el **CSS real** de
`nuevo-consumo.module.css` (versión de `HEAD` antes del fix vs. la modificada) y el marcado de
`PantallaInicio`:

| Viewport | `scrollWidth` antes | `scrollWidth` después |
|---|---|---|
| 240 px | 327 (desborda) | 240 |
| 280 px | 327 (desborda) | 280 |
| 320 px | 327 (desborda) | 320 |
| 360 px | 360 | 360 |

Esta tabla es un modelo del CSS y del marcado. La comprobación sobre la aplicación real está en la
sección siguiente.

## Prueba en la aplicación real (Chromium)

Dos copias de la app con `next dev`: una en el commit previo al fix (`3f9c912`, en un `git worktree`
temporal) y otra con el fix (`c87dab2`), ambas contra la BD de test (`DATABASE_URL` apuntando a
`TEST_DATABASE_URL`) y **sin `GEMINI_API_KEY`**, para no generar costo. Chromium headless conducido por
CDP con emulación de pantalla móvil. Se inició sesión con el botón real de `/dev-login` (server action).

**`PantallaInicio` (`/consumos/nuevo`), `scrollWidth` / `clientWidth`:**

| Viewport | Antes del fix | Con el fix |
|---|---|---|
| 240 px | 327 / 240 (desborda) | 240 / 240 |
| 280 px | 327 / 280 (desborda) | 280 / 280 |
| 320 px | 327 / 320 (desborda) | 320 / 320 |
| 360 px | 360 / 360 | 360 / 360 |
| 412 px | 412 / 412 | 412 / 412 |

Las capturas a 240 px confirman el efecto visual: antes el texto "No file chosen" sobresalía del
viewport; con el fix el input se ajusta al ancho y el nombre del archivo se trunca ("No fi…osen").

**`/dev-login` con sesión activa:**

| | Antes del fix | Con el fix |
|---|---|---|
| Texto | `Conectado como qa@nutrashot.com` | `Conectado como qa@nutrashot.com`, `Ir al inicio`, `Registrar consumo` |
| Enlaces | ninguno | `/` y `/consumos/nuevo` |

Clic real en "Registrar consumo" → `/consumos/nuevo` (h1 "Registrar consumo"); clic real en "Ir al
inicio" → `/` (h1 "NutraShot"). Sin sesión, la página sigue mostrando solo el botón "Ingresar como QA".

No se ejercitó el análisis de la foto ni el guardado: el cambio no toca esa lógica y hacerlo exigiría la
clave de Gemini (con costo). Los temporizadores de 30 s, que sí se tocaron (solo renombres), quedan
respaldados por `tsc`, ESLint y la revisión del diff por el verificador.

## Evidencia de test primero

Antes de implementar se corrieron `rules.test.ts` y `dev-login-page.test.tsx` y fallaron 2 tests:
`TIEMPO_LIMITE_ANALISIS_MS` devolvía `undefined` y la página `conectada` no contenía `href="/"`. Los dos
tests de "sin enlaces" ya pasaban: son guardas de no regresión.

## WARNINGs (no bloquean)

1. **El fix-plan cuenta mal los usos de `despacharEvento`.** El paso 4 dice 13 y el diff reemplaza 15;
   además llama "dependencia del hook" a la línea 126, que era `.then(despacharEvento)` del guardado
   (las dependencias del hook son `[estado]` y no cambiaron). Imprecisión del documento, no del código.
2. **El paso 3 del fix-plan no menciona el `type EventoFlujo`** del import, que debía eliminarse por
   quedar sin uso (se eliminó).
3. **La sección Tests del fix-plan dice que los tests del paso 7 "fallan antes del fix"**, y eso solo
   vale para el de `conectada`; los de `sin sesión` y `error` son guardas que pasan antes y después.
4. **La comprobación del desborde no es un test automático** (el CSS no se ejercita en `node`, ADR-008).
   Se ejecutó dos veces (modelo y aplicación real) y queda registrada aquí, pero una regresión futura
   del CSS no la detectaría ningún test de la suite.

## Archivos modificados

- `src/features/consumos/ui/nuevo-consumo.module.css`
- `src/features/consumos/domain/rules.ts` y `rules.test.ts`
- `src/features/consumos/ui/nuevo-consumo.tsx`
- `src/app/dev-login/page.tsx` y `dev-login-page.test.tsx`
- `docs/adr/adr-010-idempotencia-y-confianza-del-modelo.md`
- `docs/daw/security/sast-FIX-003.md`

**Resultado final: PASSED.** `gates.verify = true`.
