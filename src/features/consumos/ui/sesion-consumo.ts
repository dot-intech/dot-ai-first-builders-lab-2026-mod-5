import { resolverUsuarioDeSesion } from '../../../shared/sesion/ui/usuario-de-sesion';
import { registrarEventoConsumo } from './registro-consumo';

export type ResultadoUsuarioConsumo =
  | { tipo: 'usuario'; usuarioId: string }
  | { tipo: 'sin-sesion' }
  | { tipo: 'error' };

/**
 * Usuario de la sesión activa para la feature de consumos (lo usan las actions y la página). Ante
 * `error` registra solo `operation` con su propio evento y nunca copia el error original (contrato
 * de ADR-007). El `switch` cubre todos los casos sin `default`: si `ResultadoUsuarioDeSesion` suma
 * un tipo, el tipo de retorno hace fallar la compilación. Cualquier otro error se propaga.
 */
export async function resolverUsuarioConsumo(
  token: string | undefined,
): Promise<ResultadoUsuarioConsumo> {
  const resultado = await resolverUsuarioDeSesion(token);
  switch (resultado.tipo) {
    case 'usuario':
      return { tipo: 'usuario', usuarioId: resultado.usuario.id };
    case 'sin-sesion':
      return { tipo: 'sin-sesion' };
    case 'error':
      registrarEventoConsumo({
        event: 'consumo_sesion',
        outcome: 'error',
        operation: resultado.operation,
      });
      return { tipo: 'error' };
  }
}
