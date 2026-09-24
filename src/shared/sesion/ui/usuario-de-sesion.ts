import { RepositoryError } from '../../errors/repository-error';
import { SessionExpiredError, SessionNotFoundError } from '../domain/errors';
import { getSession } from '../domain/session-service';
import type { Usuario } from '../domain/types';

export type ResultadoUsuarioDeSesion =
  | { tipo: 'usuario'; usuario: Usuario }
  | { tipo: 'sin-sesion' }
  | { tipo: 'error'; operation: string };

/**
 * Único punto de entrada para obtener el usuario de la sesión activa a partir del token de la cookie.
 * El caller lee la cookie (esta función no toca `next/headers`) y pasa su valor tal cual.
 *
 * Contrato con el caller (ADR-007):
 * - Sesión inexistente y sesión expirada devuelven el mismo `{ tipo: 'sin-sesion' }`: no deben
 *   poder distinguirse.
 * - `{ tipo: 'error' }` no se registra aquí: el caller registra `operation` con su propio evento y
 *   nunca copia el error original (su `cause` trae SQL con emails y `token_hash`). Ignorarlo
 *   convierte un fallo de base de datos en un catch silencioso.
 * - Cualquier otro error se relanza.
 *
 * Este archivo nunca debe llevar `'use server'`: la convertiría en un endpoint invocable desde el
 * cliente, un oráculo para probar tokens arbitrarios.
 */
export async function resolverUsuarioDeSesion(
  token: string | undefined,
): Promise<ResultadoUsuarioDeSesion> {
  try {
    const usuario = await getSession(token ?? '');
    return { tipo: 'usuario', usuario };
  } catch (error) {
    if (error instanceof SessionNotFoundError || error instanceof SessionExpiredError) {
      return { tipo: 'sin-sesion' };
    }
    if (error instanceof RepositoryError) {
      return { tipo: 'error', operation: error.operation };
    }
    throw error;
  }
}
