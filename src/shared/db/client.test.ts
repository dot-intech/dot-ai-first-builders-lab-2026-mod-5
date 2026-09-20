import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const URL_DE_PRUEBA = 'postgresql://usuario:clave@127.0.0.1:1/nombre?sslmode=disable';

let poolAbierto: Pool | undefined;

// `env` se lee al importar el módulo: se resetean los módulos para que cada test lo vuelva a evaluar.
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', URL_DE_PRUEBA);
});

// El pool se cierra acá y no al final de cada test: así se libera aunque un `expect` falle antes.
afterEach(async () => {
  await poolAbierto?.end();
  poolAbierto = undefined;
  vi.unstubAllEnvs();
});

describe('shared/db/client', () => {
  it('debe construir el pool desde env.databaseUrl sin alterarla', async () => {
    const { pool } = await import('./client');
    poolAbierto = pool;

    expect(pool.options.connectionString).toBe(URL_DE_PRUEBA);
  });

  it('debe exponer un cliente Drizzle capaz de construir queries sobre el schema compartido', async () => {
    const { db, pool } = await import('./client');
    poolAbierto = pool;
    const { usuarios } = await import('./schema');

    expect(db.select().from(usuarios).toSQL().sql).toContain('"usuarios"');
  });
});
