# Verificación — FEAT-001c: Carga manual y manejo de baja confianza en el registro de consumo por foto

| Campo | Valor |
|---|---|
| Fecha | 2026-09-30 |
| Rama / HEAD | `feat/FEAT-001c-carga-manual-baja-confianza` / `6099fc1` |
| Resultado | **PASSED** — 0 FAIL, 8 WARN no bloqueantes (7 del verificador automático, 1 de la prueba manual aceptado por el usuario) |
| Verificador | `daw-module-verifier` (agente que no escribió el código), 1 ronda, más prueba manual del usuario guiada por el agente principal |
| Referencia | PRD `docs/daw/prd/prd-FEAT-001c.md` (8 AC, 3 NFR), spec `docs/daw/specs/spec-FEAT-001c.md` (7 bloques), threat model `docs/daw/security/threat-FEAT-001c.md`, SAST `docs/daw/security/sast-FEAT-001c.md` (PASSED), ADR-008, ADR-009, ADR-010 |

## Criterios de aceptación del PRD (F-VER-01)

La trazabilidad sigue la tabla "Required tests" de cada bloque de la spec. Las filas de tests son los archivos que la spec asigna a cada AC; el verificador no reportó ningún AC sin test.

| AC | Código | Tests | Prueba manual | Veredicto |
|---|---|---|---|---|
| AC-01 | `flujo-nuevo-consumo.ts` (`error` + `carga-manual`), `PantallaError`, `PantallaRevision` (`esManual`), `rules.ts` (validación del desglose) | `flujo-nuevo-consumo.test.ts`, `pantallas-nuevo-consumo.test.tsx`, `consumo-service.test.ts` | ✅ Desde un error real de Gemini: "Cargar manualmente", bloqueo por campos vacíos, guardado con suma 100 (`origen = manual`) | ✅ PASS |
| AC-02 | `rules.ts:esBajaConfianza` (umbral 70), `modelo-vision.ts`, reductor (`analisis-ok` → `baja-confianza`) | `rules.test.ts` (70 → baja, 71 → no), `modelo-vision.test.ts`, `consumo-service.test.ts`, `flujo-nuevo-consumo.test.ts` | ✅ Apareció la advertencia | ✅ PASS |
| AC-03 | `PantallaBajaConfianza` ("Cargar otra imagen"), reductor `cargar-otra-imagen` | `pantallas-nuevo-consumo.test.tsx`, `flujo-nuevo-consumo.test.ts` | no ejecutada | ✅ PASS |
| AC-04 | `PantallaRevision` (casilla), reductor (`requiereConfirmacion`, `confirmado`, aviso `confirmar-revision`) | `flujo-nuevo-consumo.test.ts`, `pantallas-nuevo-consumo.test.tsx` | ✅ Guardar sin la casilla fue rechazado con mensaje; con la casilla, sin cambiar valores, guardó | ✅ PASS |
| AC-05 | reductor `cancelar` desde `baja-confianza` y carga manual | `flujo-nuevo-consumo.test.ts`, `pantallas-nuevo-consumo.test.tsx` | ✅ El usuario canceló y volvió al inicio (sin detalle de cuál de los dos caminos; ver Observaciones) | ✅ PASS |
| AC-06 | `solicitud_id` + índice único `(usuario_id, solicitud_id)` (migración 0002), repository idempotente, `solicitudId` en el payload | `schema.integration.test.ts`, `consumo-repository.integration.test.ts`, `consumo-service.test.ts`, `operaciones-consumo.test.ts`, `rules.test.ts` | ✅ Reintento tras red cortada: una sola fila. Caso duro con Postgres pausado: el servidor guardó tras el corte, el reintento con el mismo `solicitudId` respondió ok sin duplicar (4 filas antes y después) | ✅ PASS |
| AC-07 | `TIEMPO_LIMITE_GUARDADO_MS = 30_000`, temporizador en `nuevo-consumo.tsx`, reductor `guardado-tiempo-agotado` | `rules.test.ts`, `flujo-nuevo-consumo.test.ts`, `procesar-imagen.test.ts` | ✅ Con Postgres pausado, el aviso salió a los 30 s con el borrador intacto; el reintento funcionó | ✅ PASS |
| AC-08 | `procesar-imagen.ts` (`sin-sesion` con `solicitudId`), reductor, `PantallaSesionVencida` | `procesar-imagen.test.ts`, `flujo-nuevo-consumo.test.ts`, `pantallas-nuevo-consumo.test.tsx` | ✅ Cookie borrada: "Tu sesión venció", nada guardado (BD sin cambios), el botón lleva a `/dev-login` | ✅ PASS |

