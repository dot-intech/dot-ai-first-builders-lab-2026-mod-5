import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { registrarEventoAccesoQa } from './registro-acceso-qa';

const AHORA = new Date('2026-09-21T12:00:00.000Z');

let info: MockInstance<typeof console.info>;
let warn: MockInstance<typeof console.warn>;
let error: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
  info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function lineaRegistrada(espia: MockInstance<typeof console.info>): Record<string, unknown> {
  expect(espia).toHaveBeenCalledTimes(1);
  return JSON.parse(String(espia.mock.calls[0]?.[0])) as Record<string, unknown>;
}

describe('registro-acceso-qa/registrarEventoAccesoQa', () => {
  it('debe escribir una sola línea JSON con event, outcome y timestamp ISO', () => {
    registrarEventoAccesoQa({ event: 'qa_backdoor_login', outcome: 'granted' });

    expect(lineaRegistrada(info)).toEqual({
      event: 'qa_backdoor_login',
      outcome: 'granted',
      timestamp: AHORA.toISOString(),
    });
  });

  it('debe incluir reason cuando el acceso se deniega', () => {
    registrarEventoAccesoQa({
      event: 'qa_backdoor_login',
      outcome: 'denied',
      reason: 'environment_not_allowed',
    });

    expect(lineaRegistrada(warn)).toMatchObject({
      outcome: 'denied',
      reason: 'environment_not_allowed',
    });
  });

  it('debe incluir operation cuando hay un error de datos', () => {
    registrarEventoAccesoQa({
      event: 'dev_login_page',
      outcome: 'error',
      operation: 'sesion.findByTokenHash',
    });

    expect(lineaRegistrada(error)).toMatchObject({
      event: 'dev_login_page',
      outcome: 'error',
      operation: 'sesion.findByTokenHash',
    });
  });

  describe('nivel de log según el outcome', () => {
    it('debe usar console.info para granted y no escribir en warn ni en error', () => {
      registrarEventoAccesoQa({ event: 'qa_backdoor_login', outcome: 'granted' });

      expect(info).toHaveBeenCalledTimes(1);
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it('debe usar console.warn para denied y no escribir en info ni en error', () => {
      registrarEventoAccesoQa({
        event: 'qa_backdoor_login',
        outcome: 'denied',
        reason: 'not_configured',
      });

      expect(warn).toHaveBeenCalledTimes(1);
      expect(info).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it('debe usar console.error para error y no escribir en info ni en warn', () => {
      registrarEventoAccesoQa({
        event: 'qa_backdoor_login',
        outcome: 'error',
        operation: 'sesion.create',
      });

      expect(error).toHaveBeenCalledTimes(1);
      expect(info).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('debe registrar solo los campos conocidos: nunca email, token, cause ni message', () => {
    // Se cuela un objeto con campos extra (lo que el tipo ya impide) para verificar la garantía en runtime.
    const conCamposExtra = {
      event: 'qa_backdoor_login',
      outcome: 'error',
      operation: 'sesion.create',
      email: 'qa@example.com',
      token: 'token-secreto',
      cause: new Error('insert into sesiones ... token-secreto'),
      message: 'qa@example.com',
    } as unknown as Parameters<typeof registrarEventoAccesoQa>[0];

    registrarEventoAccesoQa(conCamposExtra);

    const linea = lineaRegistrada(error);
    expect(Object.keys(linea).sort()).toEqual(['event', 'operation', 'outcome', 'timestamp']);
    expect(JSON.stringify(linea)).not.toMatch(/qa@example\.com|token-secreto|insert/);
  });
});
