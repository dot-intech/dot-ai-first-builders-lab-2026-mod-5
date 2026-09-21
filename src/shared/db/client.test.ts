import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const URL_DE_PRUEBA = 'postgresql://usuario:clave@127.0.0.1:1/nombre?sslmode=disable';

// Clave con la que `client.ts` cachea el pool en `globalThis` (evita pools duplicados por HMR).
const CLAVE_POOL_GLOBAL = '__nutrashotDbPool';

type GlobalConPool = typeof globalThis & { [CLAVE_POOL_GLOBAL]?: Pool };

let poolAbierto: Pool | undefined;

function limpiarPoolGlobal(): void {
  delete (globalThis as GlobalConPool)[CLAVE_POOL_GLOBAL];
}

// `env` se lee al importar el módulo: se resetean los módulos para que cada test lo vuelva a evaluar.
// El pool cacheado en `globalThis` se descarta para que cada test parta de cero.
beforeEach(() => {
  vi.resetModules();
  limpiarPoolGlobal();
  vi.stubEnv('DATABASE_URL', URL_DE_PRUEBA);
});

// El pool se cierra acá y no al final de cada test: así se libera aunque un `expect` falle antes.
// Se limpia el estado primero y el pool se cierra al final: si `pool.end()` falla, igual quedan
// restaurados el entorno y `poolAbierto`.
afterEach(async () => {
  const pool = poolAbierto;
  poolAbierto = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  limpiarPoolGlobal();
  await pool?.end();
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

  it('debe registrar un listener de error en el pool', async () => {
    const { pool } = await import('./client');
    poolAbierto = pool;

    expect(pool.listenerCount('error')).toBe(1);
  });

  it('debe absorber el error de un cliente inactivo sin lanzar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { pool } = await import('./client');
    poolAbierto = pool;

    expect(() => pool.emit('error', new Error('conexión caída'))).not.toThrow();
  });

  it('debe loguear solo el nombre del error, nunca su message ni su cause', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { pool } = await import('./client');
    poolAbierto = pool;
    const errorConDatos = Object.assign(
      new Error('password authentication failed for user "usuario" at host secreto.interno', {
        cause: new Error('clave-en-la-cause'),
      }),
      { name: 'ErrorDeConexionDePrueba' },
    );

    pool.emit('error', errorConDatos);

    expect(consoleError).toHaveBeenCalledTimes(1);
    const registrado = JSON.stringify(consoleError.mock.calls);
    expect(registrado).toContain('ErrorDeConexionDePrueba');
    expect(registrado).not.toMatch(/password|secreto|clave/);
  });

  it('debe reutilizar la misma instancia de pool si el módulo se importa dos veces (HMR)', async () => {
    const primero = await import('./client');
    poolAbierto = primero.pool;
    vi.resetModules();

    const segundo = await import('./client');

    expect(segundo.pool).toBe(primero.pool);
  });

  it('no debe duplicar el listener de error al reimportar el módulo', async () => {
    const { pool } = await import('./client');
    poolAbierto = pool;
    vi.resetModules();

    await import('./client');

    expect(pool.listenerCount('error')).toBe(1);
  });
});
