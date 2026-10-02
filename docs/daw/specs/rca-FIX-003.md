# RCA FIX-003: Deuda de ADR-010, CSS de PantallaInicio y enlace en /dev-login

| Field | Value |
|-------|-------|
| Ticket | FIX-003 |
| Fecha | 2026-10-02 |
| Componentes afectados | `src/features/consumos/ui/nuevo-consumo.tsx`, `src/features/consumos/ui/nuevo-consumo.module.css`, `src/app/dev-login/page.tsx` (y sus tests) |
| PRD relacionado | `prd-FEAT-001b.md` (NFR-03), `prd-FEAT-001c.md` (NFR-02, NFR-03), `prd-FEAT-002.md` (FR-08, AC-10) — sin gap bloqueante |

Los tres puntos nacieron de la verificación de FEAT-001c (ver `docs/daw/reports/`) y de la prueba manual de
FEAT-002. No comparten archivos ni causa, pero se agrupan en un solo ticket por decisión del usuario.

## Punto 1: desborde horizontal en `PantallaInicio` (defecto)

**Síntoma.** En pantallas angostas, la pantalla de inicio de "Registrar consumo" se desplaza en horizontal
(WARN 8 de la verificación de FEAT-001c, aceptado entonces por el usuario). Contradice NFR-02 de
FEAT-001c / NFR-03 de FEAT-001b: la interfaz debe ser responsiva entre 240p y 4K.

**Causa raíz (confirmada).** La clase `.campo` de `nuevo-consumo.module.css` fija `min-height` y
`font-size`, pero no limita el ancho. `PantallaInicio` la aplica a dos `<input type="file">`, y un input de
archivo tiene un ancho intrínseco de unos 327 px (botón nativo + nombre del archivo) que no se encoge con
el contenedor (`.contenedor` es `width: 100%` con `padding: 1rem`). En cuanto el viewport es menor que
ese ancho intrínseco, el contenido lo desborda.

**Reproducción.** Chromium headless (el de Playwright, ya instalado) con un `iframe` del ancho indicado,
el mismo CSS (`.contenedor`, `.campo`) y el mismo marcado de los dos inputs de `PantallaInicio`:

| Ancho del viewport | `scrollWidth` actual | `scrollWidth` con `max-width: 100%` en `.campo` |
|---|---|---|
| 240 px | 327 (desborda 87 px) | 240 |
| 280 px | 327 (desborda 47 px) | 280 |
| 320 px | 327 (desborda 7 px) | 320 |
| 360 px | 360 | 360 |

La réplica es un modelo del CSS y del marcado, no la aplicación completa (que exige sesión y BD).

**Corrección prevista.** Agregar `max-width: 100%` a `.campo`. Una línea de CSS; no cambia el marcado.

## Punto 2: deuda de ADR-010 (refactor sin cambio de comportamiento)

**Hecho.** ADR-010 dejó dos deudas diferidas a un ticket aparte:

1. Dos constantes de 30 s con distinto origen: `TIEMPO_LIMITE_MS` (local a `ui/nuevo-consumo.tsx:35`, para
   el análisis) y `TIEMPO_LIMITE_GUARDADO_MS` (`domain/rules.ts:12`, para el guardado). Ambas valen
   `30_000` y responden a requisitos distintos (NFR-02 de FEAT-001b y NFR-03 de FEAT-001c).
2. `despacharEvento` (`ui/nuevo-consumo.tsx:48`) es un wrapper vacío de `despachar` desde que `sin-sesion`
   dejó de llamar a `router.refresh()`.

**Causa raíz.** FEAT-001c agregó el guardado con su propia constante en el dominio sin migrar la del
análisis, y dejó el wrapper cuando le quitó su única responsabilidad. Es deuda de coherencia, no un defecto
observable: hoy el comportamiento es correcto.

**Corrección prevista.** Mover el tiempo límite del análisis a `domain/rules.ts` junto al del guardado (o
unificarlos, decisión de PLAN, ya que ambos requisitos pueden divergir) y reemplazar `despacharEvento` por
`despachar` directamente. Sin cambios de comportamiento.

**Restricción conocida.** `nuevo-consumo.tsx` está excluido de cobertura (ADR-008: canvas y `useEffect` no
corren en `node`). La verificación de este punto se apoya en `tsc`, lint y en el test de `rules.test.ts`.

## Punto 3: `/dev-login` sin enlace de regreso (carencia de navegación)

**Hecho.** Con sesión activa, `src/app/dev-login/page.tsx` muestra solo "Conectado como {email}", sin
enlace al inicio ni a "Registrar consumo" (el botón de login y la pantalla de error tampoco lo tienen).

**Causa raíz.** FEAT-002 (refactor de la sesión) conservó el marcado mínimo de FEAT-001a a propósito:
AC-10 pide "los mismos estados que antes del refactor", y nadie agregó navegación porque la página era un
punto de entrada de QA, no una pantalla de uso.

**Corrección prevista.** Un enlace a `/` (inicio) y otro a `/consumos/nuevo` en el estado "conectada",
con `next/link`, como los de `src/app/page.tsx`.

## Gap en el PRD

Ninguno bloqueante.

- Puntos 1 y 2: los PRD de FEAT-001b/001c ya exigen lo que se corrige (NFR de responsividad y de tiempo
  máximo); el fix los cumple mejor, no los cambia.
- Punto 3: ningún PRD cubre la navegación desde `/dev-login`. El enlace es aditivo y no contradice AC-10 de
  FEAT-002 (los estados mostrados siguen siendo los mismos). `/dev-login` solo existe fuera de producción
  (`esEntornoPermitidoParaAccesoQa`). Se deja constancia en lugar de enmendar un PRD ya mergeado.

## Fuera de alcance

Observaciones menores de la verificación de FEAT-001c, no incluidas en este ticket: el rechazo por sesión
vencida no deja un evento propio en el log, y un análisis cancelado igual consume una llamada a Gemini.

## Alcance del fix

Tres cambios independientes, en archivos distintos, sin tocar PRD, ADR (más allá de cerrar la deuda en una
nota), `config/`, el esquema de la BD ni las migraciones.
