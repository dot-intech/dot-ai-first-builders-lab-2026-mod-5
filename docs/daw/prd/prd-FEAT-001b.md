# PRD FEAT-001b: Registrar consumo a partir de una foto (captura/galería) con análisis de IA

| Field | Value |
|-------|-------|
| Ticket | FEAT-001b |
| Tracker | none |
| Date | 2026-09-23 |
| PRD loops | 0 |

## Contexto y Problema

Esta es la sub-parte `b` de la división de FEAT-001 (ver `docs/daw/prd/prd-FEAT-001.md`): el camino
feliz del flujo por el que un usuario registra un consumo a partir de una foto de su plato —
capturada en el momento o elegida de la galería — analizada con un modelo de visión, revisada/editada
por el usuario y guardada en la base de datos.

Este ticket **depende de FEAT-001a** (acceso directo de QA), que provee el usuario de sesión activa
al que se asocian los consumos. No implementa login, ni tablero principal, ni historial — esos
quedan para tickets futuros de NutraShot.

El 2026-09-23, el control de alcance de DEFINE detectó que la versión anterior de este PRD (19
criterios de aceptación) era demasiado grande y se volvió a dividir: la carga manual ante un error
de análisis y el flujo de baja confianza pasaron a **FEAT-001c**, que depende de este ticket. El
mensaje de error ante fallo o demora del análisis se queda aquí, para que el flujo nunca falle en
silencio.

### Sujetos involucrados

**Usuario QA**: en este ticket, el único usuario del sistema (provisto por FEAT-001a). Quiere
registrar rápidamente lo que consume a partir de una foto de su plato.

## Objetivos

Que un usuario pueda, desde una única pantalla, capturar o subir una foto de su plato, ver cómo el
sistema la analiza con un modelo de visión, revisar la descripción de los alimentos identificados,
la estimación de calorías y el desglose nutricional, corregir esos datos si lo necesita, y guardar
el consumo resultante — quedando asociado al usuario de la sesión activa en la base de datos.

## Functional Requirements

- FR-01: El sistema debe permitirle al usuario agregar un nuevo consumo a partir de una foto tomada
  en el momento con la cámara del dispositivo.
- FR-02: El sistema debe registrar el consumo resultante de una foto tomada en el momento en la
  bitácora de consumos del usuario de la sesión activa.
- FR-03: El sistema debe permitirle al usuario agregar un nuevo consumo a partir de una imagen
  preexistente en la galería del dispositivo.
- FR-04: El sistema debe registrar el consumo resultante de una imagen de galería en la bitácora de
  consumos del usuario de la sesión activa.
- FR-05: Al registrar un nuevo consumo, el sistema debe analizar la imagen consultando internamente
  un modelo de visión a través de la API de Google AI Studio (`gemini-3.1-flash-lite`),
  enviándole la imagen y un prompt con los datos necesarios a extraer.
- FR-06: El sistema debe mostrar una descripción amigable, breve y concisa de los alimentos
  identificados en la imagen, mencionando también la bebida si está presente.
- FR-07: El sistema debe mostrar la cantidad de calorías estimada a partir del análisis de la
  imagen.
- FR-08: El sistema debe mostrar el desglose nutricional de las calorías estimadas en las 4
  categorías [Carbohidratos, Proteínas, Grasas, Otros Nutrientes], expresado en porcentajes enteros
  cuya suma sea exactamente 100%.
- FR-09: Mientras el sistema procesa la imagen, debe mostrar al usuario un indicador gráfico de que
  se está procesando.
- FR-10: El sistema debe ocultar al usuario los detalles técnicos de la consulta al modelo de
  visión (endpoint, payload, nombre del modelo).
- FR-11: Luego de mostrar la información obtenida a partir de una imagen, el sistema debe
  permitirle al usuario editar estos datos antes de guardarlos en el registro de consumo.
- FR-12: Al desglosar los alimentos detectados en una imagen, el sistema debe recordar al usuario
  que la información puede ser inexacta.
- FR-13: El sistema debe permitirle al usuario cancelar la creación de un nuevo consumo en
  cualquier paso del flujo y volver al inicio sin guardar ningún dato.
- FR-14: El sistema debe asociar cada consumo guardado al usuario de la sesión activa (provista por
  FEAT-001a).
- FR-15: El sistema debe mostrar un mensaje de error cuando no se pueda procesar la imagen, ya sea
  por error interno o por demora superior a los 30 segundos (ver NFR-02).

## Non-Functional Requirements

- NFR-01: El procesamiento de la imagen desde la carga hasta la visualización de los datos
  estimados debe concretarse en < 10 s (p95) en condiciones normales de una red 4G, asumiendo
  disponibilidad plena del servicio de Google AI Studio.
- NFR-02: El tiempo máximo de procesamiento de la imagen debe ser <= 30 s.
- NFR-03: La interfaz gráfica debe ser responsiva para dispositivos móviles (iOS y Android) bajo
  resoluciones estándar de pantalla entre 240p y 4K.
- NFR-04: Las imágenes provistas por el usuario nunca se persisten del lado del backend (0
  persistencia: ni en disco, ni en base de datos, ni en logs).

## Acceptance Criteria

- AC-01 (FR-01): WHEN el usuario toma una foto con la cámara del dispositivo y confirma, THE
  system SHALL permitirle agregar un nuevo consumo a partir de esa foto.
- AC-02 (FR-02): WHEN se confirma el registro de un consumo generado a partir de una foto tomada
  en el momento, THE system SHALL guardarlo en la bitácora de consumos del usuario de la sesión
  activa.
- AC-03 (FR-03): WHEN el usuario selecciona una imagen preexistente de la galería y confirma, THE
  system SHALL permitirle agregar un nuevo consumo a partir de esa imagen.
