# PRD FEAT-001c: Carga manual y manejo de baja confianza en el registro de consumo por foto

| Field | Value |
|-------|-------|
| Ticket | FEAT-001c |
| Tracker | none |
| Date | 2026-09-23 |
| PRD loops | 0 |

## Contexto y Problema

Esta es la sub-parte `c` de la división de FEAT-001 (ver `docs/daw/prd/prd-FEAT-001.md`). Surgió el
2026-09-23 cuando el control de alcance de DEFINE volvió a dividir FEAT-001b: ese ticket quedó con
el camino feliz (foto → análisis → revisión/edición → guardado) y el mensaje de error ante fallo o
demora del análisis; este cubre lo que el usuario puede hacer cuando el análisis no sale bien —
cargar el consumo a mano tras un error, o tratar una estimación de baja confianza.

Este ticket **depende de FEAT-001b**, que provee el flujo de registro de consumo por foto y el
mensaje de error sobre los que se agregan estos comportamientos.

### Sujetos involucrados

**Usuario QA**: en este ticket, el único usuario del sistema (provisto por FEAT-001a). Quiere poder
registrar su consumo aunque el análisis automático falle o no sea confiable.

## Objetivos

Que el usuario nunca quede bloqueado ni guarde datos poco fiables sin saberlo: si el análisis falla,
puede cargar el consumo a mano; si la estimación es de baja confianza, se le advierte, se le ofrece
cargar otra imagen y se le exige revisar los datos antes de guardar.

## Functional Requirements

- FR-01: Ante un error de procesamiento de imagen, el sistema debe permitir al usuario hacer una
  carga manual de la descripción, cantidad de calorías y desglose nutricional del consumo,
  respetando el formato de desglose de FEAT-001b (4 categorías en porcentajes enteros que suman
  exactamente 100%).
- FR-02: Al desglosar los alimentos detectados en una imagen, el sistema debe advertir al usuario
  cuando la estimación se clasifique como de baja confianza (ver NFR-01).
- FR-03: Ante una estimación de baja confianza, el sistema debe darle al usuario la opción de
  cargar una nueva imagen.
- FR-04: Al desglosar los alimentos detectados en una imagen, el sistema debe exigir al usuario
  editar la descripción y la cantidad de calorías antes de guardar el consumo, cuando la estimación
  se haya clasificado como de baja confianza.
- FR-05: El sistema debe permitirle al usuario cancelar el flujo desde la carga manual y desde la
  advertencia de baja confianza, volviendo al inicio sin guardar ningún dato.

## Non-Functional Requirements

- NFR-01: El nivel aceptable de confianza en la información estimada a partir de la imagen debe
  ser > 70%; caso contrario se clasifica la estimación como de baja confianza.
- NFR-02: La interfaz gráfica debe ser responsiva para dispositivos móviles (iOS y Android) bajo
  resoluciones estándar de pantalla entre 240p y 4K.

## Acceptance Criteria

- AC-01 (FR-01): IF el usuario recibió un mensaje de error al procesar su imagen, THEN THE system
  SHALL permitirle hacer una carga manual de la descripción, cantidad de calorías y desglose
  nutricional, exigiendo que el desglose sume exactamente 100% en las 4 categorías.
- AC-02 (FR-02): IF la estimación se clasifica con un nivel de confianza <= 70%, THEN THE system
  SHALL mostrar al usuario una advertencia de baja confianza.
- AC-03 (FR-03): IF se mostró la advertencia de baja confianza, THEN THE system SHALL darle al
  usuario la opción de cargar una nueva imagen.
- AC-04 (FR-04): IF la estimación se clasifica con un nivel de confianza <= 70%, THEN THE system
  SHALL exigir al usuario editar manualmente la descripción y la cantidad de calorías antes de
  poder guardar el consumo.
- AC-05 (FR-05): WHEN el usuario selecciona "Cancelar" desde la carga manual o desde la advertencia
  de baja confianza, THE system SHALL volver al inicio del flujo sin guardar ningún consumo.

## Out of Scope

- El camino feliz del registro por foto (captura/galería, análisis, revisión/edición, guardado) y
  el mensaje de error ante fallo o demora del análisis — cubiertos por **FEAT-001b**, que se toma
  como dependencia.
- Reintentos automáticos de la consulta al modelo de visión.
- Todo lo que FEAT-001b declara fuera de alcance (login real, tablero, historial, eliminación de
  consumos, cierre de sesión, multi-usuario, internacionalización).

## Risks and Mitigations

- **Riesgo:** el modelo de visión puede no devolver un nivel de confianza utilizable, lo que impide
  clasificar la estimación → *Mitigación:* definir en PLAN de dónde sale el nivel de confianza
  (devuelto por el modelo o calculado por el sistema) y cómo se trata su ausencia.
- **Riesgo:** en la carga manual el usuario puede ingresar un desglose que no suma 100% →
  *Mitigación:* validación que impide guardar hasta que el desglose sume exactamente 100% (AC-01).

## Dependencies

- **FEAT-001b** (registro de consumo por foto): provee el flujo, el mensaje de error, la pantalla de
  revisión y la persistencia sobre los que se agregan la carga manual y el manejo de baja confianza.
  Debe estar mergeado antes de implementar este ticket.
- Google AI Studio, modelo `gemini-3.1-flash-lite`, vía la librería `genai` (heredado de
  FEAT-001b).
