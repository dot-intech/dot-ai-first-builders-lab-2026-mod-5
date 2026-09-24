import { cookieSesionEsSecure } from '../domain/rules';

export const NOMBRE_COOKIE_SESION = 'nutrashot_session';

/**
 * Sin `maxAge`: es una cookie de sesión del navegador y la BD aplica la ventana deslizante de 24 h
 * de inactividad; un `maxAge` fijo desloguearía a un usuario activo (ADR-002).
 */
export function opcionesCookieSesion(nodeEnv: string) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSesionEsSecure(nodeEnv),
    path: '/',
  } as const;
}
