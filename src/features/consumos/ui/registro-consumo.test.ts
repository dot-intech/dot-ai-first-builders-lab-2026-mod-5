import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { registrarEventoConsumo } from './registro-consumo';

const AHORA = new Date('2026-09-26T12:00:00.000Z');

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

describe('registro-consumo/registrarEventoConsumo', () => {
  it('debe escribir una sola línea JSON con event, outcome y timestamp ISO', () => {
    registrarEventoConsumo({ event: 'consumo_guardado', outcome: 'ok' });

    expect(lineaRegistrada(info)).toEqual({
      event: 'consumo_guardado',
      outcome: 'ok',
      timestamp: AHORA.toISOString(),
    });
  });

  it('debe incluir reason cuando el evento se rechaza', () => {
    registrarEventoConsumo({
      event: 'consumo_analisis',
      outcome: 'rechazado',
      reason: 'imagen-invalida',
    });

    expect(lineaRegistrada(warn)).toEqual({
      event: 'consumo_analisis',
      outcome: 'rechazado',
      reason: 'imagen-invalida',
      timestamp: AHORA.toISOString(),
    });
  });

  it('debe incluir operation cuando hay un error de datos', () => {
    registrarEventoConsumo({
      event: 'consumo_sesion',
      outcome: 'error',
      operation: 'sesion.findByTokenHash',
    });

    expect(lineaRegistrada(error)).toEqual({
      event: 'consumo_sesion',
      outcome: 'error',
      operation: 'sesion.findByTokenHash',
      timestamp: AHORA.toISOString(),
    });
  });

  describe('nivel de log según el outcome', () => {
    it('debe usar console.info para ok y no escribir en warn ni en error', () => {
      registrarEventoConsumo({ event: 'consumo_analisis', outcome: 'ok' });

      expect(info).toHaveBeenCalledTimes(1);
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it('debe usar console.warn para rechazado y no escribir en info ni en error', () => {
      registrarEventoConsumo({
        event: 'consumo_guardado',
        outcome: 'rechazado',
        reason: 'desglose',
      });

      expect(warn).toHaveBeenCalledTimes(1);
      expect(info).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it('debe usar console.error para error y no escribir en info ni en warn', () => {
      registrarEventoConsumo({ event: 'consumo_analisis', outcome: 'error', reason: 'timeout' });

      expect(error).toHaveBeenCalledTimes(1);
      expect(info).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('debe registrar solo los 5 campos conocidos: nunca imagen, respuesta del modelo, usuarioId ni cause', () => {
    // Se cuela un objeto con campos extra (lo que el tipo ya impide) para verificar la garantía en runtime.
    const conCamposExtra = {
      event: 'consumo_analisis',
      outcome: 'error',
      reason: 'fallo',
      operation: 'consumos.crear',
      usuarioId: 'usuario-secreto-1',
      imagen: '/9j/4AAQSkZJRgABAQBASE64',
      respuesta: '{"descripcion":"milanesa con papas"}',
      cause: new Error('ApiError 500: quota exceeded for key AIza-secreta'),
      message: 'No se pudo analizar la imagen',
    } as unknown as Parameters<typeof registrarEventoConsumo>[0];

    registrarEventoConsumo(conCamposExtra);

    const linea = lineaRegistrada(error);
    expect(Object.keys(linea).sort()).toEqual([
      'event',
      'operation',
      'outcome',
      'reason',
      'timestamp',
    ]);
    expect(JSON.stringify(linea)).not.toMatch(
      /usuario-secreto-1|BASE64|milanesa|ApiError|AIza|No se pudo/,
    );
  });
});
