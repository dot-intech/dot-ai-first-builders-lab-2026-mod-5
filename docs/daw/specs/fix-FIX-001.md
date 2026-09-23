# Fix-plan FIX-001: Corregir spec-FEAT-001a.md para reflejar ADR-001..006 y el hallazgo W-2

| Field | Value |
|-------|-------|
| Ticket | FIX-001 |
| Tier | FIX |
| RCA | docs/daw/specs/rca-FIX-001.md |
| Date | 2026-09-22 |
| Spec loops | 0 |

## Problem

`docs/daw/specs/spec-FEAT-001a.md` describe el diseño aprobado en PLAN, pero quedó congelada cuando
CODE arrancó. Durante CODE, varias decisiones reales divergieron de ese texto y se documentaron
correctamente como ADR — pero el pipeline no tiene forma de propagarlas de vuelta a la spec. Hoy la
spec no coincide con el código que realmente corre ni con los propios ADR que lo explican, lo que la
vuelve una referencia engañosa para quien la lea después.

## Root cause

Ver `docs/daw/specs/rca-FIX-001.md`. En resumen: el grafo de transiciones no tiene un edge
`CODE → PLAN`, y las prohibiciones globales impiden escribir la spec fuera de PLAN — así que ninguna
decisión tomada en CODE (aunque esté en un ADR) tiene un camino de vuelta al texto de la spec.

## Solution — steps

1. `docs/daw/specs/spec-FEAT-001a.md:159,172,173,281,290,306` — reemplazar toda ocurrencia de
   `esEntornoNoProductivo(nodeEnv)` (denylist, `nodeEnv !== 'production'`) por
   `esEntornoPermitidoParaAccesoQa(nodeEnv)` (allowlist explícita), incluyendo los nombres de los
   tests que la mencionan. Referencia: ADR-001.
2. `docs/daw/specs/spec-FEAT-001a.md:279` — en la sección **API contract** del Block 6, reemplazar
   "`secure` si `env.nodeEnv === 'production'`" por "`secure` según `cookieSesionEsSecure(nodeEnv)`".
   Referencia: ADR-002.
3. `docs/daw/specs/spec-FEAT-001a.md:221` — en el **Completion criterion** del Block 4, reemplazar
   "data no depende de domain" por una descripción correcta: los repositorios importan
   intencionalmente `domain/rules` y `domain/types` (dirección de dependencia aprobada).
   Referencia: ADR-004, ADR-005.
4. `docs/daw/specs/spec-FEAT-001a.md:186` — en **Files** del Block 4, quitar la afirmación de que
   `client.ts` "usa `env.databaseUrl` con `sslmode=require`"; reemplazar por una nota de que el
   `sslmode` lo decide la propia `DATABASE_URL`, sin forzarlo desde el código. Referencia: SAST I-3,
   threat model F-TM-07, hallazgo W-2 de la verificación.
5. `docs/daw/specs/spec-FEAT-001a.md:226-238` (Block 5, **Files**/**Logic**) — agregar
   `iniciarSesionQa(email)` como función nueva del service; agregar `findById` a la lista de
   `usuario-repository`; corregir la firma de `crearSesion` a `crearSesion(usuarioId, now = new
   Date())`; documentar que `getSession(tokenCrudo, now)` devuelve el `Usuario` asociado (no solo lo
   valida). Referencia: ADR-004.
6. `docs/daw/specs/spec-FEAT-001a.md:265-322` (Block 6, **Files**/**Logic**/**Error handling**) —
   agregar a **Files**: `ui/acceso-qa.ts`, `ui/cookie-sesion.ts`, `ui/estado-sesion.ts`,
   `ui/registro-acceso-qa.ts`; en **Logic**, documentar que `ui/actions.ts` llama a
   `domain/session-service.ts` a través de `acceso-qa.ts` (no directo); en **Error handling**,
   agregar que `dev-login/page.tsx` también atrapa `RepositoryError` (no solo `SessionExpiredError`/
   `SessionNotFoundError`); en **Required tests**, aclarar que los tests de componentes React usan
   `renderToStaticMarkup` sin librerías nuevas. Referencia: ADR-004, ADR-005, ADR-006.
7. `docs/daw/specs/spec-FEAT-001a.md:150-153` (Block 3, **Files**) — agregar `RepositoryError` a la
   lista de clases que exporta `domain/errors.ts` (se movió ahí desde `data/errors.ts`). Referencia:
   ADR-005 (gap detectado por `daw-impact-scanner` en PLAN).
8. `docs/daw/specs/spec-FEAT-001a.md:193,201-204` (Block 4, **Files**/**Logic**) — corregir: ya no es
   `data/errors.ts` quien define `RepositoryError` (se movió a `domain/errors.ts`, ver paso 7);
   `data/errors.ts` ahora exporta el helper `conRepositoryError`, que debe mencionarse. Referencia:
   ADR-005 (gap detectado por `daw-impact-scanner` en PLAN).

