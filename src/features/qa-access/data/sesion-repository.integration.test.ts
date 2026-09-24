import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { usuarios } from '../../../shared/db/schema';
import { RepositoryError } from '../../../shared/errors/repository-error';
import { create, findByTokenHash, touchLastActivity } from './sesion-repository';

/**
 * Tests de integración contra la BD de test (TEST_DATABASE_URL), nunca contra la BD real.
 * El cliente compartido se reemplaza por uno sobre esa BD. Cada test crea su propio usuario y se
 * borra en `afterEach`; la cascada de FK elimina sus sesiones (Rule #0).
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
    'TEST_DATABASE_URL debe estar definida para correr sesion-repository.integration.test.ts contra una BD de test real.',
  );
}

let pool: Pool;
let dbDeTest: NodePgDatabase;

const usuarioIdsCreados: string[] = [];

async function crearUsuarioDePrueba(): Promise<string> {
  const [usuario] = await dbDeTest
    .insert(usuarios)
    .values({ email: `sesion-repo-${randomUUID()}@example.com` })
    .returning();
  usuarioIdsCreados.push(usuario!.id);
  return usuario!.id;
}

function tokenHashUnico(): string {
  return `hash-${randomUUID()}`;
}

/** Simula un pg que rechaza toda query: el error trae datos sensibles como haría el real. */
function dbConPgQueFalla(): NodePgDatabase {
  const errorDeConexion = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
    code: 'ECONNREFUSED',
  });
  const pgFalso = { query: vi.fn().mockRejectedValue(errorDeConexion) } as unknown as Pool;
  return drizzle(pgFalso);
}

/** Simula un pg que responde sin filas a todo, aun después de un INSERT ... RETURNING. */
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
  const pendientes = usuarioIdsCreados.splice(0);
  if (pendientes.length > 0) {
    await dbDeTest.delete(usuarios).where(inArray(usuarios.id, pendientes));
  }
});

afterAll(async () => {
  await pool.end();
});

const AHORA = new Date('2026-03-01T10:00:00.000Z');

describe('sesion-repository/create + findByTokenHash', () => {
  it('debe devolver la sesión creada al buscarla por su hash de token', async () => {
    const usuarioId = await crearUsuarioDePrueba();
    const tokenHash = tokenHashUnico();

    const creada = await create({ usuarioId, tokenHash }, AHORA);
    const encontrada = await findByTokenHash(tokenHash);

    expect(encontrada).toEqual(creada);
    expect(encontrada).toMatchObject({ usuarioId, tokenHash });
  });

  it('debe devolver una Sesion de dominio con campos Date', async () => {
    const usuarioId = await crearUsuarioDePrueba();

    const sesion = await create({ usuarioId, tokenHash: tokenHashUnico() }, AHORA);

    expect(Object.keys(sesion).sort()).toEqual([
      'createdAt',
      'id',
      'lastActivityAt',
      'tokenHash',
      'usuarioId',
    ]);
    expect(sesion.lastActivityAt).toBeInstanceOf(Date);
    expect(sesion.createdAt).toBeInstanceOf(Date);
  });

  it('debe escribir last_activity_at con el reloj de la app, no con el default de la BD', async () => {
    const usuarioId = await crearUsuarioDePrueba();
    const tokenHash = tokenHashUnico();

    await create({ usuarioId, tokenHash }, AHORA);
    const encontrada = await findByTokenHash(tokenHash);

    expect(encontrada?.lastActivityAt).toEqual(AHORA);
  });

  it('debe devolver null (sin lanzar) si el hash de token no existe', async () => {
    const resultado = await findByTokenHash(tokenHashUnico());

    expect(resultado).toBeNull();
  });

  it('debe lanzar RepositoryError sin exponer el hash de token si el insert viola una constraint', async () => {
    const usuarioId = await crearUsuarioDePrueba();
    const tokenHash = tokenHashUnico();
    await create({ usuarioId, tokenHash }, AHORA);

    const error = await create({ usuarioId, tokenHash }, AHORA).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).message).not.toContain(tokenHash);
    expect((error as RepositoryError).cause).toBeInstanceOf(Error);
  });

  it('debe lanzar RepositoryError sin exponer el error crudo del driver si la query falla en create', async () => {
    const tokenHash = tokenHashUnico();
    holder.db = dbConPgQueFalla();

    const error = await create({ usuarioId: randomUUID(), tokenHash }, AHORA).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).message).not.toContain(tokenHash);
    expect(((error as RepositoryError).cause as Error).message).toContain(tokenHash);
  });

  it('debe lanzar RepositoryError si el insert no devuelve ninguna fila', async () => {
    const tokenHash = tokenHashUnico();
    holder.db = dbConPgSinFilas();

    const error = await create({ usuarioId: randomUUID(), tokenHash }, AHORA).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).message).not.toContain(tokenHash);
  });

  it('debe lanzar RepositoryError sin exponer el error crudo del driver si la query falla en findByTokenHash', async () => {
    const tokenHash = tokenHashUnico();
    holder.db = dbConPgQueFalla();

    const error = await findByTokenHash(tokenHash).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).message).not.toContain(tokenHash);
    expect(((error as RepositoryError).cause as Error).message).toContain(tokenHash);
  });
});

describe('sesion-repository/touchLastActivity', () => {
  it('debe actualizar last_activity_at a la fecha indicada', async () => {
    const usuarioId = await crearUsuarioDePrueba();
    const tokenHash = tokenHashUnico();
    const creada = await create({ usuarioId, tokenHash }, AHORA);
    const masTarde = new Date(AHORA.getTime() + 60 * 60 * 1000);

    await touchLastActivity(creada.id, masTarde);
    const encontrada = await findByTokenHash(tokenHash);

    expect(encontrada?.lastActivityAt).toEqual(masTarde);
    expect(encontrada?.createdAt).toEqual(AHORA);
  });

  it('debe modificar únicamente la sesión indicada', async () => {
    const usuarioId = await crearUsuarioDePrueba();
    const hashA = tokenHashUnico();
    const hashB = tokenHashUnico();
    const sesionA = await create({ usuarioId, tokenHash: hashA }, AHORA);
    await create({ usuarioId, tokenHash: hashB }, AHORA);

    await touchLastActivity(sesionA.id, new Date(AHORA.getTime() + 1000));
    const sesionB = await findByTokenHash(hashB);

    expect(sesionB?.lastActivityAt).toEqual(AHORA);
  });

  it('debe resolver sin lanzar y sin alterar otras sesiones si el sesionId no existe', async () => {
    const usuarioId = await crearUsuarioDePrueba();
    const tokenHash = tokenHashUnico();
    await create({ usuarioId, tokenHash }, AHORA);

    await expect(
      touchLastActivity(randomUUID(), new Date(AHORA.getTime() + 60 * 60 * 1000)),
    ).resolves.toBeUndefined();
    const existente = await findByTokenHash(tokenHash);

    expect(existente?.lastActivityAt).toEqual(AHORA);
  });

  it('debe lanzar RepositoryError sin exponer el error crudo del driver si la query falla', async () => {
    const sesionId = randomUUID();
    holder.db = dbConPgQueFalla();

    const error = await touchLastActivity(sesionId, AHORA).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).message).not.toContain(sesionId);
  });
});
