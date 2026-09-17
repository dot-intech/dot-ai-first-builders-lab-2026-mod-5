# PRD-001: NutraShot — Registro dietario asistido por fotografía

## Contexto y Problema
Cuando queremos llevar un registro diario de lo que comemos y las calorías ingeridas en cada comida, el hacerlo nosotros manualmente anotando las comidas y cantidades y calculando a partir de eso las calorías se torna tedioso rápidamente, lo que hace que muchas veces abandonemos el registro y no podamos hacer un buen seguimiento dietario, indispensable para controlar nuestro peso o tratar problemas de salud. Para solucionar esta situación es necesaria una aplicación web que nos permita cargar fácil y rápidamente lo que comemos a partir de una foto del plato, y se encargue de identificar, describir y contabilizar los alimentos, permitiendo guardar un registro diario de lo que consumimos y las calorias asociadas, de manera de poder identificar si estamos cumpliendo nuestras metas dietarias.

### Sujetos involucrados
**Usuarios**: Cada usuario es una persona que quiere utilizar la aplicación para monitorear su ingesta calórica diaria. Su necesidad principal es registrar la información nutricional de sus comidas de manera fácil y rápida, utilizando la cámara de su teléfono celular para fotografiar su plato antes de empezar a comer.

## Objetivos
Que la aplicación lleve un registro claro y ordenado de los alimentos consumidos a lo largo del tiempo, permitiendo a los usuarios ingresar esta información de manera rápida y sencilla utilizando la cámara del celular para sacar una foto del plato antes de empezar a comer. A partir de la foto la aplicación se encarga de identificar los alimentos (y bebidas) y calcular las calorías que se van a consumir, permite al usuario revisar y editar esta información y al confirmar guarda un registro con todos estos datos en una base de datos persistente, que el usuario luego puede consultar para visualizar la información. La acción de ingresar un nuevo consumo a partir de la foto debe ser algo rápido para el usuario, y la demora entre cargar la foto y ver la información estimada del consumo no debería llevar más de 10 segundos de interacción. El usuario podrá ver de manera fácil y clara su consumo de calorías diario y un breve historial de los consumos cargados a lo largo del tiempo.