## Dependencies between steps

Ninguna: los 8 pasos son ediciones de texto independientes sobre secciones distintas del mismo
archivo. Pueden aplicarse en cualquier orden; se listan en el orden en que aparecen en el documento
(salvo 7 y 8, que se agrupan porque corrigen la misma reubicación de `RepositoryError`).

## Error handling

No hay manejo de errores en tiempo de ejecución (es un cambio de texto, no de código). El único
"error" posible es una corrección mal redactada que deje una afirmación incorrecta en la spec — se
mitiga verificando cada paso contra el código fuente real y contra el ADR que lo respalda antes de
escribir (ya hecho en el impact scan de PLAN), y con los checks de regresión de la sección Tests.

## Tests

Al ser un cambio puramente documental, la "prueba de regresión" es una verificación mecánica por
texto (grep) sobre el propio archivo corregido: falla antes del fix (porque el texto viejo todavía
está) y pasa después (porque el texto viejo desapareció y el nuevo está presente).

- [ ] **Regression test** — antes del fix, `grep -c "esEntornoNoProductivo" docs/daw/specs/spec-FEAT-001a.md`
      devuelve `6`; después del fix, devuelve `0` y
      `grep -c "esEntornoPermitidoParaAccesoQa" docs/daw/specs/spec-FEAT-001a.md` devuelve `6`.
- [ ] Antes: `grep -c "secure.*production" docs/daw/specs/spec-FEAT-001a.md` ≥ `1`; después:
      `grep -c "cookieSesionEsSecure" docs/daw/specs/spec-FEAT-001a.md` = `1`.
- [ ] Antes: `grep -c "data no depende de domain" docs/daw/specs/spec-FEAT-001a.md` = `1`; después:
      `0` (y el texto nuevo describe la dirección real de la dependencia).
- [ ] Antes: `grep -c "sslmode=require" docs/daw/specs/spec-FEAT-001a.md` = `1`; después: `0`.
- [ ] Antes: `grep -c "iniciarSesionQa" docs/daw/specs/spec-FEAT-001a.md` = `0`; después: ≥ `1`.
- [ ] Antes: `grep -c "acceso-qa.ts" docs/daw/specs/spec-FEAT-001a.md` = `0`; después: ≥ `1`.
- [ ] Antes: `grep -c "RepositoryError" docs/daw/specs/spec-FEAT-001a.md` (dentro de la sección Block 3
      Files) no incluye la clase; después, la lista de Block 3 la incluye explícitamente.
- [ ] Antes: Block 4 dice que `data/errors.ts` define `RepositoryError`; después, menciona
      `conRepositoryError` y ya no atribuye la clase a ese archivo.
- [ ] **Consistencia general** — después del fix, `pnpm exec markdownlint docs/daw/specs/spec-FEAT-001a.md`
      (si está disponible) o una relectura manual confirma que el documento sigue siendo válido
      Markdown y que ningún otro bloque quedó roto por las ediciones.

## Regression risk

**Low.** Solo se edita texto en un documento (`docs/daw/specs/spec-FEAT-001a.md`); ningún archivo
bajo `src/` se toca, así que no hay riesgo de romper build, tests o comportamiento en ejecución. El
único riesgo es documental (una corrección mal redactada), cubierto por los checks de la sección
Tests y por la verificación cruzada ya hecha en PLAN.

## Rollback plan

- **Pasos:** trivial — revertir el commit que aplica esta corrección
  (`git revert <hash-del-commit-de-CODE>`). No hay migración de datos, no hay código de aplicación
  involucrado, no hay estado en runtime que limpiar.
- **Indicadores:** si alguna de las correcciones resulta estar mal redactada o contradice lo que el
  código realmente hace (detectable por una relectura o por un futuro `daw-verify-module` que la use
  como referencia), se revierte y se vuelve a este fix-plan para corregirlo antes de re-aplicar.
