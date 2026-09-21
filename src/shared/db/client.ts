import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../../env';

const CLAVE_POOL_GLOBAL = '__nutrashotDbPool';

type GlobalConPool = typeof globalThis & { [CLAVE_POOL_GLOBAL]?: Pool };

function crearPool(): Pool {
  const nuevo = new Pool({ connectionString: env.databaseUrl });
  // Sin listener, el error de un cliente inactivo se relanza como excepción no capturada y tumba el
  // proceso. Solo se loguea el nombre: `message` y `cause` pueden traer host o credenciales.
  nuevo.on('error', (error) => {
    console.error(`Error en un cliente inactivo del pool de BD: ${error.name}`);
  });
  return nuevo;
}

const globalConPool = globalThis as GlobalConPool;

/**
 * Cliente Drizzle compartido: un único pool para toda la app (FEAT-001b lo reutiliza).
 * El `sslmode` lo decide la propia `DATABASE_URL`; aquí no se fuerza ninguno.
 * El pool se cachea en `globalThis` porque `next dev` reevalúa los módulos con HMR y, sin caché,
 * cada recarga abriría un pool nuevo sin cerrar el anterior.
 */
export const pool = (globalConPool[CLAVE_POOL_GLOBAL] ??= crearPool());

export const db = drizzle(pool);
