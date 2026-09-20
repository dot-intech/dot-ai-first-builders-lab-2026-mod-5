import { randomUUID } from 'node:crypto';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sesiones, usuarios } from './schema';

/**
 * Tests de integración contra una BD PostgreSQL de test real (nunca contra la BD de
 * desarrollo/producción). Requieren TEST_DATABASE_URL apuntando a una instancia efímera de
 * Postgres; no hay fallback a DATABASE_URL porque esa puede ser la BD real. Cada test crea sus
 * propios datos y los limpia en `afterEach` — nunca opera sobre filas preexistentes (Rule #0 de
 * testing.instructions.md).
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL debe estar definida para correr schema.integration.test.ts contra una BD de test real.',
  );
}

let pool: Pool;
let db: NodePgDatabase;

const usuarioIdsCreados: string[] = [];

beforeAll(() => {
  pool = new Pool({ connectionString: testDatabaseUrl });
  db = drizzle(pool);
});

afterEach(async () => {
  // Limpia únicamente los usuarios creados por esta suite; la cascada de FK
  // se encarga de borrar las sesiones asociadas.
  const idsPendientes = usuarioIdsCreados.splice(0);
  for (const id of idsPendientes) {
    await db.delete(usuarios).where(eq(usuarios.id, id));
  }
});

afterAll(async () => {
  await pool.end();
});

describe('schema: usuarios y sesiones', () => {
  it('insertar dos usuarios con el mismo email debe fallar por la constraint UNIQUE', async () => {
    const email = `qa-unique-${randomUUID()}@example.com`;

    const [creado] = await db.insert(usuarios).values({ email }).returning();
    usuarioIdsCreados.push(creado!.id);

    await expect(db.insert(usuarios).values({ email })).rejects.toThrow();
  });

  it('insertar dos sesiones con el mismo token_hash debe fallar por la constraint UNIQUE', async () => {
    const email = `qa-session-unique-${randomUUID()}@example.com`;
    const [usuario] = await db.insert(usuarios).values({ email }).returning();
    usuarioIdsCreados.push(usuario!.id);

    const tokenHash = randomUUID();
    await db.insert(sesiones).values({ usuarioId: usuario!.id, tokenHash });

    await expect(
      db.insert(sesiones).values({ usuarioId: usuario!.id, tokenHash }),
    ).rejects.toThrow();
  });

  it('eliminar un usuario debe eliminar en cascada sus sesiones', async () => {
    const email = `qa-cascade-${randomUUID()}@example.com`;
    const [usuario] = await db.insert(usuarios).values({ email }).returning();

    const tokenHash = randomUUID();
    await db.insert(sesiones).values({ usuarioId: usuario!.id, tokenHash });

    await db.delete(usuarios).where(eq(usuarios.id, usuario!.id));

    const sesionesRestantes = await db
      .select()
      .from(sesiones)
      .where(eq(sesiones.usuarioId, usuario!.id));

    expect(sesionesRestantes).toHaveLength(0);
  });
});