## Requerimientos Funcionales
- RF-01: El sistema debe exigir autenticación al usuario antes de permitir el uso de la aplicación.
- RF-02: Antes de que el usuario se autentique, el sistema sólo debe mostrarle la pantalla de inicio de sesión con el nombre, el logo de la aplicación y la opción de "Obtener link de acceso".
- RF-03: El sistema debe permitir al usuario iniciar sesión únicamente mediante un link de acceso (magic link) recibido vía mail al ingresar a la opción "Obtener link de acceso".
- RF-03a: El sistema debe crear automáticamente una cuenta de usuario asociada al email la primera vez que se solicita un link de acceso para ese email, sin requerir un paso de registro separado.
- RF-03b: En entornos no productivos, el sistema puede habilitar un mecanismo de acceso directo sin envío de magic link para una única dirección de email de QA, configurada explícitamente por variable de entorno. Este mecanismo debe permanecer inhabilitado incondicionalmente cuando `NODE_ENV=production`, sin depender únicamente de que la variable no esté configurada.
- RF-04: Luego de autenticarse, el sistema debe mostrar al usuario un tablero principal con un saludo de bienvenida.
- RF-05: El tablero principal debe mostrar una sección con un gráfico de dona que represente el total de calorías consumidas por el usuario en el día actual y su desglose nutricional agregado en las 4 categorías [Carbohidratos, Proteínas, Grasas, Otros Nutrientes], calculado a partir de la suma de los consumos registrados ese día.
- RF-06: El tablero principal debe mostrar una sección de acciones con las siguientes opciones: [Nuevo, Historial, Cerrar Sesión].
- RF-07: La opción "Nuevo" debe permitirle al usuario agregar un nuevo consumo a su registro dietario a partir de una foto tomada en el momento.
- RF-08: El sistema debe registrar el consumo resultante de una foto tomada en el momento en la bitácora de consumos diarios del usuario.
- RF-09: La opción "Nuevo" debe permitirle al usuario agregar un nuevo consumo a su registro dietario a partir de una imagen preexistente en la galería.
- RF-10: El sistema debe registrar el consumo resultante de una imagen de galería en la bitácora de consumos diarios del usuario.
- RF-11: Al registrar un nuevo consumo, el sistema debe analizar la imagen provista por el usuario consultando internamente un modelo de visión a través de la API de Google AI Studio, enviándole la imagen y un prompt con los datos necesarios a extraer.
- RF-12: El sistema debe mostrar una descripción amigable, breve y concisa de los alimentos identificados en la imagen analizada, mencionando también la bebida si está presente.
- RF-13: El sistema debe mostrar la cantidad de calorías estimada a partir del análisis de la imagen.
- RF-14: El sistema debe mostrar el desglose nutricional de las calorías estimadas en las siguientes 4 categorías [Carbohidratos, Proteínas, Grasas, Otros Nutrientes], expresado en porcentajes sin decimales cuya suma sea exactamente 100%.
- RF-15: La opción "Historial" debe permitirle al usuario visualizar una pantalla con un resumen de sus propios consumos cargados a lo largo del tiempo, mostrando fecha, hora y cantidad de calorías.
- RF-16: La opción "Historial" debe presentar la información separada de manera jerárquica por semanas, meses y años, ordenada de la más reciente a la más antigua.
- RF-17: La opción "Cerrar Sesión" debe cerrar la sesión actual previa confirmación del usuario.
- RF-18: Mientras el sistema procesa la imagen, debe mostrar al usuario un indicador gráfico de que se está procesando.
- RF-19: El sistema debe ocultar al usuario los detalles técnicos de la consulta al modelo de visión (endpoint, payload, nombre del modelo).
- RF-20: El sistema debe mostrar un mensaje de error cuando no se pueda procesar la imagen, ya sea por error interno o por demora superior a los 30 segundos (ver RNF-04).
- RF-21: Ante un error de procesamiento de imagen, el sistema debe permitir al usuario hacer una carga manual de la descripción, cantidad de calorías y desglose nutricional del consumo, respetando el mismo formato de desglose exigido en RF-14.
- RF-22: Luego de mostrar la información obtenida a partir de una imagen, el sistema debe permitirle al usuario editar estos datos antes de guardarlos en el registro de consumo.
- RF-23: Luego de guardar un nuevo registro de consumo, el sistema debe redirigir al usuario a la pantalla del tablero principal.
- RF-24: El sistema debe actualizar el gráfico de dona del tablero principal instantáneamente luego de guardar un nuevo registro de consumo.
- RF-25: Al desglosar los alimentos detectados en una imagen, el sistema debe recordar al usuario que la información puede ser inexacta.
- RF-26: Al desglosar los alimentos detectados en una imagen, el sistema debe advertir al usuario cuando la estimación se clasifique como de baja confianza (ver RNF-03).
- RF-27: Ante una estimación de baja confianza, el sistema debe darle al usuario la opción de cargar una nueva imagen.
- RF-28: Al desglosar los alimentos detectados en una imagen, el sistema debe exigir al usuario editar la descripción y la cantidad de calorías antes de guardar el consumo, cuando la estimación se haya clasificado como de baja confianza (ver RNF-03).
- RF-29: La opción "Historial" debe permitirle al usuario eliminar cualquiera de sus propios consumos que se está visualizando por pantalla.
- RF-30: Antes de eliminar un consumo, el sistema debe pedir confirmación al usuario.
- RF-31: El sistema debe advertir al usuario que la eliminación de un consumo es una acción irreversible.
- RF-32: El sistema debe garantizar que un usuario autenticado sólo pueda visualizar, editar o eliminar los consumos asociados a su propia cuenta.
- RF-33: El sistema debe presentar toda la interfaz de usuario y las descripciones de alimentos generadas por el modelo de visión en Español (Latinoamérica).
- RF-34: El link de acceso debe ser de un solo uso: una vez utilizado para iniciar sesión, el sistema debe invalidarlo y rechazar cualquier intento posterior de utilizarlo (ver RF-03).
- RF-35: El sistema debe permitirle al usuario cancelar la creación de un nuevo consumo en cualquier paso del flujo y volver al tablero principal sin guardar ningún dato.

