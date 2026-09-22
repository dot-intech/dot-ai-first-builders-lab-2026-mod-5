import { eq } from 'drizzle-orm';
import { db } from '../../../shared/db/client';
import { sesiones } from '../../../shared/db/schema';
import { RepositoryError } from '../domain/errors';
import type { Sesion } from '../domain/types';
import { conRepositoryError } from './errors';

type FilaSesion = typeof sesiones.$inferSelect;

function aSesion(fila: FilaSesion): Sesion {
  return {
    id: fila.id,
    usuarioId: fila.usuarioId,
    tokenHash: fila.tokenHash,
    lastActivityAt: fila.lastActivityAt,
    createdAt: fila.createdAt,
  };
}

export type NuevaSesion = {
  usuarioId: string;
  // Hash SHA-256 del token — nunca el token crudo (threat model FEAT-001a).
  tokenHash: string;
};

/** `now` es el reloj de la app: fija `last_activity_at` y `created_at` (no el default de la BD). */
export async function create(nueva: NuevaSesion, now: Date): Promise<Sesion> {
  const fila = await conRepositoryError('sesion.create', async () => {
    const [insertada] = await db
      .insert(sesiones)
      .values({
        usuarioId: nueva.usuarioId,
        tokenHash: nueva.tokenHash,
        lastActivityAt: now,
        createdAt: now,
      })
      .returning();
    return insertada;
  });

  if (!fila) {
    throw new RepositoryError('sesion.create');
  }
  return aSesion(fila);
}

export async function findByTokenHash(tokenHash: string): Promise<Sesion | null> {
  const fila = await conRepositoryError('sesion.findByTokenHash', async () => {
    const [encontrada] = await db
      .select()
      .from(sesiones)
      .where(eq(sesiones.tokenHash, tokenHash))
      .limit(1);
    return encontrada;
  });

  return fila ? aSesion(fila) : null;
}

/** Ventana deslizante: `now` es el reloj de la app. Sin fila con ese `sesionId` no hace nada. */
export async function touchLastActivity(sesionId: string, now: Date): Promise<void> {
  await conRepositoryError('sesion.touchLastActivity', async () => {
    await db.update(sesiones).set({ lastActivityAt: now }).where(eq(sesiones.id, sesionId));
  });
}
