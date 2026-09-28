import { describe, expect, it } from 'vitest';
import {
  CALIDAD_INICIAL,
  ImagenNoProcesableError,
  calcularDimensiones,
  dimensionesParaReencodear,
  siguienteCalidad,
} from './reducir-imagen';

describe('reducir-imagen', () => {
  describe('calcularDimensiones', () => {
    it('debe escalar una imagen apaisada para que el lado mayor sea 1280', () => {
      expect(calcularDimensiones(4000, 3000)).toEqual({ ancho: 1280, alto: 960 });
    });

    it('no debe agrandar una imagen más chica que el máximo', () => {
      expect(calcularDimensiones(800, 600)).toEqual({ ancho: 800, alto: 600 });
    });

    it('debe escalar una imagen vertical para que el lado mayor sea 1280', () => {
      expect(calcularDimensiones(3000, 4000)).toEqual({ ancho: 960, alto: 1280 });
    });

    it('debe dejar igual una imagen cuyo lado mayor es exactamente el máximo', () => {
      expect(calcularDimensiones(1280, 720)).toEqual({ ancho: 1280, alto: 720 });
    });

    it('debe respetar un máximo explícito', () => {
      expect(calcularDimensiones(2000, 1000, 500)).toEqual({ ancho: 500, alto: 250 });
    });

    it('debe redondear y nunca devolver un lado de 0', () => {
      expect(calcularDimensiones(10000, 1)).toEqual({ ancho: 1280, alto: 1 });
      expect(calcularDimensiones(1000, 3333, 1000)).toEqual({ ancho: 300, alto: 1000 });
    });

    it.each([
      [0, 100],
      [100, 0],
      [-1, 100],
      [100, -5],
      [10.5, 100],
      [100, Number.NaN],
      [Number.POSITIVE_INFINITY, 100],
    ])('con (%s, %s) debe lanzar RangeError', (ancho, alto) => {
      expect(() => calcularDimensiones(ancho, alto)).toThrow(RangeError);
    });
  });

  describe('dimensionesParaReencodear', () => {
    it('debe devolver lo mismo que calcularDimensiones con un bitmap válido', () => {
      expect(dimensionesParaReencodear(4000, 3000)).toEqual({ ancho: 1280, alto: 960 });
    });

    it.each([
      [0, 0],
      [0, 100],
      [100, -1],
    ])(
      'con un bitmap de %s × %s debe lanzar ImagenNoProcesableError no-legible con la causa',
      (ancho, alto) => {
        let lanzado: unknown;
        try {
          dimensionesParaReencodear(ancho, alto);
        } catch (error) {
          lanzado = error;
        }

        expect(lanzado).toBeInstanceOf(ImagenNoProcesableError);
        expect((lanzado as ImagenNoProcesableError).reason).toBe('no-legible');
        expect((lanzado as ImagenNoProcesableError).cause).toBeInstanceOf(RangeError);
      },
    );
  });

  describe('siguienteCalidad', () => {
    it('con 900 000 bytes o menos debe devolver la misma calidad', () => {
      expect(siguienteCalidad(900_000, 0.9)).toBe(0.9);
      expect(siguienteCalidad(10, 0.5)).toBe(0.5);
    });

    it('con más de 900 000 bytes debe bajar la calidad en 0,1', () => {
      expect(siguienteCalidad(900_001, 0.9)).toBe(0.8);
      expect(siguienteCalidad(2_000_000, 0.8)).toBe(0.7);
      // Sin ruido de punto flotante (0.7 - 0.1 = 0.6000000000000001).
      expect(siguienteCalidad(2_000_000, 0.7)).toBe(0.6);
      expect(siguienteCalidad(2_000_000, 0.6)).toBe(0.5);
    });

    it('no debe bajar de 0,5', () => {
      expect(siguienteCalidad(2_000_000, 0.55)).toBe(0.5);
    });

    it('con 0,5 y la imagen todavía grande debe devolver null', () => {
      expect(siguienteCalidad(900_001, 0.5)).toBeNull();
    });

    it('la calidad inicial debe estar entre 0,5 y 1', () => {
      expect(CALIDAD_INICIAL).toBeGreaterThan(0.5);
      expect(CALIDAD_INICIAL).toBeLessThanOrEqual(1);
    });
  });

  describe('ImagenNoProcesableError', () => {
    it.each(['no-legible', 'demasiado-grande'] as const)(
      'debe llevar el motivo %s con un mensaje fijo',
      (reason) => {
        const causa = new Error('detalle del navegador');

        const error = new ImagenNoProcesableError(reason, { cause: causa });

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('ImagenNoProcesableError');
        expect(error.reason).toBe(reason);
        expect(error.message).toBe('No se pudo procesar la imagen');
        expect(error.cause).toBe(causa);
      },
    );
  });
});