### Requisitos no funcionales

| NFR | Veredicto | Evidencia |
|---|---|---|
| NFR-01 (umbral 70 y normalización de la confianza) | ✅ PASS | `UMBRAL_CONFIANZA = 70` única fuente; `rules.test.ts` fija 70/71, `normalizarConfianza` con NaN/Infinity/fuera de rango |
| NFR-02 (responsiva 240p–4K) | ⚠️ WARN | Ver W-8: scroll horizontal en `PantallaInicio` en pantallas angostas. El resto de las pantallas se vio bien en 426×240, 360×640 y 3840×2160 según el usuario |
| NFR-03 (corte del guardado a los 30 s) | ✅ PASS | Constante fijada por test; comprobado en navegador (AC-07) |

## Reglas §5

| Regla | Resultado |
|---|---|
| F-VER-01 | ✅ Los 8 AC tienen al menos un test que pasa |
| F-VER-02 | ✅ Los 7 bloques de la spec están implementados (commits `0740df7` … `6099fc1`) |
| F-VER-03 | ✅ Cobertura 100 % en los 38 archivos medidos; `nuevo-consumo.tsx` sigue excluido por ADR-008 (W-7) |
| F-VER-04 | ✅ Sad path en las funciones con input |
| F-VER-05 | ✅ `tsc`, `lint` y `prettier` limpios |
| F-VER-06 | ✅ Existen y pasan los "Required tests" de los bloques |
| W-VER-01 | ⚠️ W-1 y W-3 (código sobrante) |
| W-VER-02 | ✅ Dominio y service al 100 % |
| W-VER-03 | ⚠️ W-4 y W-5 (tests frágiles) |

Cifras del cierre de CODE (en el estado de DAW): 776 tests (708 unit + 68 integration), cobertura 100 %, SAST PASSED. El verificador no reportó discrepancias.

## WARN (todos no bloqueantes)

1. **`despacharEvento` es un wrapper vacío** en `nuevo-consumo.tsx`.
2. **`TIEMPO_LIMITE_MS` duplica los 30 s:** vive local en `ui/nuevo-consumo.tsx` y en `domain/rules.ts` como `TIEMPO_LIMITE_GUARDADO_MS`.
3. **`validarSolicitudId` se exporta sin consumidores** fuera de `rules.ts`.
4. **El test de clics de `PantallaBajaConfianza` mapea botón → callback por índice:** intercambiar las etiquetas no fallaría.
5. **`vi.fn()` compartidos a nivel de módulo** en `pantallas-nuevo-consumo.test.tsx` (hoy nadie asserta sobre ellos).
6. **Gap de la spec:** la línea 274 lista `registro-consumo.test.ts`, que solo prueba el logger. El caso "sin `solicitudId`" está en `consumo-service.test.ts` y `operaciones-consumo.test.ts`. `actions.test.ts` solo recibió el campo en el fixture: ningún test recorre la action de punta a punta hasta `datos-invalidos`.
7. **El 100 % no incluye `nuevo-consumo.tsx`** (exclusión de ADR-008). Lo que vive ahí (temporizador de 30 s, `randomUUID` de la carga manual, `router.refresh()` de "Iniciar sesión", `guardadoDisparadoRef`) quedó cubierto solo por la prueba manual de este reporte.
8. **Scroll horizontal en `PantallaInicio` (NFR-02).** Hallazgo de la prueba manual: en pantallas angostas la pantalla de elegir foto o galería desborda horizontalmente porque el texto no hace wrap. La pantalla es de FEAT-001b (en este ticket solo cambió el tipo de una prop) pero el NFR-02 alcanza a toda la interfaz. Causa probable, sin confirmar en el DOM: `.campo` en `nuevo-consumo.module.css` solo fija `min-height` y `font-size`, sin `max-width: 100%`, y el `<input type="file">` tiene un ancho intrínseco. La verificación de FEAT-001b no registra ninguna prueba a 240p. **Decisión del usuario (2026-09-30): aceptado como WARN**, no se vuelve a CODE.

Observación adicional del verificador: un `sin-sesion` tardío con el mismo id llevaría a `sesion-vencida` un reintento en vuelo; ADR-010 solo menciona `guardado-fallo`. Es coherente con lo aceptado.

## Observaciones de la prueba manual (no son WARN de este ticket)

