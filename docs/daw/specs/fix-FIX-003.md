# Fix-plan FIX-003: Deuda de ADR-010, CSS de PantallaInicio y enlace en /dev-login

| Field | Value |
|-------|-------|
| Ticket | FIX-003 |
| Tier | FIX |
| RCA | docs/daw/specs/rca-FIX-003.md |
| Date | 2026-10-02 |
| Spec loops | 0 |

## Problem

Tres defectos independientes que quedaron abiertos al cerrar FEAT-001 (ver el RCA):

1. En pantallas angostas, `PantallaInicio` se desplaza en horizontal: los dos `<input type="file">` miden
   ~327 px y desbordan a 240, 280 y 320 px de ancho (NFR-02 de FEAT-001c / NFR-03 de FEAT-001b piden
   responsividad desde 240p).
2. `ui/nuevo-consumo.tsx` define su propia constante de 30 s (`TIEMPO_LIMITE_MS`) aparte de
   `TIEMPO_LIMITE_GUARDADO_MS` (dominio) y conserva `despacharEvento`, un wrapper vacío de `despachar`
   (deuda de ADR-010).
3. `/dev-login`, con sesión activa, solo muestra "Conectado como {email}", sin salida hacia el inicio ni
   hacia un nuevo consumo.

## Root cause

Ver `docs/daw/specs/rca-FIX-003.md`. En resumen: (1) `.campo` no limita su ancho y el input de archivo
tiene un ancho intrínseco mayor que el viewport; (2) FEAT-001c agregó la constante del guardado en el
dominio sin migrar la del análisis y dejó el wrapper al quitarle su única responsabilidad; (3) FEAT-002
conservó a propósito el marcado mínimo de `/dev-login` (AC-10: mismos estados).

## Solution — steps

Decisión de diseño del punto 2: las dos constantes responden a requisitos distintos (NFR-02 de
FEAT-001b para el análisis, NFR-03 de FEAT-001c para el guardado) y pueden divergir, por lo que se
conservan **dos constantes con nombre propio, ambas en el dominio**, en lugar de fusionarlas en una. Así
se elimina la constante local sin acoplar los dos requisitos.

1. `src/features/consumos/ui/nuevo-consumo.module.css:14-17` — agregar `max-width: 100%;` a `.campo`.
   (`.boton` no se toca: se aplica a un `<Link>` y a botones de texto corto.)
2. `src/features/consumos/domain/rules.ts:12` — exportar `TIEMPO_LIMITE_ANALISIS_MS = 30_000` junto a
   `TIEMPO_LIMITE_GUARDADO_MS`, con un comentario breve que cite NFR-02 de FEAT-001b.
3. `src/features/consumos/ui/nuevo-consumo.tsx:5,33-35,74` — importar `TIEMPO_LIMITE_ANALISIS_MS` junto a
   `TIEMPO_LIMITE_GUARDADO_MS`, eliminar la constante local `TIEMPO_LIMITE_MS` (y su comentario, que pasa
   a `rules.ts`) y usar la nueva en el temporizador del análisis.
4. `src/features/consumos/ui/nuevo-consumo.tsx:48-50` y los 13 usos — eliminar `despacharEvento` y
   reemplazar cada uso por `despachar`: líneas 60, 73, 91, 98 (`.then(despachar)`), 126 (dependencia del
   hook), 133, 137, 141, 158, 166, 173, 174, 186, 191 y 193 (números del archivo actual).
5. `src/app/dev-login/page.tsx:20-26` — importar `Link` de `next/link` y, en el estado `conectada`, agregar
   debajo del email `<p><Link href="/">Ir al inicio</Link></p>` y
   `<p><Link href="/consumos/nuevo">Registrar consumo</Link></p>`, como el patrón de `src/app/page.tsx`.
   Los estados `error` y `sin sesión` no cambian.
6. `src/features/consumos/domain/rules.test.ts:8,48-50` — importar `TIEMPO_LIMITE_ANALISIS_MS` y agregar un
   `describe` equivalente al del guardado que fije su valor en `30_000`.
