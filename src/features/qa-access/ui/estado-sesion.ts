import { resolverUsuarioDeSesion } from '../../../shared/sesion/ui/usuario-de-sesion';
import { registrarEventoAccesoQa } from './registro-acceso-qa';

export type EstadoSesion =
  | { tipo: 'conectada'; email: string }
  | { tipo: 'sin-sesion' }
  | { tipo: 'error' };

/**
 * Traduce el usuario de la sesión al estado que muestra la página. Un error de datos se loguea solo
 * por `operation` (contrato de `resolverUsuarioDeSesion`). El `switch` cubre todos los casos sin
 * `default`: si `ResultadoUsuarioDeSesion` suma un tipo, el tipo de retorno hace fallar la compilación.
 */
export async function resolverEstadoSesion(tokenCookie: string | undefined): Promise<EstadoSesion> {
  const resultado = await resolverUsuarioDeSesion(tokenCookie);
  switch (resultado.tipo) {
    case 'usuario':
      return { tipo: 'conectada', email: resultado.usuario.email };
    case 'sin-sesion':
      return { tipo: 'sin-sesion' };
    case 'error':
      registrarEventoAccesoQa({
        event: 'dev_login_page',
        outcome: 'error',
        operation: resultado.operation,
      });
      return { tipo: 'error' };
  }
}
