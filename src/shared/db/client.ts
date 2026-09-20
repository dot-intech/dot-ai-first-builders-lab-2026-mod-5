import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../../env';

/**
 * Cliente Drizzle compartido: un único pool para toda la app (FEAT-001b lo reutiliza).
 * El `sslmode` lo decide la propia `DATABASE_URL`; aquí no se fuerza ninguno.
 */
export const pool = new Pool({ connectionString: env.databaseUrl });

export const db = drizzle(pool);
