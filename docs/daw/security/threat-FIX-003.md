# Threat Model — FIX-003: Deuda de ADR-010, CSS de PantallaInicio y enlace en /dev-login

| Campo | Valor |
|---|---|
| Fecha | 2026-10-02 |
| Ticket | FIX-003 |
| Diseño analizado | `docs/daw/specs/fix-FIX-003.md` (3 cambios independientes: CSS, constantes/wrapper del flujo de nuevo consumo, enlaces en `/dev-login`) |
| Resultado | **PASSED** |

## Superficies de ataque identificadas

Tres cambios, ninguno agrega entrada de usuario, endpoints, datos persistidos ni dependencias:

1. **`.campo { max-width: 100% }`** (`ui/nuevo-consumo.module.css`): solo presentación. Sin superficie.
2. **Mover `TIEMPO_LIMITE_MS` a `domain/rules.ts` como `TIEMPO_LIMITE_ANALISIS_MS` y quitar el wrapper
   `despacharEvento`** (`ui/nuevo-consumo.tsx`): refactor sin cambio de comportamiento. Los temporizadores
   de 30 s (análisis y guardado) son una defensa de disponibilidad del cliente (NFR-02 de FEAT-001b,
   NFR-03 de FEAT-001c); la superficie es que el refactor los altere por error (valor, limpieza del
   `setTimeout`, ids de solicitud).
3. **Enlaces `next/link` a `/` y `/consumos/nuevo` en el estado "conectada" de `/dev-login`**
   (`app/dev-login/page.tsx`): agrega navegación a una página que ya existe y que ya está detrás de
   `esEntornoPermitidoParaAccesoQa(env.nodeEnv)` (404 en producción). Las rutas de destino son literales
   estáticos; no se construye ningún enlace con datos del usuario ni del `searchParams`.

## Fronteras de confianza (F-TM-02)

Ninguna nueva. Las que atraviesan estos componentes ya están declaradas y no cambian:
navegador → servidor (`/dev-login`, `/consumos/nuevo`; la sesión se valida en el servidor con la cookie
HttpOnly, FEAT-001a/FEAT-002) y navegador → server actions (`analizarFotoConsumo`, `guardarNuevoConsumo`;
el `solicitudId` y la idempotencia, ADR-010). El fix no mueve lógica entre cliente y servidor.

## Análisis STRIDE (F-TM-01)

| Componente | S | T | R | I | D | E |
|---|---|---|---|---|---|---|
| `.campo` (CSS) | No | No | No | No | No | No — sin lógica |
| `nuevo-consumo.tsx` / `domain/rules.ts` (constantes, wrapper) | No — la identidad sigue saliendo de la sesión del servidor | No — el cliente ya es no confiable; el servidor revalida | No — no cambia el log de eventos | No — no toca datos | Ver riesgo R-1 | No |
| `dev-login/page.tsx` (enlaces) | No — no cambia cómo se obtiene la sesión | No — enlaces estáticos | No | No — el email mostrado ya estaba; los enlaces no agregan datos | No — no agrega trabajo del servidor | No — los destinos exigen sesión por sí mismos (`/consumos/nuevo` redirige a `/dev-login` sin sesión) |

## Datos sensibles (F-TM-05, F-TM-07)

El único dato que toca el diseño es el email de la sesión que `/dev-login` ya muestra (PII de QA, entorno no
productivo). No se agrega, no se persiste ni se transmite nada nuevo; el transporte y el almacenamiento de la
sesión (cookie HttpOnly con `secure` según el entorno, token hasheado en la BD) no cambian. Las fotos
siguen sin persistirse (NFR-04 de FEAT-001b). No hay credenciales nuevas.

## Riesgos

| Riesgo | Categoría | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R-1 🟢 LOW — el refactor de constantes cambia por error el tiempo límite (o deja un `setTimeout` sin limpiar) y el cliente espera más de 30 s o dispara un guardado/análisis duplicado | Denial of Service (cliente) | Baja | Bajo — es un temporizador de la UI; el servidor sigue idempotente por `(usuario_id, solicitud_id)` (ADR-010) | Un test fija ambos valores en `rules.test.ts` (`TIEMPO_LIMITE_ANALISIS_MS` y `TIEMPO_LIMITE_GUARDADO_MS` valen `30_000`); `tsc` rompe cualquier referencia sin migrar; el diff de `nuevo-consumo.tsx` se limita a sustituir nombres y se revisa contra los efectos existentes, que no se tocan |
| R-2 🟢 LOW — los enlaces nuevos de `/dev-login` exponen en producción una navegación hacia rutas internas | Information Disclosure | Muy baja | Bajo | `/dev-login` responde 404 fuera de los entornos permitidos (capa independiente de la server action, `dev-login-page.test.tsx`); los destinos ya son públicos en `src/app/page.tsx` y exigen sesión |
| R-3 🟢 LOW — un enlace construido con valores del usuario permitiría open redirect o XSS | Tampering | Muy baja | Medio | Los `href` son literales (`/`, `/consumos/nuevo`); React escapa el resto; no se leen `searchParams` para armar enlaces |
| R-4 🟢 LOW — `max-width: 100%` en `.campo` altera el layout de otros controles que usen la clase (inputs de la revisión) | Denial of Service (usabilidad) | Baja | Bajo | El impact scan lista cada uso de `estilos.campo`; el ancho de esos controles sigue acotado por `.contenedor` (`max-width: 32rem`). No es un riesgo de seguridad; se deja por trazabilidad de la regresión visual |

Ningún riesgo CRITICAL o HIGH. Ninguno requiere aceptación formal (F-TM-04).

## Dependencias (W-TM-01) y disponibilidad (W-TM-02)

Sin dependencias nuevas (`next/link` ya se usa en `src/app/page.tsx`). El análisis de disponibilidad es R-1:
el servicio de visión (Google AI Studio) y su costo no cambian; este ticket no agrega llamadas.

## Mitigaciones a incorporar al fix-plan

1. Test de `rules.test.ts` para `TIEMPO_LIMITE_ANALISIS_MS` (mismo patrón que el del guardado).
2. Test de `dev-login-page.test.tsx` que verifique los `href` literales de los enlaces en el estado
   "conectada", y que los demás estados siguen sin ellos (o con ellos, según lo decida el plan) y que el
   404 fuera de entornos permitidos no cambia.
3. Verificación visual del desborde (Chromium, 240/280/320/360 px) en CODE y VERIFY.

## Veredicto

**PASSED.** `gates.threat = true`.
