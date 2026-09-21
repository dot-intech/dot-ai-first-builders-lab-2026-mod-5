import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { usuarios } from '../../../shared/db/schema';
import { RepositoryError } from '../domain/errors';
import { findByEmail, findById, findOrCreateByEmail } from './usuario-repository';

/**
 * Tests de integración contra la BD de test (TEST_DATABASE_URL), nunca contra la BD real.
 * El cliente compartido se reemplaza por uno sobre esa BD: así no se toca `.env` ni se depende de
 * DATABASE_URL. Cada test crea sus propios emails (únicos) y los borra en `afterEach` (Rule #0).
 */

const holder = vi.hoisted(() => ({ db: undefined as NodePgDatabase | undefined }));

// `db` es un getter (no un valor) porque la factory corre al importar el repository, antes de
// `beforeAll`, con `holder.db` todavía `undefined`; y porque los tests cambian `holder.db` por un
// pg falso en cada caso. Con `{ db: holder.db }` el mock quedaría fijo en ese `undefined` inicial.
vi.mock('../../../shared/db/client', () => ({
  get db() {
    return holder.db;
  },
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL debe estar definida para correr usuario-repository.integration.test.ts contra una BD de test real.',
  );
}

let pool: Pool;
let dbDeTest: NodePgDatabase;

const emailsCreados: string[] = [];

/** Email único ya normalizado; se registra para limpiarlo al terminar el test. */
function emailUnico(prefijo: string): string {
  const email = `${prefijo}-${randomUUID()}@example.com`;
  emailsCreados.push(email);
  return email;
}

/** Simula un pg que rechaza toda query: el error trae datos sensibles como haría el real. */
function dbConPgQueFalla(): NodePgDatabase {
  const errorDeConexion = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
    code: 'ECONNREFUSED',
  });
  const pgFalso = { query: vi.fn().mockRejectedValue(errorDeConexion) } as unknown as Pool;
  return drizzle(pgFalso);
}

/** Simula un pg que responde sin filas a todo, aun después de un INSERT. */
function dbConPgSinFilas(): NodePgDatabase {
  const pgFalso = {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] }),
  } as unknown as Pool;
  return drizzle(pgFalso);
}

beforeAll(() => {
  pool = new Pool({ connectionString: testDatabaseUrl });
  dbDeTest = drizzle(pool);
  holder.db = dbDeTest;
});

afterEach(async () => {
  holder.db = dbDeTest;
  const pendientes = emailsCreados.splice(0);
  if (pendientes.length > 0) {
    await dbDeTest.delete(usuarios).where(inArray(usuarios.email, pendientes));
  }
});

afterAll(async () => {
  await pool.end();
});

describe('usuario-repository/findOrCreateByEmail', () => {
  it('debe crear el usuario la primera vez y reutilizarlo la segunda', async () => {
    const email = emailUnico('foc');

    const primero = await findOrCreateByEmail(email);
    const segundo = await findOrCreateByEmail(email);

    expect(primero.email).toBe(email);
    expect(segundo.id).toBe(primero.id);
    const filas = await dbDeTest
      .select()
      .from(usuarios)
      .where(inArray(usuarios.email, [email]));
    expect(filas).toHaveLength(1);
  });

  it('debe devolver un Usuario de dominio con id, email y createdAt como Date', async () => {
    const email = emailUnico('foc-shape');

    const usuario = await findOrCreateByEmail(email);

    expect(Object.keys(usuario).sort()).toEqual(['createdAt', 'email', 'id']);
    expect(usuario.createdAt).toBeInstanceOf(Date);
  });

  it('debe normalizar mayúsculas y espacios de los extremos antes de persistir y reutilizar', async () => {
    const email = emailUnico('foc-norm');

    const creado = await findOrCreateByEmail(`  ${email.toUpperCase()}  `);
    const reutilizado = await findOrCreateByEmail(email);

    expect(creado.email).toBe(email);
    expect(reutilizado.id).toBe(creado.id);
  });

  it('debe ser idempotente ante llamadas concurrentes con el mismo email', async () => {
    const email = emailUnico('foc-conc');

    const resultados = await Promise.all(
      Array.from({ length: 5 }, () => findOrCreateByEmail(email)),
    );

    expect(new Set(resultados.map((u) => u.id)).size).toBe(1);
  });

  it('debe lanzar RepositoryError sin exponer el error crudo del driver si la query falla', async () => {
    const email = emailUnico('foc-fail');
    holder.db = dbConPgQueFalla();

    const error = await findOrCreateByEmail(email).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RepositoryError);
    const repositoryError = error as RepositoryError;
    expect(repositoryError.message).not.toContain(email);
    expect(repositoryError.message).not.toMatch(/insert|select|ECONNREFUSED/i);
    // Precondición: el error original de Drizzle sí trae el email (SQL + parámetros) y va solo en `cause`.
    expect((repositoryError.cause as Error).message).toContain(email);
  });

  it('debe lanzar RepositoryError si el usuario no se puede leer de vuelta tras el insert', async () => {
    const email = emailUnico('foc-noreadback');
    holder.db = dbConPgSinFilas();

    const error = await findOrCreateByEmail(email).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).message).not.toContain(email);
  });
});

describe('usuario-repository/findByEmail', () => {
  it('debe devolver el usuario existente', async () => {
    const email = emailUnico('fbe');
    const creado = await findOrCreateByEmail(email);

    const encontrado = await findByEmail(email);

    expect(encontrado).toEqual(creado);
  });

  it('debe normalizar el email antes de buscar', async () => {
    const email = emailUnico('fbe-norm');
    const creado = await findOrCreateByEmail(email);

    const encontrado = await findByEmail(`  ${email.toUpperCase()} `);

    expect(encontrado?.id).toBe(creado.id);
  });

  it('debe devolver null (sin lanzar) si el email no existe', async () => {
    const resultado = await findByEmail(`no-existe-${randomUUID()}@example.com`);

    expect(resultado).toBeNull();
  });

  it('debe lanzar RepositoryError sin exponer el error crudo del driver si la query falla', async () => {
    const email = emailUnico('fbe-fail');
    holder.db = dbConPgQueFalla();

    const error = await findByEmail(email).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RepositoryError);
    const repositoryError = error as RepositoryError;
    expect(repositoryError.message).not.toContain(email);
    expect((repositoryError.cause as Error).message).toContain(email);
  });
});

describe('usuario-repository/findById', () => {
  it('debe devolver el usuario existente por su id', async () => {
    const creado = await findOrCreateByEmail(emailUnico('fbi'));

    const encontrado = await findById(creado.id);

    expect(encontrado).toEqual(creado);
  });

  it('debe devolver null (sin lanzar) si el id no existe', async () => {
    const resultado = await findById(randomUUID());

    expect(resultado).toBeNull();
  });

  it('debe lanzar RepositoryError sin exponer el error crudo del driver si la query falla', async () => {
    const id = randomUUID();
    holder.db = dbConPgQueFalla();

    const error = await findById(id).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RepositoryError);
    const repositoryError = error as RepositoryError;
    expect(repositoryError.message).not.toContain(id);
    expect((repositoryError.cause as Error).message).toContain(id);
  });
});
