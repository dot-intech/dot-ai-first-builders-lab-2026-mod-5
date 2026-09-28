# Verificación — FEAT-001b: Registrar consumo a partir de una foto (captura/galería) con análisis de IA

| Campo | Valor |
|---|---|
| Fecha | 2026-09-28 |
| Rama / HEAD | `feat/FEAT-001b-registro-consumo-foto` / `91d0326` (ronda 2) |
| Resultado | **PASSED** — 0 FAIL, 1 WARN (ronda 2), tras un loop correctivo desde CODE |
| Verificador | `daw-module-verifier` (agente que no escribió el código), 2 rondas |
| Referencia | PRD `docs/daw/prd/prd-FEAT-001b.md` (15 AC), spec `docs/daw/specs/spec-FEAT-001b.md` (9 bloques, Spec loops 2), threat model `docs/daw/security/threat-FEAT-001b.md`, SAST `docs/daw/security/sast-FEAT-001b.md` (PASSED), ADR-008, ADR-009 |

## Ronda 1 (HEAD `2277ab4`) — FAILED

### Criterios de aceptación del PRD (F-VER-01)

| AC | Código | Tests | Veredicto |
|---|---|---|---|
| AC-01 | `PantallaInicio` (input `capture="environment"`), `flujo-nuevo-consumo.ts` | `pantallas-nuevo-consumo.test.tsx`, `flujo-nuevo-consumo.test.ts` "imagen-elegida origen camara" | ✅ PASS (cableado input→origen sin test, ver H-1) |
| AC-02 | `consumo-service.ts:guardarConsumo`, `consumo-repository.ts:crearConsumo`, `operaciones-consumo.ts:guardar` | `consumo-service.test.ts`, `operaciones-consumo.test.ts`, `consumo-repository.integration.test.ts` | ✅ PASS |
| AC-03 | `PantallaInicio` (input sin `capture`), reductor | ídem AC-01 + "…origen galeria" | ✅ PASS (mismo H-1) |
| AC-04 | igual que AC-02, origen `galeria` | `consumo-service.test.ts` | ✅ PASS |
| AC-05 | `modelo-vision.ts:analizarConModeloVision` | `modelo-vision.test.ts` (modelo, imagen base64, prompt, responseSchema, abortSignal, sin retryOptions) | ✅ PASS |
| AC-06 | `interpretarRespuestaModelo`, `PantallaRevision` | `modelo-vision.test.ts`, `pantallas-nuevo-consumo.test.tsx`, `procesar-imagen.test.ts` | ✅ PASS (ejemplo pollo/arroz/vino: manual en VERIFY) |
| AC-07 | `consumo-service.ts` (redondeo de calorías), `PantallaRevision` | `consumo-service.test.ts`, `pantallas-nuevo-consumo.test.tsx` | ✅ PASS |
| AC-08 | `rules.ts:normalizarDesglose`, `PantallaRevision` | `rules.test.ts` (mayor resto, 0 kcal→otros:100), `consumo-service.test.ts` | ✅ PASS |
| AC-09 | `PantallaProcesando`, reductor | `pantallas-nuevo-consumo.test.tsx`, `flujo-nuevo-consumo.test.ts` | ✅ PASS |
| AC-10 | mensajes fijos, `operaciones-consumo.ts` (solo `{tipo}`) | `pantallas-nuevo-consumo.test.tsx` (sin gemini/apiKey/inlineData), `modelo-vision.test.ts`, `operaciones-consumo.test.ts` | ✅ PASS |
| AC-11 | reductor `campo-editado`, `PantallaRevision`, `validarDatosConsumo` | `flujo-nuevo-consumo.test.ts`, `rules.test.ts` | ✅ PASS (cableado input→campo sin test, ver H-1) |
| AC-12 | `PantallaRevision` (línea de aviso de estimación) | `pantallas-nuevo-consumo.test.tsx` | ✅ PASS |
| AC-13 | reductor `cancelar`, link/botones Cancelar | `flujo-nuevo-consumo.test.ts`, `pantallas-nuevo-consumo.test.tsx` | ✅ PASS |
| AC-14 | `sesion-consumo.ts`, `operaciones-consumo.ts:guardar`, `consumo-service.ts` | `consumo-service.test.ts`, `sesion-consumo.test.ts`, `page.test.tsx`, `schema.test.ts` (FK cascade) | ✅ PASS |
| AC-15 | reductor `analisis-fallo`/`tiempo-agotado`, `PantallaError`, abort a 25s | `flujo-nuevo-consumo.test.ts`, `modelo-vision.test.ts`, `procesar-imagen.test.ts`, `pantallas-nuevo-consumo.test.tsx` | ✅ PASS |

### Reglas §5

