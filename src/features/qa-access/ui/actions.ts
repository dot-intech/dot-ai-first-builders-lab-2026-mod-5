'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '../../../env';
import { QaAccessDeniedError, RepositoryError } from '../domain/errors';
import { autenticarAccesoQa } from './acceso-qa';
import { NOMBRE_COOKIE_SESION, opcionesCookieSesion } from './cookie-sesion';
import { registrarEventoAccesoQa } from './registro-acceso-qa';

const RUTA_LOGIN = '/dev-login';
const RUTA_LOGIN_CON_ERROR = '/dev-login?error=1';

/**
 * ÚNICO export de este archivo, a propósito: en un archivo 'use server' toda función exportada queda
 * expuesta como endpoint invocable por el cliente. Por eso no recibe parámetros (el email nunca viaja
 * desde el cliente) y la lógica parametrizable vive en `acceso-qa.ts`, sin 'use server'.
 */
export async function qaBackdoorLogin(): Promise<void> {
  let token: string;
  try {
    token = await autenticarAccesoQa({
      nodeEnv: env.nodeEnv,
      qaAccessEmail: env.qaAccessEmail,
    });
  } catch (error) {
    // Solo se atrapan estos dos tipos: un error sin capturar lo registra Next completo y el `cause`
    // de un RepositoryError trae SQL con emails y `token_hash`. `redirect` lanza: no se envuelve.
    if (error instanceof QaAccessDeniedError) {
      registrarEventoAccesoQa({
        event: 'qa_backdoor_login',
        outcome: 'denied',
        reason: error.reason,
      });
      redirect(RUTA_LOGIN_CON_ERROR);
    }
    if (error instanceof RepositoryError) {
      registrarEventoAccesoQa({
        event: 'qa_backdoor_login',
        outcome: 'error',
        operation: error.operation,
      });
      redirect(RUTA_LOGIN_CON_ERROR);
    }
    throw error;
  }

  (await cookies()).set(NOMBRE_COOKIE_SESION, token, opcionesCookieSesion(env.nodeEnv));
  registrarEventoAccesoQa({ event: 'qa_backdoor_login', outcome: 'granted' });
  redirect(RUTA_LOGIN);
}
