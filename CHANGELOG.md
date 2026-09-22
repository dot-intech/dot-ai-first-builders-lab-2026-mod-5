# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Unreleased]

### Added
- [FEAT-001a] Acceso directo de QA sin magic link: server action `qaBackdoorLogin` que crea/reutiliza
  un usuario por email configurado (`QA_ACCESS_EMAIL`) y abre una sesión con cookie `httpOnly`,
  restringida a entornos no productivos (allowlist explícita). Sesión con ventana deslizante de 24h
  de inactividad. Página `/dev-login` (404 fuera de los entornos permitidos).
