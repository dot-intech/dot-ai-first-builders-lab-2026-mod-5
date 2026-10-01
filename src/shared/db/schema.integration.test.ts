import { randomUUID } from 'node:crypto';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { consumos, sesiones, usuarios } from './schema';

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
  // se encarga de borrar las sesiones y los consumos asociados.
  const idsPendientes = usuarioIdsCreados.splice(0);
  for (const id of idsPendientes) {
    await db.delete(usuarios).where(eq(usuarios.id, id));
  }
});

afterAll(async () => {
  await pool.end();
});

describe('schema: usuarios y sesiones', () => {
  it('debe fallar por la constraint UNIQUE al insertar dos usuarios con el mismo email', async () => {
    const email = `qa-unique-${randomUUID()}@example.com`;

    const [creado] = await db.insert(usuarios).values({ email }).returning();
    usuarioIdsCreados.push(creado!.id);

    await expect(db.insert(usuarios).values({ email })).rejects.toThrow();
  });

  it('debe fallar por la constraint UNIQUE al insertar dos sesiones con el mismo token_hash', async () => {
    const email = `qa-session-unique-${randomUUID()}@example.com`;
    const [usuario] = await db.insert(usuarios).values({ email }).returning();
    usuarioIdsCreados.push(usuario!.id);

    const tokenHash = randomUUID();
    await db.insert(sesiones).values({ usuarioId: usuario!.id, tokenHash });

    await expect(
      db.insert(sesiones).values({ usuarioId: usuario!.id, tokenHash }),
    ).rejects.toThrow();
  });

  it('debe eliminar en cascada las sesiones al eliminar un usuario', async () => {
    const email = `qa-cascade-${randomUUID()}@example.com`;
    const [usuario] = await db.insert(usuarios).values({ email }).returning();
    usuarioIdsCreados.push(usuario!.id);

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

describe('schema: consumos', () => {
  async function crearUsuario(prefijo: string): Promise<string> {
    const [usuario] = await db
      .insert(usuarios)
      .values({ email: `qa-${prefijo}-${randomUUID()}@example.com` })
      .returning();
    usuarioIdsCreados.push(usuario!.id);
    return usuario!.id;
  }

  function consumoValido(usuarioId: string): typeof consumos.$inferInsert {
    return {
      usuarioId,
      descripcion: 'Milanesa con puré',
      calorias: 650,
      pctCarbohidratos: 40,
      pctProteinas: 30,
      pctGrasas: 25,
      pctOtros: 5,
      origen: 'camara',
    };
  }

  /**
   * drizzle envuelve el error de pg en `cause`; se busca el nombre de la constraint violada ahí
   * para distinguir qué regla rechazó el insert.
   */
  async function constraintRechazada(promesa: Promise<unknown>): Promise<string | undefined> {
    try {
      await promesa;
    } catch (error) {
      const causa = error instanceof Error && error.cause ? error.cause : error;
      if (typeof causa === 'object' && causa !== null && 'constraint' in causa) {
        const { constraint } = causa;
        return typeof constraint === 'string' ? constraint : undefined;
      }
      throw error;
    }
    throw new Error('El insert debía ser rechazado por la BD y no lo fue');
  }

  it('debe insertar un consumo válido y leerlo de vuelta', async () => {
    const usuarioId = await crearUsuario('consumo-valido');

    const [creado] = await db.insert(consumos).values(consumoValido(usuarioId)).returning();

    const leidos = await db.select().from(consumos).where(eq(consumos.id, creado!.id));

    expect(leidos).toHaveLength(1);
    expect(leidos[0]).toMatchObject({
      usuarioId,
      descripcion: 'Milanesa con puré',
      calorias: 650,
      pctCarbohidratos: 40,
      pctProteinas: 30,
      pctGrasas: 25,
      pctOtros: 5,
      origen: 'camara',
    });
    expect(leidos[0]!.id).toEqual(expect.any(String));
    expect(leidos[0]!.createdAt).toBeInstanceOf(Date);
  });

  it('debe rechazar porcentajes que suman 99 (consumos_desglose_suma_check)', async () => {
    const usuarioId = await crearUsuario('consumo-suma');

    const constraint = await constraintRechazada(
      db.insert(consumos).values({ ...consumoValido(usuarioId), pctOtros: 4 }),
    );

    expect(constraint).toBe('consumos_desglose_suma_check');
  });

  it.each([10001, -1])(
    'debe rechazar calorias = %i (consumos_calorias_check)',
    async (calorias) => {
      const usuarioId = await crearUsuario('consumo-calorias');

      const constraint = await constraintRechazada(
        db.insert(consumos).values({ ...consumoValido(usuarioId), calorias }),
      );

      expect(constraint).toBe('consumos_calorias_check');
    },
  );

  it.each([
    ['vacía', ''],
    ['de 501 caracteres', 'a'.repeat(501)],
  ])(
    'debe rechazar una descripción %s (consumos_descripcion_check)',
    async (_caso, descripcion) => {
      const usuarioId = await crearUsuario('consumo-descripcion');

      const constraint = await constraintRechazada(
        db.insert(consumos).values({ ...consumoValido(usuarioId), descripcion }),
      );

      expect(constraint).toBe('consumos_descripcion_check');
    },
  );

  /**
   * Cada caso deja un único porcentaje fuera de rango (-1) y compensa con los otros tres dentro de
   * 0..100 para que la suma siga en 100: así el único CHECK violado es el individual bajo prueba y
   * el nombre que reporta Postgres es determinístico. El borde superior (101) no se puede aislar:
   * con la suma en 100, los otros tres sumarían -1 y alguno violaría su propio CHECK.
   */
  it.each([
    [
      'consumos_pct_carbohidratos_check',
      { pctCarbohidratos: -1, pctProteinas: 100, pctGrasas: 1, pctOtros: 0 },
    ],
    [
      'consumos_pct_proteinas_check',
      { pctCarbohidratos: 100, pctProteinas: -1, pctGrasas: 1, pctOtros: 0 },
    ],
    [
      'consumos_pct_grasas_check',
      { pctCarbohidratos: 100, pctProteinas: 1, pctGrasas: -1, pctOtros: 0 },
    ],
    [
      'consumos_pct_otros_check',
      { pctCarbohidratos: 100, pctProteinas: 1, pctGrasas: 0, pctOtros: -1 },
    ],
  ])(
    'debe rechazar un porcentaje fuera de rango con la suma en 100 (%s)',
    async (nombreCheck, porcentajes) => {
      const usuarioId = await crearUsuario('consumo-pct');

      const constraint = await constraintRechazada(
        db.insert(consumos).values({ ...consumoValido(usuarioId), ...porcentajes }),
      );

      expect(constraint).toBe(nombreCheck);
    },
  );

  it("debe rechazar origen = 'otro' (consumos_origen_check)", async () => {
    const usuarioId = await crearUsuario('consumo-origen');

    const constraint = await constraintRechazada(
      db.insert(consumos).values({ ...consumoValido(usuarioId), origen: 'otro' }),
    );

    expect(constraint).toBe('consumos_origen_check');
  });

  it("debe insertar un consumo con origen = 'manual' y solicitud_id", async () => {
    const usuarioId = await crearUsuario('consumo-manual');
    const solicitudId = randomUUID();

    const [creado] = await db
      .insert(consumos)
      .values({ ...consumoValido(usuarioId), origen: 'manual', solicitudId })
      .returning();

    expect(creado).toMatchObject({ origen: 'manual', solicitudId });
  });

  it('debe rechazar dos inserts con el mismo (usuario_id, solicitud_id) (consumos_usuario_solicitud_uidx)', async () => {
    const usuarioId = await crearUsuario('consumo-solicitud-dup');
    const solicitudId = randomUUID();
    await db.insert(consumos).values({ ...consumoValido(usuarioId), solicitudId });

    const constraint = await constraintRechazada(
      db.insert(consumos).values({ ...consumoValido(usuarioId), solicitudId }),
    );

    expect(constraint).toBe('consumos_usuario_solicitud_uidx');
  });

  it('debe permitir el mismo solicitud_id para usuarios distintos', async () => {
    const solicitudId = randomUUID();
    const usuarioA = await crearUsuario('consumo-solicitud-a');
    const usuarioB = await crearUsuario('consumo-solicitud-b');

    await db.insert(consumos).values({ ...consumoValido(usuarioA), solicitudId });
    await db.insert(consumos).values({ ...consumoValido(usuarioB), solicitudId });

    const filas = await db.select().from(consumos).where(eq(consumos.solicitudId, solicitudId));
    expect(filas).toHaveLength(2);
  });

  it('debe permitir varias filas con solicitud_id NULL para el mismo usuario (datos de FEAT-001b)', async () => {
    const usuarioId = await crearUsuario('consumo-solicitud-null');

    await db.insert(consumos).values(consumoValido(usuarioId));
    await db.insert(consumos).values(consumoValido(usuarioId));

    const filas = await db.select().from(consumos).where(eq(consumos.usuarioId, usuarioId));
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => f.solicitudId === null)).toBe(true);
  });

  it('debe rechazar un usuario_id inexistente por la FK', async () => {
    // UUID aleatorio que no se inserta en usuarios: no existe ninguna fila con ese id.
    const constraint = await constraintRechazada(
      db.insert(consumos).values(consumoValido(randomUUID())),
    );

    expect(constraint).toBe('consumos_usuario_id_usuarios_id_fk');
  });

  it('debe eliminar en cascada los consumos al eliminar el usuario', async () => {
    const usuarioId = await crearUsuario('consumo-cascade');
    await db.insert(consumos).values(consumoValido(usuarioId));

    await db.delete(usuarios).where(eq(usuarios.id, usuarioId));

    const restantes = await db.select().from(consumos).where(eq(consumos.usuarioId, usuarioId));

    expect(restantes).toHaveLength(0);
  });
});
