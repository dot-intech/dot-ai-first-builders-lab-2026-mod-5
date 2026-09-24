import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Ubicación compartida a propósito (ver Summary del spec FEAT-001a): FEAT-001b agrega la
 * tabla `consumos` a este mismo schema, sin necesidad de refactor. `src/shared/sesion/data`
 * importa estas tablas desde aquí en vez de definir su propio schema.
 */

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sesiones = pgTable(
  'sesiones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    // Hash SHA-256 del token de sesión — nunca el valor crudo (ver threat model FEAT-001a).
    tokenHash: text('token_hash').notNull().unique(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sesiones_usuario_id_idx').on(table.usuarioId)],
);