- Un análisis cancelado por el usuario igual consume una llamada a Gemini (con costo): el cliente no puede abortar una Server Action ya enviada.
- El rechazo por sesión vencida no deja un evento propio en el log del servidor, solo el POST. La spec no lo exige.
- `/dev-login` ("Conectado como …") no tiene ningún enlace para volver al inicio. Es una página de FEAT-001a/002, fuera del alcance de este ticket.
- La carga manual acepta calorías 0 con la descripción "nada". La spec no define un mínimo.
- En AC-05 el usuario confirmó que cancelar funcionó, sin precisar si fue desde la advertencia, desde la carga manual o desde ambas. El reductor está cubierto por test para los dos caminos.
- Un primer análisis de Gemini falló con `reason: fallo` (transitorio del proveedor, sin causa visible en los logs a propósito). Se usó para probar la carga manual; el siguiente análisis respondió bien.

## Prueba manual (spec "Final verification", punto 3)

Entorno: `pnpm dev` contra la BD efímera `nutrashot-postgres-test` (migración 0002 aplicada), Gemini real, acceso por `/dev-login`. Las pruebas de timeout y de reintento duro se hicieron pausando el contenedor con `docker pause` y reanudándolo con `docker unpause` para dejar la petición colgada, porque con DevTools en Offline el navegador falla al instante y nunca dispara el temporizador de 30 s.

| Escenario | Resultado |
|---|---|
| (a) Foto borrosa → advertencia → "Revisar datos" → guardar bloqueado hasta marcar la casilla | ✅ PASS (AC-02, AC-04) |
| Cancelar durante el análisis | ✅ PASS (vuelve a `inicio`, sin filas nuevas) |
| (b) Error de análisis → "Cargar manualmente" → guardar con suma 100 | ✅ PASS (AC-01) |
| (c) Red cortada al guardar, luego reintento | ✅ PASS, una sola fila (AC-06) |
| (c, caso duro) Servidor guarda tras el corte y el cliente reintenta con el mismo `solicitudId` | ✅ PASS, 4 filas antes y después, sin duplicado (AC-06) |
| (d) Guardado sin respuesta | ✅ PASS, aviso a los 30 s con el borrador intacto (AC-07, NFR-03) |
| (e) Sesión vencida | ✅ PASS (AC-08) |
| (f) Responsive a 426×240, 360×640 y 3840×2160 | ⚠️ WARN (W-8) |
| Cancelar desde la advertencia o la carga manual | ✅ PASS (AC-05), ver Observaciones |

## Evidencia TDD por bloque

El verificador no vio el ciclo rojo-verde; queda registrada la evidencia del agente implementador.

| Bloque | Evidencia |
|---|---|
| B1 (BD: `solicitud_id`, índice único, origen manual, migración 0002) | 11 unit + 4 integración en rojo por aserción |
| B2 (idempotencia en dominio y repository) | 13 unit + 3 integración en rojo; `errors.test.ts` pasó antes por ser solo de tipo |
| B3 (`solicitudId` en el payload) | 3 rojos; el sad path "guardar que rechaza" fue guard de regresión |
| B4 (confianza del modelo) | 28 rojos; sad paths de timeout, fallo, no-configurado y propagación de `AnalisisImagenError` fueron guards |
| B5 (pantallas nuevas) | **Débil:** los tests de las pantallas nuevas solo fallaron por import faltante; 2 tests de avisos sí por aserción. El usuario aceptó el WARN |
| B6 (reductor y contenedor) | 39 rojos por aserción, sin stubs (Vitest no chequea tipos); guards declarados (`cancelar` en varios estados, evento desconocido, etc.) |
| B7 (ADR-010 y notas en ADR-008/009) | Documentación; antes no existía ADR-010 |

## Deuda diferida fuera de este ticket

Decisión del usuario (2026-09-30): la deuda de W-1 y W-2 (unificar `TIEMPO_LIMITE_MS` con `TIEMPO_LIMITE_GUARDADO_MS` y quitar `despacharEvento`) **no** vuelve a CODE, porque no cambia el comportamiento; se abre como ticket aparte. Conviene incluir en ese mismo ticket, o en uno vecino, el arreglo de CSS de W-8 y la observación de `/dev-login`.

## Resumen

Sin ronda correctiva. 8 AC y 3 NFR evaluados: 10 PASS, 0 FAIL, 1 WARN de NFR (NFR-02, W-8), más 7 WARN del verificador automático.

**Resultado final: PASSED.**
