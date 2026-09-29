# PRD FEAT-001c: Carga manual y manejo de baja confianza en el registro de consumo por foto

| Field | Value |
|-------|-------|
| Ticket | FEAT-001c |
| Tracker | none |
| Date | 2026-09-23 |
| PRD loops | 1 |

## Contexto y Problema

Esta es la sub-parte `c` de la división de FEAT-001 (ver `docs/daw/prd/prd-FEAT-001.md`). Surgió el
2026-09-23 cuando el control de alcance de DEFINE volvió a dividir FEAT-001b: ese ticket quedó con
el camino feliz (foto → análisis → revisión/edición → guardado) y el mensaje de error ante fallo o
demora del análisis; este cubre lo que el usuario puede hacer cuando el análisis no sale bien —
cargar el consumo a mano tras un error, o tratar una estimación de baja confianza.

Este ticket **depende de FEAT-001b**, que provee el flujo de registro de consumo por foto y el
mensaje de error sobre los que se agregan estos comportamientos. FEAT-001b ya está mergeado a `main`
(PR #4).

**Ampliación del 2026-09-29 (PRD loop 1).** El code-review del PR #4 dejó tres huecos de robustez
de severidad baja en el flujo de guardado de FEAT-001b, que se incorporan a este ticket por decisión
del usuario: (1) reintentar un guardado que falló por red después de que el servidor ya había
insertado el consumo crea un consumo duplicado; (2) el estado "guardando" no tiene tiempo máximo ni
forma de cancelar, y el usuario queda colgado y pierde lo que editó; (3) si la sesión vence durante
la revisión o el guardado, el flujo vuelve al inicio y descarta lo editado sin avisar.

### Sujetos involucrados

**Usuario QA**: en este ticket, el único usuario del sistema (provisto por FEAT-001a). Quiere poder
registrar su consumo aunque el análisis automático falle o no sea confiable, y que un guardado con
problemas de red o de sesión no lo deje colgado, duplique su consumo ni pierda lo que cargó sin
avisarle.

## Objetivos

Que el usuario nunca quede bloqueado ni guarde datos poco fiables sin saberlo: si el análisis falla,
puede cargar el consumo a mano; si la estimación es de baja confianza, se le advierte, se le ofrece
cargar otra imagen y se le exige confirmar explícitamente los datos antes de guardar. Además, que el
guardado sea robusto ante fallas de red y de sesión: sin consumos duplicados, sin quedar colgado y
sin perder datos en silencio.

## Functional Requirements

- FR-01: Ante un error de procesamiento de imagen, el sistema debe permitir al usuario hacer una
  carga manual de la descripción, cantidad de calorías y desglose nutricional del consumo,
  respetando el formato de desglose de FEAT-001b (4 categorías en porcentajes enteros que suman
  exactamente 100%).
- FR-02: Al desglosar los alimentos detectados en una imagen, el sistema debe advertir al usuario
  cuando la estimación se clasifique como de baja confianza (ver NFR-01).
- FR-03: Ante una estimación de baja confianza, el sistema debe darle al usuario la opción de
  cargar una nueva imagen.
- FR-04: Ante una estimación de baja confianza, el sistema debe mostrar la descripción y la cantidad
  de calorías como editables y exigir que el usuario confirme explícitamente los datos antes de
  guardar el consumo. No se exige que los valores cambien: alcanza con que el usuario tenga la
  posibilidad de editarlos y los confirme.
- FR-05: El sistema debe permitirle al usuario cancelar el flujo desde la carga manual y desde la
  advertencia de baja confianza, volviendo al inicio sin guardar ningún dato.
- FR-06: El sistema debe garantizar que un mismo intento de registro de consumo genere como máximo un
  consumo guardado, aunque el usuario reintente el guardado después de un fallo de red.
- FR-07: El sistema debe salir del estado de guardado cuando el guardado no responde dentro del
  tiempo máximo (ver NFR-03), informando el error y permitiendo al usuario reintentar o cancelar sin
  perder los datos que editó.
- FR-08: El sistema debe informar al usuario que su sesión venció cuando eso ocurra durante la
  revisión o el guardado del consumo, antes de llevarlo a iniciar sesión.

## Non-Functional Requirements

- NFR-01: El nivel aceptable de confianza en la información estimada a partir de la imagen debe
  ser > 70%; caso contrario se clasifica la estimación como de baja confianza.
- NFR-02: La interfaz gráfica debe ser responsiva para dispositivos móviles (iOS y Android) bajo
  resoluciones estándar de pantalla entre 240p y 4K.
- NFR-03: El guardado de un consumo debe cortarse a los 30 s sin respuesta *(supuesto: se toma el
  mismo tiempo máximo que FEAT-001b fija para el procesamiento del análisis; confirmar en la
  aprobación)*.

## Acceptance Criteria

- AC-01 (FR-01): IF el usuario recibió un mensaje de error al procesar su imagen, THEN THE system
  SHALL permitirle hacer una carga manual de la descripción, cantidad de calorías y desglose
  nutricional, exigiendo que el desglose sume exactamente 100% en las 4 categorías.
- AC-02 (FR-02): IF la estimación se clasifica con un nivel de confianza <= 70%, THEN THE system
  SHALL mostrar al usuario una advertencia de baja confianza.
- AC-03 (FR-03): IF se mostró la advertencia de baja confianza, THEN THE system SHALL darle al
  usuario la opción de cargar una nueva imagen.
- AC-04 (FR-04): IF la estimación se clasifica con un nivel de confianza <= 70%, THEN THE system
  SHALL mostrar la descripción y la cantidad de calorías como editables y SHALL NOT permitir guardar
  el consumo hasta que el usuario lo confirme explícitamente, aceptando la confirmación aunque el
  usuario no haya modificado ningún valor.
- AC-05 (FR-05): WHEN el usuario selecciona "Cancelar" desde la carga manual o desde la advertencia
  de baja confianza, THE system SHALL volver al inicio del flujo sin guardar ningún consumo.
- AC-06 (FR-06): IF el guardado de un consumo falla del lado del usuario (sin respuesta) después de
  que el servidor ya lo insertó, THEN THE system SHALL, ante el reintento del mismo registro,
  conservar una única fila de ese consumo en la base de datos.
- AC-07 (FR-07): IF el guardado no responde dentro de 30 s, THEN THE system SHALL salir del estado
  de guardado, mostrar un mensaje de error y ofrecer las opciones de reintentar y cancelar,
  conservando los datos editados hasta que el usuario cancele.
- AC-08 (FR-08): IF la sesión vence mientras el usuario revisa o guarda un consumo, THEN THE system
  SHALL mostrar un mensaje indicando que la sesión venció antes de llevar al usuario a iniciar
  sesión.

## Out of Scope

- El camino feliz del registro por foto (captura/galería, análisis, revisión/edición, guardado) y
  el mensaje de error ante fallo o demora del análisis — cubiertos por **FEAT-001b**, que se toma
  como dependencia. Este ticket solo toca del camino feliz lo listado en FR-06, FR-07 y FR-08.
- Conservar los datos editados a través del inicio de sesión: si la sesión vence, el usuario es
  informado (FR-08) pero el borrador no se recupera al volver a iniciar sesión *(supuesto: confirmar
  en la aprobación)*.
- Reintentos automáticos de la consulta al modelo de visión.
- Todo lo que FEAT-001b declara fuera de alcance (login real, tablero, historial, eliminación de
  consumos, cierre de sesión, multi-usuario, internacionalización).

## Risks and Mitigations

- **Riesgo:** el modelo de visión puede no devolver un nivel de confianza utilizable, lo que impide
  clasificar la estimación → *Mitigación:* definir en PLAN de dónde sale el nivel de confianza
  (devuelto por el modelo o calculado por el sistema) y cómo se trata su ausencia. Hoy el adaptador
  de FEAT-001b no lo pide ni lo devuelve.
- **Riesgo:** en la carga manual el usuario puede ingresar un desglose que no suma 100% →
  *Mitigación:* validación que impide guardar hasta que el desglose sume exactamente 100% (AC-01).
- **Riesgo:** garantizar un único consumo por intento (FR-06) puede requerir un identificador de
  intento y una restricción de unicidad en la tabla `consumos`, es decir, un cambio de esquema →
  *Mitigación:* definir en PLAN el mecanismo, con una migración aditiva (nunca destructiva) y sin
  romper los consumos ya guardados.
- **Riesgo:** un reintento tras el corte a los 30 s (FR-07) es justo el caso que produce duplicados
  → *Mitigación:* FR-06 y FR-07 se implementan y prueban juntos; AC-06 cubre el reintento posterior
  a un corte por tiempo.

## Dependencies

- **FEAT-001b** (registro de consumo por foto): provee el flujo, el mensaje de error, la pantalla de
  revisión, el estado de guardado, la resolución de sesión y la persistencia (tabla `consumos`)
  sobre los que se agregan la carga manual, el manejo de baja confianza y las mejoras de robustez del
  guardado. Ya mergeado a `main` (PR #4).
- Google AI Studio, modelo `gemini-3.1-flash-lite`, vía la librería `genai` (heredado de
  FEAT-001b).
