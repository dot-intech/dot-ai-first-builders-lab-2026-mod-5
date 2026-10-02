# SAST FIX-003: Deuda de ADR-010, CSS de PantallaInicio y enlace en /dev-login

| Field | Value |
|-------|-------|
| Ticket | FIX-003 |
| Date | 2026-10-02 |
| Alcance | Cambios de la implementación: `src/features/consumos/ui/nuevo-consumo.tsx`, `src/features/consumos/ui/nuevo-consumo.module.css`, `src/features/consumos/domain/rules.ts`, `src/features/consumos/domain/rules.test.ts`, `src/app/dev-login/page.tsx`, `src/app/dev-login/dev-login-page.test.tsx` y `docs/adr/adr-010-idempotencia-y-confianza-del-modelo.md`. Sin cambios de esquema, migraciones ni dependencias |
| Result | PASSED |

## Resultados

| ID | Chequeo | Resultado |
|---|---|---|
| F-SAST-01 | Secretos hardcodeados | ✅ Sin coincidencias de `api_key`, `secret`, `password`, `token`, `AIza` ni connection strings en las líneas añadidas. `.env` está ignorado por git (`git check-ignore .env`) |
| F-SAST-02 | Inyección SQL | ✅ No aplica: el diff no contiene consultas |
| F-SAST-03 / F-SAST-04 / F-SAST-17 | Inyección de comandos, `eval`, funciones inseguras | ✅ Sin `eval`, `exec`, `child_process` ni `new Function` en las líneas añadidas |
| F-SAST-05 | Path traversal | ✅ No aplica |
| F-SAST-06 | XSS | ✅ Sin `innerHTML` ni `dangerouslySetInnerHTML`. Los dos enlaces nuevos de `/dev-login` son `next/link` con `href` literales (`/`, `/consumos/nuevo`); no se arma ningún enlace con datos del usuario ni de `searchParams`. El email sigue renderizándose como texto (React lo escapa) |
| F-SAST-07 | SSRF | ✅ No aplica |
| F-SAST-08 | Criptografía débil | ✅ No aplica |
| F-SAST-09 | Modo debug en producción | ✅ Sin cambios de configuración. `/dev-login` conserva su `notFound()` fuera de los entornos permitidos (cubierto por los tests existentes) |
| F-SAST-10 | Registro de datos sensibles | ✅ Sin logs nuevos |
| F-SAST-11 | Uploads sin restricción | ✅ No cambia: el CSS de `.campo` no altera `accept` ni validaciones del archivo |
| F-SAST-12 | CSRF | ✅ No aplica: sin Server Actions ni endpoints nuevos |
| F-SAST-13 / F-SAST-16 | Dependencias con CVEs | ✅ `pnpm audit --prod`: "No known vulnerabilities found". El diff no toca `package.json` ni `pnpm-lock.yaml` |
| F-SAST-14 | Validación de input incompleta | ✅ No aplica: sin entradas nuevas |
| F-SAST-15 | Manejo de errores que filtra internos | ✅ No aplica: el estado de error de `/dev-login` no cambia y un test nuevo verifica que no muestra enlaces |

## Resumen

0 vulnerabilidades (0 críticas, 0 altas, 0 medias, 0 bajas). 0 supresiones. Los tres cambios son de
presentación, de organización de constantes y de navegación estática; no agregan superficie de ataque
(coincide con `docs/daw/security/threat-FIX-003.md`).

Verificaciones de apoyo: 780 de 780 tests (712 unit + 68 integración), `tsc --noEmit`, `eslint .` y
`prettier --check .` limpios; `rg "despacharEvento|TIEMPO_LIMITE_MS" src` sin resultados.

**Resultado final: PASSED.**
