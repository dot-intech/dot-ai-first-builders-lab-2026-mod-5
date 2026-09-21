import { eq } from 'drizzle-orm';
import { db } from '../../../shared/db/client';
import { usuarios } from '../../../shared/db/schema';
import { normalizarEmail } from '../domain/rules';
import type { Usuario } from '../domain/types';
import { RepositoryError, conRepositoryError } from './errors';

type FilaUsuario = typeof usuarios.$inferSelect;

function aUsuario(fila: FilaUsuario): Usuario {
  return { id: fila.id, email: fila.email, createdAt: fila.createdAt };
}

export async function findByEmail(email: string): Promise<Usuario | null> {
  const emailNormalizado = normalizarEmail(email);

  const fila = await conRepositoryError('usuario.findByEmail', async () => {
    const [encontrada] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, emailNormalizado))
      .limit(1);
    return encontrada;
  });

  return fila ? aUsuario(fila) : null;
}

/**
 * Idempotente ante llamadas concurrentes: `ON CONFLICT DO NOTHING` evita que la constraint UNIQUE
 * burbujee como excepción, y el `SELECT` posterior devuelve la fila gane quien gane.
 */
export async function findOrCreateByEmail(email: string): Promise<Usuario> {
  const emailNormalizado = normalizarEmail(email);

  const fila = await conRepositoryError('usuario.findOrCreateByEmail', async () => {
    await db
      .insert(usuarios)
      .values({ email: emailNormalizado })
      .onConflictDoNothing({ target: usuarios.email });
    const [encontrada] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, emailNormalizado))
      .limit(1);
    return encontrada;
  });

  if (!fila) {
    throw new RepositoryError('usuario.findOrCreateByEmail');
  }
  return aUsuario(fila);
}

/** No normaliza: recibe un id (uuid), no un email. Sin fila con ese id devuelve `null`. */
export async function findById(id: string): Promise<Usuario | null> {
  const fila = await conRepositoryError('usuario.findById', async () => {
    const [encontrada] = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
    return encontrada;
  });

  return fila ? aUsuario(fila) : null;
}
