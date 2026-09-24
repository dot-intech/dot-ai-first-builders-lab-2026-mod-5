# ADR-002: Cookie de sesión `secure` en todos los entornos salvo development y test

| Field | Value |
|-------|-------|
| Date | 2026-09-19 |
| Ticket | FEAT-001a |
| Status | Accepted |

## Context

El spec (Block 6) y el threat model (mitigación #3) fijan la cookie `secure` solo si NODE_ENV es
'production'. Con la lista de entornos de ADR-001, valores como 'staging', '' o 'prod' dejarían la
cookie sin `secure`. Además el servicio de sesión se va a reutilizar para el login real en
producción, así que la cookie no puede depender de una regla propia del backdoor.

## Options considered

### Option 1: `secure` solo si NODE_ENV es 'production' (texto del spec)
- **Pros:** fiel al spec aprobado.
- **Cons:** fail-open: con '' o 'prod' la cookie viaja sin `secure`.

### Option 2: `secure` derivado de la regla del backdoor (`!esEntornoPermitidoParaAccesoQa`)
- **Pros:** reutiliza una regla existente.
- **Cons:** acopla la cookie a una regla propia del backdoor y deja staging sin `secure`.

### Option 3: función propia `cookieSesionEsSecure(nodeEnv)`
- **Pros:** falla cerrado (false solo para 'development' y 'test'); independiente del backdoor;
  sirve igual para el login real.
- **Cons:** se aparta del spec; en HTTP local hace falta NODE_ENV development o test.

## Decision

Opción 3, decidida por el usuario el 2026-09-19. `cookieSesionEsSecure` devuelve false solo para
'development' y 'test' exactos; cualquier otro valor devuelve true. La cookie no lleva `maxAge`
fijo: es una cookie de sesión del navegador y la BD aplica la ventana deslizante de 24 h.

## Consequences

- Desvío del texto del spec (Block 6) y del threat model (mitigación #3, "secure condicional a
  NODE_ENV=production").
- `domain/rules.ts` exporta `cookieSesionEsSecure`; el Block 6 la usa para el flag `secure`.
  `httpOnly` y `sameSite=lax` no cambian (NFR-02).
- La cookie no lleva `maxAge` fijo: es una cookie de sesión del navegador y la BD aplica la ventana
  de 24 h de inactividad (NFR-01). Un `maxAge` fijo desloguearía a un usuario activo.

> **Nota 2026-09-24 (FEAT-002):** la decisión sigue vigente, pero cambian las ubicaciones:
> `cookieSesionEsSecure` pasa a `src/shared/sesion/domain/rules.ts` y la cookie a
> `src/shared/sesion/ui/cookie-sesion.ts`. Ver ADR-007.
