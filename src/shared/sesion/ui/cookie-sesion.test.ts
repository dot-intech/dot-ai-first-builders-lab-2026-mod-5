import { describe, expect, it } from 'vitest';
import { NOMBRE_COOKIE_SESION, opcionesCookieSesion } from './cookie-sesion';

describe('cookie-sesion/NOMBRE_COOKIE_SESION', () => {
  it('debe ser nutrashot_session', () => {
    expect(NOMBRE_COOKIE_SESION).toBe('nutrashot_session');
  });
});

describe('cookie-sesion/opcionesCookieSesion', () => {
  it('debe ser httpOnly, sameSite lax y válida para todo el sitio (NFR-02)', () => {
    expect(opcionesCookieSesion('development')).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('debe ser una cookie de sesión del navegador: sin maxAge ni expires (ADR-002)', () => {
    const opciones = opcionesCookieSesion('development');

    expect(opciones).not.toHaveProperty('maxAge');
    expect(opciones).not.toHaveProperty('expires');
  });

  it.each(['development', 'test'])('debe no exigir secure en %s', (nodeEnv) => {
    expect(opcionesCookieSesion(nodeEnv).secure).toBe(false);
  });

  it.each(['production', 'staging', 'preview', ''])(
    'debe exigir secure en %j (falla cerrado)',
    (nodeEnv) => {
      expect(opcionesCookieSesion(nodeEnv).secure).toBe(true);
    },
  );
});