## Requerimientos No Funcionales
- RNF-01: La validez del link de acceso será de 15 minutos, luego de los cuales el mismo expirará y se deberá obtener un nuevo link de acceso para poder iniciar sesión.
- RNF-02: El procesamiento de la imágen desde la carga hasta la visualización de los datos estimados debe concretarse en < 10 s (p95) en condiciones normales de una red 4G, asumiendo disponibilidad plena del servicio de Google AI Studio — el sistema no puede garantizar este umbral si Gemini devuelve errores transitorios de sobrecarga (HTTP 503/429).
- RNF-03: El nivel aceptable de confianza en la información estimada a partir de la imagen del consumo debe ser > 70%, caso contrario se clasifica la estimación como de baja confianza.
- RNF-04: El tiempo máximo de procesamiento de la imágen debe ser <= 30s.
- RNF-05: La interfaz gráfica debe ser responsiva para dispositivos móviles (iOS y Android) bajo resoluciones estándar de pantalla entre 240p y 4K, con un tiempo de carga inicial (First Contentful Paint) < 3 s (p95) en conexión 4G.
- RNF-06: la sesión expira tras 24 horas de inactividad.
- RNF-07: Por motivos de privacidad y seguridad de la información, las imágenes provistas por el usuario nunca se persisten del lado del backend: 0 persistencia de imágenes provistas por el usuario.

