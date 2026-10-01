import { describe, expect, it } from 'vitest';

import {
  AnalisisImagenError,
  type AnalisisImagenReason,
  type CampoDatosConsumo,
  DatosConsumoInvalidosError,
} from './errors';

const RAZONES: AnalisisImagenReason[] = [
  'imagen-invalida',
  'no-configurado',
  'timeout',
  'fallo',
  'respuesta-invalida',
];

const CAMPOS: CampoDatosConsumo[] = [
  'forma',
  'descripcion',
  'calorias',
  'desglose',
  'origen',
  'solicitudId',
];

describe('AnalisisImagenError', () => {
  it.each(RAZONES)(
    '(reason=%s) debe ser instancia de Error y de su clase, con su name propio',
    (reason) => {
      const error = new AnalisisImagenError(reason);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AnalisisImagenError);
      expect(error.name).toBe('AnalisisImagenError');
    },
  );

  it.each(RAZONES)('debe exponer reason=%s como propiedad pública', (reason) => {
    expect(new AnalisisImagenError(reason).reason).toBe(reason);
  });

  it.each(RAZONES)('debe usar el message fijo sin revelar el reason (%s)', (reason) => {
    const error = new AnalisisImagenError(reason);

    expect(error.message).toBe('No se pudo analizar la imagen');
    expect(error.message).not.toContain(reason);
  });

  it('debe conservar el cause sin copiarlo al message', () => {
    const causa = new Error('API key AIza-secreta rechazada por el proveedor');
    const error = new AnalisisImagenError('fallo', { cause: causa });

    expect(error.cause).toBe(causa);
    expect(error.message).not.toContain(causa.message);
    expect(error.message).not.toContain('AIza');
  });
});

describe('DatosConsumoInvalidosError', () => {
  it.each(CAMPOS)(
    '(campo=%s) debe ser instancia de Error y de su clase, con su name propio',
    (campo) => {
      const error = new DatosConsumoInvalidosError(campo);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DatosConsumoInvalidosError);
      expect(error.name).toBe('DatosConsumoInvalidosError');
    },
  );

  it.each(CAMPOS)('debe exponer campo=%s como propiedad pública', (campo) => {
    expect(new DatosConsumoInvalidosError(campo).campo).toBe(campo);
  });

  it.each(CAMPOS)('debe usar el message fijo sin revelar el campo (%s)', (campo) => {
    const error = new DatosConsumoInvalidosError(campo);

    expect(error.message).toBe('Los datos del consumo no son válidos');
    expect(error.message).not.toContain(campo);
  });

  it('debe conservar el cause sin copiarlo al message', () => {
    const causa = new Error('detalle interno xyz');
    const error = new DatosConsumoInvalidosError('forma', { cause: causa });

    expect(error.cause).toBe(causa);
    expect(error.message).not.toContain(causa.message);
  });
});
