import { describe, expect, it } from 'vitest';

import * as rules from './rules';

import {
  INACTIVIDAD_MAXIMA_MS,
  cookieSesionEsSecure,
  normalizarEmail,
  sesionExpiradaPorInactividad,
} from './rules';

const MINUTO_MS = 60 * 1000;
const HORA_MS = 60 * MINUTO_MS;

describe('cookieSesionEsSecure', () => {
  it.each(['development', 'test'])('debe devolver false para %j', (nodeEnv) => {
    expect(cookieSesionEsSecure(nodeEnv)).toBe(false);
  });

  it.each(['production', 'staging', '', '   ', 'prod', 'preview', 'Development', 'TEST'])(
    'debe devolver true para %j (secure por defecto, comparación exacta)',
    (nodeEnv) => {
      expect(cookieSesionEsSecure(nodeEnv)).toBe(true);
    },
  );

  it('no debe exportar la lista de entornos sin secure: un array exportado es mutable en runtime', () => {
    expect(Object.keys(rules)).not.toContain('ENTORNOS_SIN_COOKIE_SECURE');
  });
});

describe('INACTIVIDAD_MAXIMA_MS', () => {
  it('debe valer 24 horas en milisegundos', () => {
    expect(INACTIVIDAD_MAXIMA_MS).toBe(24 * HORA_MS);
  });
});

describe('sesionExpiradaPorInactividad', () => {
  const now = new Date('2026-09-19T12:00:00.000Z');

  it('debe devolver false a las 23h59m de inactividad y true a las 24h01m', () => {
    const hace23h59m = new Date(now.getTime() - (23 * HORA_MS + 59 * MINUTO_MS));
    const hace24h01m = new Date(now.getTime() - (24 * HORA_MS + 1 * MINUTO_MS));

    expect(sesionExpiradaPorInactividad(hace23h59m, now)).toBe(false);
    expect(sesionExpiradaPorInactividad(hace24h01m, now)).toBe(true);
  });

  it('debe devolver false con exactamente 24h de inactividad', () => {
    const hace24h = new Date(now.getTime() - 24 * HORA_MS);

    expect(sesionExpiradaPorInactividad(hace24h, now)).toBe(false);
  });

  it('debe fallar cerrado (true) si lastActivityAt es una fecha inválida', () => {
    expect(sesionExpiradaPorInactividad(new Date('invalid'), now)).toBe(true);
  });

  it('debe fallar cerrado (true) si now es una fecha inválida', () => {
    const reciente = new Date(now.getTime() - MINUTO_MS);

    expect(sesionExpiradaPorInactividad(reciente, new Date('invalid'))).toBe(true);
  });

  it('debe devolver false si lastActivityAt es futura (desfase de reloj)', () => {
    const futura = new Date(now.getTime() + 5 * MINUTO_MS);

    expect(sesionExpiradaPorInactividad(futura, now)).toBe(false);
  });
});

describe('normalizarEmail', () => {
  it('debe quitar espacios de los extremos', () => {
    expect(normalizarEmail('  qa@example.com  ')).toBe('qa@example.com');
  });

  it('debe pasar a minúsculas', () => {
    expect(normalizarEmail('QA@Example.COM')).toBe('qa@example.com');
  });

  it('debe combinar ambas normalizaciones', () => {
    expect(normalizarEmail(' QA@Example.com\t')).toBe('qa@example.com');
  });
});