## Criterios de Aceptación
- AC-01 (RF-01): Dado un usuario sin una sesión vigente en el sistema, cuando el usuario intenta usar la aplicación, entonces el sistema lo redirige a la pantalla de inicio de sesión.
- AC-02 (RF-02): Dado un usuario que ingresa a la pantalla de inicio de sesión, cuando el usuario no se encuentra autenticado, entonces el sistema sólamente muestra el nombre y el logo de la aplicación, y la opción "Obtener link de acceso".
- AC-03 (RF-03): Dado un usuario sin una sesión vigente en el sistema, cuando el usuario ingresa a la opción "Obtener link de acceso" de la pantalla de inicio de sesión, entonces el sistema le pide ingresar su dirección de email y luego le envía un email con un link de acceso que le permite ingresar directamente a la aplicación al utilizarlo.
- AC-03a (RF-03a): Dado un email que nunca solicitó un link de acceso previamente, cuando ese email solicita por primera vez la opción "Obtener link de acceso", entonces el sistema crea automáticamente una cuenta de usuario asociada a ese email, sin pedirle al usuario ningún paso de registro adicional.
- AC-03b (RF-03b): Dado un entorno no productivo (`NODE_ENV` distinto de `production`) con una dirección de email de QA configurada por variable de entorno, cuando esa dirección solicita la opción "Obtener link de acceso", entonces el sistema le otorga acceso directo a la aplicación sin enviar ni exigir un magic link por email.
- AC-03c (RF-03b): Dado un entorno productivo (`NODE_ENV=production`), cuando se solicita la opción "Obtener link de acceso" con la dirección de email de QA, entonces el sistema exige el flujo normal de magic link por email, sin excepción alguna.
- AC-04 (RF-04): Dado un usuario que está intentando iniciar sesión en la aplicación, cuando el usuario inicia sesión exitosamente, entonces el sistema lo redirige al tablero principal donde ve un saludo de bienvenida.
- AC-05 (RF-05): Dado un usuario autenticado que ve el tablero principal, cuando el tablero se carga, entonces el sistema muestra un gráfico de dona con el total de calorías consumidas en el día actual y su desglose nutricional agregado en las 4 categorías [Carbohidratos, Proteínas, Grasas, Otros Nutrientes], expresado en porcentajes sin decimales cuya suma es exactamente 100%.
- AC-06 (RF-06): Dado un usuario autenticado que ve el tablero principal, cuando el tablero se carga, entonces el sistema muestra una sección de acciones con las opciones [Nuevo, Historial, Cerrar Sesión].
- AC-07 (RF-07): Dado un usuario que está registrando un nuevo consumo, cuando el usuario elige la opcion "Nuevo" y toma una foto con el dispositivo actual, entonces el sistema le permite al usuario agregar un nuevo consumo a su registro dietario a partir de esa foto.
- AC-08 (RF-08): Dado un usuario que acaba de agregar un nuevo consumo a partir de una foto, cuando el sistema confirma el registro, entonces el consumo queda guardado en la bitácora de consumos diarios del usuario.
- AC-09 (RF-09): Dado un usuario que está registrando un nuevo consumo, cuando el usuario elige la opcion "Nuevo" y selecciona una imagen preexistente en la galería del dispositivo actual, entonces el sistema le permite al usuario agregar un nuevo consumo a su registro dietario a partir de esa imagen.
- AC-10 (RF-10): Dado un usuario que acaba de agregar un nuevo consumo a partir de una imagen de galería, cuando el sistema confirma el registro, entonces el consumo queda guardado en la bitácora de consumos diarios del usuario.
- AC-11 (RF-11): Dado un usuario que provee una imagen para un nuevo consumo, cuando el sistema procesa la solicitud, entonces analiza la imagen consultando internamente un modelo de visión a través de la API de Google AI Studio, enviándole la imagen y un prompt con los datos necesarios a extraer.
- AC-12 (RF-12): Dado un usuario que está registrando un nuevo consumo, cuando el sistema termina de analizar la imagen, entonces muestra por pantalla una descripción de texto no vacía que hace referencia a los alimentos identificados y, si existe, a la bebida detectada.
- AC-13 (RF-13): Dado un usuario que está registrando un nuevo consumo, cuando el sistema termina de analizar la imagen, entonces muestra la cantidad de calorías estimada.
- AC-14 (RF-14): Dado un usuario que está registrando un nuevo consumo, cuando el sistema termina de analizar la imagen, entonces muestra el desglose nutricional en las 4 categorías [Carbohidratos, Proteínas, Grasas, Otros Nutrientes] en porcentajes sin decimales cuya suma es exactamente 100%.
- AC-15 (RF-15): Dado un usuario que quiere ver su registro de consumos, cuando el usuario ingresa a la opción "Historial", entonces el sistema muestra una pantalla con todos los consumos propios de ese usuario cargados a lo largo del tiempo, mostrando fecha, hora y cantidad de calorías, sin incluir consumos de otros usuarios.
- AC-16 (RF-16): Dado un usuario que ha ingresado en la opción "Historial", cuando el usuario scrollea en el listado de consumos, entonces el sistema muestra el registro de consumos ordenado por fecha y hora en forma descendente, separado jerárquicamente por semanas, meses y años.
- AC-17 (RF-17): Dado un usuario que está visualizando la pantalla principal, cuando el usuario selecciona la opción de "Cerrar sesión", entonces el sistema le pide confirmación y si el usuario confirma entonces se finaliza la sesión activa del usuario y lo redirige a la pantalla de inicio de sesión.
- AC-18 (RF-18): Dado un usuario que está creando un nuevo registro de consumo a partir de una imagen, cuando el usuario selecciona la imagen y acepta, entonces el sistema le muestra un indicador gráfico de que se está procesando la imagen.
- AC-19 (RF-19): Dado un usuario que está creando un nuevo registro de consumo a partir de una imagen, cuando el sistema consulta internamente el modelo de visión, entonces oculta en la interfaz los detalles técnicos de esa consulta (endpoint, payload, nombre del modelo).
- AC-20 (RF-20): Dado un usuario que está creando un nuevo registro de consumo a partir de una imágen, cuando el sistema tarda más de 30 segundos o falla al procesar la imagen, entonces el sistema muestra un mensaje de error al usuario.
- AC-21 (RF-21): Dado un usuario que recibió un mensaje de error al procesar su imagen, cuando el usuario continúa, entonces el sistema le permite hacer una carga manual de la descripción, cantidad de calorías y desglose nutricional del consumo, exigiendo que el desglose sume exactamente 100% en las 4 categorías.
- AC-22 (RF-22): Dado un usuario que está creando un nuevo registro de consumo a partir de una imagen, cuando el sistema ha procesado la imagen y está mostrando la información de ingredientes, calorías y desglose nutricional, entonces el sistema permite al usuario editar estos datos antes de guardarlos en el registro de consumo.
- AC-23 (RF-23): Dado un usuario que está creando un nuevo registro de consumo, cuando el usuario confirma y guarda el nuevo registro de consumo, entonces el sistema lo redirige a la pantalla del tablero principal.
- AC-24 (RF-24): Dado un usuario que está creando un nuevo registro de consumo, cuando el usuario confirma y guarda el nuevo registro de consumo, entonces el sistema actualiza el gráfico de dona del tablero principal instantáneamente, mostrando el total de calorías y el desglose nutricional actualizados con el nuevo consumo incluido.
- AC-25 (RF-25): Dado un usuario que está creando un nuevo registro de consumo a partir de una imagen, cuando el sistema ha procesado la imagen y está mostrando la información de ingredientes, calorías y desglose nutricional, entonces el sistema agrega una línea de texto debajo recordando al usuario que la información obtenida puede ser inexacta.
- AC-26 (RF-26): Dado un usuario que está creando un nuevo registro de consumo a partir de una imagen, cuando el sistema clasifica la estimación como de baja confianza, entonces el sistema muestra al usuario una advertencia de que la estimación tiene baja confianza.
- AC-27 (RF-27): Dado un usuario que recibió una advertencia de baja confianza, cuando el usuario continúa, entonces el sistema le da la opción de cargar una nueva imagen.
- AC-28 (RF-28): Dado un usuario que está creando un nuevo registro de consumo a partir de una imagen, cuando el sistema ha estimado los alimentos en la imagen con un nivel de confianza de 70% o menos, entonces el sistema carga la información estimada pero obliga al usuario a editar manualmente la descripción y la cantidad de calorías del consumo.
- AC-29 (RF-29): Dado un usuario que ha ingresado en la opción "Historial", cuando el usuario intenta eliminar cualquiera de sus propios consumos que se está visualizando por pantalla, entonces el sistema inicia el proceso de eliminación de ese consumo.
- AC-30 (RF-30): Dado un usuario que intenta eliminar uno de sus consumos, cuando inicia la eliminación, entonces el sistema le pide confirmación antes de eliminar el dato, y sólo lo elimina si el usuario confirma.
- AC-31 (RF-31): Dado un usuario que intenta eliminar uno de sus consumos, cuando el sistema le pide confirmación, entonces también le muestra una advertencia de que la acción es irreversible.
- AC-32 (RF-32): Dado un usuario autenticado, cuando el usuario intenta visualizar, editar o eliminar un consumo que pertenece a otro usuario (por ejemplo, manipulando directamente la URL o el identificador del consumo), entonces el sistema deniega el acceso y no expone esos datos.
- AC-33 (RF-33): Dado un usuario que interactúa con la aplicación, cuando visualiza cualquier pantalla o la descripción de alimentos generada por el modelo de visión, entonces el sistema muestra el contenido en Español (Latinoamérica).
- AC-34 (RF-34): Dado un link de acceso que ya fue utilizado para iniciar sesión, cuando el usuario intenta utilizarlo nuevamente, entonces el sistema rechaza el intento y le indica que debe solicitar un nuevo link de acceso.
- AC-35 (RNF-01): Dado un link de acceso con más de 15 minutos desde su emisión, cuando el usuario intenta utilizarlo, entonces el sistema rechaza el intento y le indica que debe solicitar un nuevo link de acceso.
- AC-36 (RNF-06): Dado un usuario autenticado sin actividad durante 24 horas continuas, cuando el usuario intenta realizar cualquier acción en la aplicación, entonces el sistema le exige volver a autenticarse mediante un nuevo link de acceso.
- AC-37 (RNF-07): Dado un consumo registrado a partir de una imagen, cuando el sistema termina de procesarla (ya sea con éxito o con error), entonces no queda ninguna copia de la imagen original persistida en el backend (almacenamiento en disco, base de datos o logs).
- AC-38 (RF-35): Dado un usuario que está creando un nuevo registro de consumo, cuando el usuario selecciona la opción "Cancelar" en cualquier paso del flujo (selección de imagen, error de procesamiento, carga manual, o revisión de la estimación), entonces el sistema lo redirige al tablero principal sin guardar ningún consumo.

