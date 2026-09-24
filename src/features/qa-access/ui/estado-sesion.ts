import { RepositoryError } from '../../../shared/errors/repository-error';
import { SessionExpiredError, SessionNotFoundError } from '../../../shared/sesion/domain/errors';
import { getSession } from '../../../shared/sesion/domain/session-service';
import { registrarEventoAccesoQa } from './registro-acceso-qa';

export type EstadoSesion =
  | { tipo: 'conectada'; email: string }
  | { tipo: 'sin-sesion' }
  | { tipo: 'error' };

/**
 * Traduce el resultado de `getSession` al estado que muestra la página. Sesión inexistente y sesión
 * expirada reciben el mismo trato (el usuario no debe distinguirlas). Un `RepositoryError` se loguea
 * solo por `operation`: su `cause` trae el SQL con emails y `token_hash`. Cualquier otro error se relanza.
 */
export async function resolverEstadoSesion(tokenCookie: string | undefined): Promise<EstadoSesion> {
  try {
    const usuario = await getSession(tokenCookie ?? '');
    return { tipo: 'conectada', email: usuario.email };
  } catch (error) {
    if (error instanceof SessionNotFoundError || error instanceof SessionExpiredError) {
      return { tipo: 'sin-sesion' };
    }
    if (error instanceof RepositoryError) {
      registrarEventoAccesoQa({
        event: 'dev_login_page',
        outcome: 'error',
        operation: error.operation,
      });
      return { tipo: 'error' };
    }
    throw error;
  }
}