7. `src/app/dev-login/dev-login-page.test.tsx:106-124` — agregar tests: el estado `conectada` contiene
   `href="/"` y `href="/consumos/nuevo"`; los estados `sin sesión` y `error` no contienen `href=`.
8. `docs/adr/adr-010-idempotencia-y-confianza-del-modelo.md:159-166` — agregar una nota de resolución en la
   sección "Deuda menor conocida" (resuelta en FIX-003: el análisis pasa a `TIEMPO_LIMITE_ANALISIS_MS` en
   `domain/rules.ts` y `despacharEvento` se eliminó) y ajustar la línea 162 de "Consecuencias", que hoy
   dice que `TIEMPO_LIMITE_MS` está pendiente de la deuda. No se modifican la spec ni el informe de
   FEAT-001c (artefactos históricos).

## Dependencies between steps

Los pasos 2 → 3 → 4 van en ese orden (3 y 4 editan el mismo archivo y 3 usa lo que 2 exporta); el paso 6
depende del 2; el paso 7 depende del 5; el paso 8 va al final. El paso 1 es independiente de todos.

## Error handling

No hay manejo de errores nuevo en tiempo de ejecución. Riesgos de implementación: dejar una referencia a
`despacharEvento` o a `TIEMPO_LIMITE_MS` sin migrar (lo detecta `pnpm exec tsc --noEmit` y ESLint) y cambiar
el valor del límite por error (lo fija el test del paso 6). Los efectos del temporizador y del guardado en
`nuevo-consumo.tsx` no se modifican: solo cambia el nombre de la función y de la constante.

## Tests

- [ ] **Regression test** — desborde: verificación en Chromium (el de Playwright) con un `iframe` de
  240, 280, 320 y 360 px y el CSS/marcado reales de `PantallaInicio`: `scrollWidth` > `clientWidth`
  ANTES del fix y `scrollWidth` == `clientWidth` DESPUÉS, en los cuatro anchos. No hay test automático en
  el repo (el CSS no se ejercita en `node`, ADR-008), así que se ejecuta como comprobación manual del
  agente y queda registrada en el reporte de VERIFY.
- [ ] `rules.test.ts` — `TIEMPO_LIMITE_ANALISIS_MS` vale `30_000` (paso 6).
- [ ] `dev-login-page.test.tsx` — el estado `conectada` contiene los dos enlaces con `href` literal, y
  `sin sesión` y `error` no los contienen (paso 7). Fallan antes del fix, pasan después.
- [ ] Sin regresión: `pnpm test:unit`, `pnpm test:integration`, `pnpm lint`,
  `pnpm exec tsc --noEmit` y `pnpm exec prettier --check .` en verde; `rg "despacharEvento|TIEMPO_LIMITE_MS" src`
  sin resultados.

## Regression risk

**Bajo.**
- `max-width: 100%` en `.campo` afecta a 9 usos (2 inputs de archivo y los controles de la revisión);
  siguen acotados por `.contenedor` (`max-width: 32rem`) y no hay tests que asserten clases o CSS.
- `nuevo-consumo.tsx` está excluido de cobertura (ADR-008): el refactor se respalda en `tsc`, ESLint, el
  `rg` de arriba y la prueba del flujo completo en VERIFY, no en tests unitarios.
- Los enlaces de `/dev-login` son aditivos: los asserts existentes usan `toContain` y no hay cadenas exactas.

## Rollback plan

- Steps: trivial — `git revert` de los commits del ticket (o de la merge del PR). Los tres cambios son
  independientes, sin migraciones, sin cambios de esquema ni de datos: se puede revertir uno solo.
- Indicators: la pantalla de inicio vuelve a desplazarse en horizontal o aparece un layout roto en los
  formularios de revisión; un temporizador de análisis o de guardado que no corta a los 30 s; un error de
  tipos o de ESLint por una referencia perdida; `/dev-login` con un estado que ya no se renderiza.