> **Nota (RF-12):** El siguiente caso es un ejemplo ilustrativo del comportamiento esperado, no un AC binario formal, ya que depende de la salida no determinística del modelo de visión. Se valida mediante revisión manual de QA, no mediante test automatizado: dado un plato con una pechuga de pollo asada, arroz y un vaso de vino tinto, cuando el usuario toma la fotografía y presiona enviar, se espera que el sistema muestre una descripción amigable que mencione los tres componentes identificados (pollo, arroz y vino tinto).

## Fuera de Alcance
- Metas de consumo diario / semanal de calorías.
- Registro y Login de usuario por contraseña.
- Historiales de métricas semanales o mensuales en formato de gráficas avanzadas.
- Exportacion o importación de datos del usuario.
- Eliminación de cuenta y/o datos del usuario.
- Planes de suscripción, pasarelas de pago o perfiles multiusuario.
- RBAC configurable / más de un rol de usuario
- Multi-tenant
- Soporte multi-idioma: la aplicación funciona únicamente en Español (Latinoamérica); agregar Inglés u otros idiomas queda fuera de esta versión.

## Riesgos y Dependencias
- **Riesgo:** El sistema puede fallar al identificar un ingrediente poco común o mal iluminado → *Mitigación:* Se agregará un aviso indicando que los valores son estimaciones aproximadas (RF-25); además, si la confianza de la estimación es menor o igual al 70% (RNF-03), el sistema advierte al usuario, le ofrece recargar la imagen (RF-26/RF-27) y exige revisión manual antes de guardar (RF-28).
- **Riesgo:** El analisis de la imagen puede demorar más tiempo del esperado por problemas de red o imposibilidad de consultar internamente la API del modelo de visión → *Mitigación:* Se mostrará un mensaje de error temporal indicando que no se puede procesar la imágen en este momento y se le permitirá al usuario realizar una carga manual del consumo especificando la descripción de los alimentos y la cantidad de calorías.
- **Riesgo:** El usuario puede denegar el permiso de cámara o galería del dispositivo, impidiendo cargar una foto → *Mitigación:* El sistema mostrará un mensaje explicando que el permiso es necesario y cómo habilitarlo desde la configuración del dispositivo.
- **Riesgo:** El email con el link de acceso puede demorar en llegar o ser filtrado como spam, dejando al usuario sin poder loguearse dentro de la ventana de 15 minutos (RNF-01) → *Mitigación:* Se usará un proveedor de email transaccional confiable y se le indicará al usuario revisar la carpeta de spam.
- **Dependencia:** Conexión obligatoria a internet y particularmente a la API del modelo de visión (a través de Google AI Studio, modelo gemini-3.1-flash-lite).
- **Dependencia:** Next.js 15 (App Router) para el frontend y backend del proyecto (fullstack en un solo código base), corriendo sobre Node.js 20 LTS.
- **Dependencia:** PostgreSQL para la base de datos que persistirá la información (tablas: usuarios, consumos).