| Regla | Resultado |
|---|---|
| F-VER-01 | ✅ Los 15 AC tienen al menos un test que pasa |
| F-VER-02 | ✅ Los 9 bloques de la spec están implementados |
| F-VER-03 | ❌ **FAIL** — ver H-1 |
| F-VER-04 | ✅ Sad path en toda función con input (salvedad de H-1) |
| F-VER-05 | ✅ `tsc`, `lint`, `prettier` limpios |
| F-VER-06 | ✅ Existen y pasan los "Required tests" de los 9 bloques |
| W-VER-01 | ✅ Sin código muerto |
| W-VER-02 | ✅ Dominio y service al 100% |
| W-VER-03 | ✅ Sin tests frágiles |

### H-1 (FAIL, F-VER-03): `pantallas-nuevo-consumo.tsx` en 69% líneas / 50% branches / 80% funciones

`renderToStaticMarkup` (ADR-008) no dispara eventos, así que 2 closures nunca se ejecutaban en los tests: el mapeo input→origen (`camara`/`galeria`) en `PantallaInicio` y el mapeo input→campo del borrador en `PantallaRevision`. El comportamiento no probado era real (AC-01/AC-02/AC-03/AC-04 y AC-11), no incidental: si se invirtieran los orígenes o se cruzaran dos campos, los 668 tests existentes seguían en verde. `nuevo-consumo.tsx` está exento de cobertura por ADR-008, que lista **exactamente 3 archivos**; `pantallas-nuevo-consumo.tsx` no es uno de ellos.

**Decisión del usuario:** loop correctivo a CODE para agregar los tests faltantes (lectura estricta de F-VER-03, por archivo), en vez de aceptar el WARN con la lectura agregada (99% del proyecto).

### W-1 (WARN, no bloqueante): exclusión `*.integration.test.ts(x)` del guardián sin test propio

La excepción de la regla 1 del guardián de dependencias (Block 9) ya era la versión acotada, pero ningún test fijaba que solo cubre ese patrón y no cualquier `*.test.ts(x)`.

## Loop correctivo (VERIFY→CODE→VERIFY)

Commit `91d0326`: 3 tests nuevos en `pantallas-nuevo-consumo.test.tsx` (invocan los componentes como función, recorren el árbol de `ReactElement` hasta los `<input>` y disparan `onChange` a mano) + 1 test nuevo en `reglas-de-dependencias.test.ts` que acota W-1. Solo archivos de test; SAST re-confirmado trivialmente limpio (sin código de producción en el diff).

## Ronda 2 (HEAD `91d0326`) — PASSED

Re-verificación independiente, sin tomar ningún número de la ronda 1.

| Chequeo | Resultado |
|---|---|
| F-VER-03 Cobertura | ✅ `pantallas-nuevo-consumo.tsx` 100/100/100 (antes 69/50/80). Total del proyecto: 100% líneas (434/434), 100% branches (265/265), 100% funciones (123/123) |
| Mutación (scratchpad) | ✅ 5/5 mutantes de las pantallas detectados por los tests nuevos (invertir origen, sacar el guard de archivo, cruzar campo, ignorar el valor del evento, hardcodear el campo); los 16 tests viejos dejaban pasar los 5. 2/2 mutantes de la regla 1 (W-1) detectados |
| W-1 | ✅ Resuelto y confirmado con mutación |
| F-VER-01 | ✅ Matriz AC→test sin cambios (el commit correctivo no toca producción) |
| F-VER-02 | ✅ 9 bloques implementados |
| F-VER-04 | ✅ Sad paths |
| F-VER-05 | ✅ `tsc`=0, `lint`=0, `prettier` OK |
| F-VER-06 | ✅ Unit 611/611 (33 archivos) + integration 61/61 (5, BD real) = 672/672 con cobertura |
| W-VER-01 | ✅ Sin código muerto |
| W-VER-02 | ✅ Lógica de negocio al 100% |
| W-VER-03 | ⚠️ 1 hallazgo menor nuevo, ver abajo |

### W-2 (WARN, no bloqueante, nuevo en ronda 2): test de "cancelar selección" sin `toHaveLength`

En `pantallas-nuevo-consumo.test.tsx`, el test "no llama a onSeleccionarImagen si se cancela la selección (sin archivo)" no verifica `expect(inputs).toHaveLength(2)` antes de usar `inputs[0]?.props.onChange(...)` (los otros dos tests nuevos sí lo hacen). Si en el futuro los `<input>` de `PantallaInicio` se movieran a un subcomponente, `inputsDe` (que no entra en componentes no nativos) devolvería `[]`, el `?.` saltearía la llamada y el test pasaría sin haber probado nada. Hoy detecta el mutante M2 correctamente. Arreglo sugerido: agregar el `toHaveLength(2)`. No bloqueante — queda como mejora menor para un futuro toque de este archivo, no amerita otro loop correctivo.

## Resumen

Ronda 1: 8 PASS, 1 FAIL (H-1), 1 WARN (W-1). Ronda 2: 10 PASS, 0 FAIL, 1 WARN (W-2, nuevo y menor).

**Resultado final: PASSED.**
