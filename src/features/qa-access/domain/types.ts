/**
 * Tipos de dominio planos. Reflejan las columnas de `usuarios` y `sesiones`, pero se definen a mano:
 * `domain` no depende de `data` ni del schema de Drizzle (regla de capas de AGENTS.md).
 */

export type Usuario = {
  id: string;
  email: string;
  createdAt: Date;
};

export type Sesion = {
  id: string;
  usuarioId: string;
  // Hash SHA-256 del token de sesión — nunca el valor crudo (ver threat model FEAT-001a).
  tokenHash: string;
  lastActivityAt: Date;
  createdAt: Date;
};
