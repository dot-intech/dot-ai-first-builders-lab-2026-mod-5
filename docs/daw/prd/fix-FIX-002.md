# Fix FIX-002: Corregir el estado de FEAT-001b y FEAT-001c en el índice del PRD

- **Bug**: el índice `prd-FEAT-001.md` sigue diciendo "PR #4 (draft), se mergea a main cuando se apruebe" y "PR #5 (draft), se mergea a main cuando se apruebe", pero los PR #4 y #5 ya están mergeados a `main` (`e714eb7` y `c70288b`).
- **Change**: `docs/daw/prd/prd-FEAT-001.md:14-15` — la columna de estado de FEAT-001b pasa a `done — PR #4 mergeado a main (e714eb7)` y la de FEAT-001c a `done — PR #5 mergeado a main (c70288b)`.
- **Regression test**: no aplica, el cambio es solo documentación y ningún test lo cubre; se verifica con `pnpm exec prettier --check docs/daw/prd/prd-FEAT-001.md` y con que `git diff` muestre solo esas dos líneas.
- **Risk**: none
