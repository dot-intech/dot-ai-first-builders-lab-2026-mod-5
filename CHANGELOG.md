# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Unreleased]

### Added
- [FEAT-001a] Acceso directo de QA sin magic link: server action `qaBackdoorLogin` que crea/reutiliza
  un usuario por email configurado (`QA_ACCESS_EMAIL`) y abre una sesión con cookie `httpOnly`,
  restringida a entornos no productivos (allowlist explícita). Sesión con ventana deslizante de 24h
  de inactividad. Página `/dev-login` (404 fuera de los entornos permitidos).

### Fixed
- [FIX-001] `docs/daw/specs/spec-FEAT-001a.md` corregida para reflejar las decisiones tomadas durante
  CODE (ADR-001 a ADR-006) y el hallazgo W-2 de la verificación: nombres de función, ubicación de
  `RepositoryError`, dirección de dependencias `data`↔`domain` y archivos/firmas reales de los
  Blocks 5 y 6. Sin cambios de código.
