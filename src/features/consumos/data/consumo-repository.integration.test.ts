import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { consumos, usuarios } from '../../../shared/db/schema';
import { RepositoryError } from '../../../shared/errors/repository-error';
import type { NuevoConsumo } from '../domain/types';
import { crearConsumo } from './consumo-repository';

/**
 * Tests de integración contra la BD de test (TEST_DATABASE_URL), nunca contra la BD real.
 * El cliente compartido se reemplaza por uno sobre esa BD. Cada test crea su propio usuario y lo
 * borra en `afterEach`; sus consumos caen por el `ON DELETE CASCADE` (Rule #0).
 */

const holder = vi.hoisted(() => ({ db: undefined as NodePgDatabase | undefined }));

// Getter: la factory corre al importar el repository, antes de `beforeAll`, y los tests cambian
// `holder.db` por un pg falso en algunos casos.
vi.mock('../../../shared/db/client', () => ({
  get db() {
    return holder.db;
  },
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL debe estar definida para correr consumo-repository.integration.test.ts contra una BD de test real.',
  );
}

let pool: Pool;
let dbDeTest: NodePgDatabase;

const usuariosCreados: string[] = [];

async function crearUsuarioDeTest(): Promise<string> {
  const [fila] = await dbDeTest
    .insert(usuarios)
    .values({ email: `consumo-repo-${randomUUID()}@example.com` })
    .returning({ id: usuarios.id });
  if (!fila) {
    throw new Error('No se pudo crear el usuario de test');
  }
  usuariosCreados.push(fila.id);
  return fila.id;
}

function nuevoConsumo(usuarioId: string): NuevoConsumo {
  return {
    usuarioId,
    descripcion: 'Ensalada César con un jugo de naranja',
    calorias: 520,
    desglose: { carbohidratos: 35, proteinas: 25, grasas: 30, otros: 10 },
    origen: 'galeria',
    solicitudId: randomUUID(),
  };
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
  const pendientes = usuariosCreados.splice(0);
  if (pendientes.length > 0) {
    await dbDeTest.delete(usuarios).where(inArray(usuarios.id, pendientes));
  }
});

afterAll(async () => {
  await pool.end();
});

describe('consumo-repository/crearConsumo', () => {
  it('debe insertar el consumo y devolverlo como Consumo de dominio con id y createdAt', async () => {
    const usuarioId = await crearUsuarioDeTest();
    const nuevo = nuevoConsumo(usuarioId);

    const antes = Date.now();
    const consumo = await crearConsumo(nuevo);

    expect(consumo).toEqual({ ...nuevo, id: expect.any(String), createdAt: expect.any(Date) });
    expect(consumo.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    // Margen por diferencia de reloj entre este proceso y Postgres.
    expect(consumo.createdAt.getTime()).toBeGreaterThan(antes - 60_000);
    expect(Object.keys(consumo).sort()).toEqual([
      'calorias',
      'createdAt',
      'descripcion',
      'desglose',
      'id',
      'origen',
      'solicitudId',
      'usuarioId',
    ]);
  });

  it('debe persistir la fila asociada al usuario con los porcentajes en sus columnas', async () => {
    const usuarioId = await crearUsuarioDeTest();

    const consumo = await crearConsumo({ ...nuevoConsumo(usuarioId), origen: 'camara' });

    const filas = await dbDeTest.select().from(consumos).where(eq(consumos.id, consumo.id));
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      usuarioId,
      descripcion: 'Ensalada César con un jugo de naranja',
      calorias: 520,
      pctCarbohidratos: 35,
      pctProteinas: 25,
      pctGrasas: 30,
      pctOtros: 10,
      origen: 'camara',
    });
    expect(filas[0]?.createdAt.getTime()).toBe(consumo.createdAt.getTime());
  });

  it('debe permitir varios consumos del mismo usuario', async () => {
    const usuarioId = await crearUsuarioDeTest();

    const primero = await crearConsumo(nuevoConsumo(usuarioId));
    const segundo = await crearConsumo(nuevoConsumo(usuarioId));

    expect(segundo.id).not.toBe(primero.id);
  });

  it('debe persistir solicitud_id y aceptar el origen manual', async () => {
    const usuarioId = await crearUsuarioDeTest();
    const nuevo: NuevoConsumo = { ...nuevoConsumo(usuarioId), origen: 'manual' };

    const consumo = await crearConsumo(nuevo);

    expect(consumo.origen).toBe('manual');
    expect(consumo.solicitudId).toBe(nuevo.solicitudId);
    const [fila] = await dbDeTest.select().from(consumos).where(eq(consumos.id, consumo.id));
    expect(fila?.solicitudId).toBe(nuevo.solicitudId);
  });

  it('debe dejar una sola fila al guardar dos veces el mismo (usuarioId, solicitudId) y gana el segundo', async () => {
    const usuarioId = await crearUsuarioDeTest();
    const primero = nuevoConsumo(usuarioId);
    const original = await crearConsumo(primero);

    const editado = await crearConsumo({
      ...primero,
      descripcion: 'Ensalada César sin jugo',
      calorias: 300,
      desglose: { carbohidratos: 20, proteinas: 30, grasas: 40, otros: 10 },
      origen: 'manual',
    });

    const filas = await dbDeTest.select().from(consumos).where(eq(consumos.usuarioId, usuarioId));
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      descripcion: 'Ensalada César sin jugo',
      calorias: 300,
      pctCarbohidratos: 20,
      pctProteinas: 30,
      pctGrasas: 40,
      pctOtros: 10,
      origen: 'manual',
      solicitudId: primero.solicitudId,
    });
    expect(editado.id).toBe(original.id);
    expect(editado.createdAt.getTime()).toBe(original.createdAt.getTime());
    expect(editado.descripcion).toBe('Ensalada César sin jugo');
  });

  it('debe crear dos filas si dos usuarios distintos usan el mismo solicitudId', async () => {
    const usuarioA = await crearUsuarioDeTest();
    const usuarioB = await crearUsuarioDeTest();
    const solicitudId = randomUUID();

    const a = await crearConsumo({ ...nuevoConsumo(usuarioA), solicitudId });
    const b = await crearConsumo({ ...nuevoConsumo(usuarioB), solicitudId });

    expect(b.id).not.toBe(a.id);
    const filas = await dbDeTest
      .select()
      .from(consumos)
      .where(inArray(consumos.usuarioId, [usuarioA, usuarioB]));
    expect(filas).toHaveLength(2);
  });

  it('debe lanzar RepositoryError consumos.crear con mensaje fijo si el usuario no existe', async () => {
    const usuarioInexistente = randomUUID();

    const error = await crearConsumo(nuevoConsumo(usuarioInexistente)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RepositoryError);
    const repositoryError = error as RepositoryError;
    expect(repositoryError.operation).toBe('consumos.crear');
    expect(repositoryError.message).toBe(new RepositoryError('consumos.crear').message);
    expect(repositoryError.message).not.toContain(usuarioInexistente);
    expect(repositoryError.message).not.toMatch(/insert|consumos_usuario_id|foreign/i);
    // Precondición: el error original (con SQL y parámetros) existe y va solo en `cause`.
    expect(repositoryError.cause).toBeInstanceOf(Error);
  });

  it('debe lanzar RepositoryError consumos.crear si el insert no devuelve la fila', async () => {
    holder.db = dbConPgSinFilas();

    const error = await crearConsumo(nuevoConsumo(randomUUID())).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).operation).toBe('consumos.crear');
  });
});
