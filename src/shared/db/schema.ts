import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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

/**
 * Los límites de los CHECKs (500 caracteres, 0..10000 kcal) replican `DESCRIPCION_MAX` y
 * `CALORIAS_MAX` del dominio de consumos: la BD vuelve a imponer lo que el service ya validó.
 * `origen` es `text` + CHECK y no `pgEnum` porque quitar un valor de un enum exige una
 * migración destructiva (M-12, threat model FEAT-001b).
 */
export const consumos = pgTable(
  'consumos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    descripcion: text('descripcion').notNull(),
    calorias: integer('calorias').notNull(),
    pctCarbohidratos: smallint('pct_carbohidratos').notNull(),
    pctProteinas: smallint('pct_proteinas').notNull(),
    pctGrasas: smallint('pct_grasas').notNull(),
    pctOtros: smallint('pct_otros').notNull(),
    origen: text('origen').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('consumos_usuario_id_idx').on(table.usuarioId),
    check('consumos_descripcion_check', sql`char_length(${table.descripcion}) BETWEEN 1 AND 500`),
    check('consumos_calorias_check', sql`${table.calorias} BETWEEN 0 AND 10000`),
    check('consumos_pct_carbohidratos_check', sql`${table.pctCarbohidratos} BETWEEN 0 AND 100`),
    check('consumos_pct_proteinas_check', sql`${table.pctProteinas} BETWEEN 0 AND 100`),
    check('consumos_pct_grasas_check', sql`${table.pctGrasas} BETWEEN 0 AND 100`),
    check('consumos_pct_otros_check', sql`${table.pctOtros} BETWEEN 0 AND 100`),
    check('consumos_origen_check', sql`${table.origen} IN ('camara', 'galeria')`),
    check(
      'consumos_desglose_suma_check',
      sql`${table.pctCarbohidratos} + ${table.pctProteinas} + ${table.pctGrasas} + ${table.pctOtros} = 100`,
    ),
  ],
);