- AC-04 (FR-04): WHEN se confirma el registro de un consumo generado a partir de una imagen de
  galería, THE system SHALL guardarlo en la bitácora de consumos del usuario de la sesión activa.
- AC-05 (FR-05): WHEN el usuario provee una imagen para un nuevo consumo, THE system SHALL
  analizarla consultando internamente el modelo de visión de Google AI Studio
  (`gemini-3.1-flash-lite`), enviándole la imagen y un prompt con los datos necesarios a extraer.
- AC-06 (FR-06): WHEN el sistema termina de analizar la imagen, THE system SHALL mostrar una
  descripción de texto no vacía que haga referencia a los alimentos identificados y, si existe, a
  la bebida detectada.
- AC-07 (FR-07): WHEN el sistema termina de analizar la imagen, THE system SHALL mostrar la
  cantidad de calorías estimada.
- AC-08 (FR-08): WHEN el sistema termina de analizar la imagen, THE system SHALL mostrar el
  desglose nutricional en las 4 categorías [Carbohidratos, Proteínas, Grasas, Otros Nutrientes] en
  porcentajes enteros cuya suma sea exactamente 100%.
- AC-09 (FR-09): WHILE el sistema procesa una imagen, THE system SHALL mostrar un indicador
  gráfico de procesamiento.
- AC-10 (FR-10): WHEN el sistema consulta internamente el modelo de visión, THE system SHALL
  ocultar en la interfaz los detalles técnicos de esa consulta (endpoint, payload, nombre del
  modelo).
- AC-11 (FR-11): WHEN el sistema muestra la información de ingredientes, calorías y desglose
  nutricional estimados, THE system SHALL permitir al usuario editar estos datos antes de
  guardarlos.
- AC-12 (FR-12): WHEN el sistema muestra la información estimada a partir de una imagen, THE
  system SHALL agregar una línea de texto recordando que la información puede ser inexacta.
- AC-13 (FR-13): WHEN el usuario selecciona "Cancelar" en cualquier paso del flujo (selección de
  imagen, procesamiento, mensaje de error, o revisión de la estimación), THE system SHALL volver al
  inicio del flujo sin guardar ningún consumo.
- AC-14 (FR-14): WHEN se guarda un nuevo consumo, THE system SHALL asociarlo al usuario de la
  sesión activa.
- AC-15 (FR-15): IF el sistema tarda más de 30 segundos o falla al procesar la imagen, THEN THE
  system SHALL mostrar un mensaje de error al usuario.

> **Nota (AC-06):** el caso de un plato con pechuga de pollo, arroz y una copa de vino tinto, donde
> se espera que la descripción mencione los tres componentes, es un ejemplo ilustrativo (ya
> documentado en `docs/daw/prd/PRD.md`), no un AC binario automatizable — depende de la salida no
> determinística del modelo de visión y se valida por revisión manual de QA.

## Out of Scope

- Carga manual del consumo ante un error de análisis, y advertencia / recarga / edición obligatoria
  ante estimaciones de baja confianza — cubiertos por **FEAT-001c**.
- Mecanismo de acceso directo de QA y esquema base de usuarios — cubiertos por **FEAT-001a**, que
  se toma como dependencia.
- Login real por magic link, pantalla de login y su expiración (RF-01, RF-02, RF-03, RF-03a,
  RNF-01 del PRD general).
- Expiración de sesión por inactividad de 24 h (RNF-06 del PRD general) — ya cubierta en FEAT-001a.
- Tablero principal, saludo de bienvenida y gráfico de dona con desglose diario (RF-04, RF-05,
  RF-06, RF-23, RF-24 del PRD general).
- Historial de consumos y su navegación jerárquica por semana/mes/año (RF-15, RF-16 del PRD
  general).
- Eliminación de consumos (RF-29, RF-30, RF-31 del PRD general).
- Cierre de sesión (RF-17 del PRD general).
- Verificación de propiedad multi-usuario (RF-32 del PRD general) — se implementa cuando exista más
  de un usuario real en el sistema.
- Internacionalización: toda la interfaz y las descripciones se presentan en español
  (Latinoamérica), sin soporte de otros idiomas.

## Risks and Mitigations

- **Riesgo:** el modelo de visión puede fallar al identificar un ingrediente poco común o mal
  iluminado → *Mitigación:* aviso de que los valores son estimaciones aproximadas (FR-12) y edición
  de los datos antes de guardar (FR-11). El tratamiento de las estimaciones de baja confianza queda
  en FEAT-001c.
- **Riesgo:** el análisis de la imagen puede fallar o demorar más de lo esperado por problemas de
  red o por no poder consultar la API del modelo de visión → *Mitigación:* el procesamiento se
  corta a los 30 s (NFR-02), se muestra un mensaje de error (FR-15) y el usuario puede cancelar el
  flujo (FR-13). La carga manual como alternativa queda en FEAT-001c.
- **Riesgo:** el usuario puede denegar el permiso de cámara o galería del dispositivo → *Mitigación:*
  mensaje explicando que el permiso es necesario y cómo habilitarlo desde la configuración del
  dispositivo.

## Dependencies

- **FEAT-001a** (acceso directo de QA): provee el usuario de la sesión activa al que se asocian los
  consumos (FR-14). Ya mergeado a main.
- Next.js 15 (App Router), Node.js 20 LTS — fullstack en un solo código base.
- PostgreSQL para persistir consumos (con FK al usuario provisto por FEAT-001a).
- Google AI Studio, modelo `gemini-3.1-flash-lite`, vía la librería `genai`.
- Conexión a internet obligatoria, particularmente a la API del modelo de visión.
