import { describe, expect, it, vi } from 'vitest';
import type { EstimacionNutricional } from '../domain/types';
import type { Borrador } from './flujo-nuevo-consumo';
import type { ResultadoAnalisis, ResultadoGuardado } from './operaciones-consumo';
import { procesarGuardado, procesarImagen } from './procesar-imagen';
import { ImagenNoProcesableError } from './reducir-imagen';

const ID = 'solicitud-1';

const ESTIMACION: EstimacionNutricional = {
  descripcion: 'Ensalada',
  calorias: 200,
  desglose: { carbohidratos: 20, proteinas: 10, grasas: 20, otros: 50 },
};

const BORRADOR: Borrador = {
  descripcion: 'Ensalada',
  calorias: '200',
  carbohidratos: '20',
  proteinas: '10',
  grasas: '20',
  otros: '50',
};

const ARCHIVO = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/heic' });
const JPEG = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7])], { type: 'image/jpeg' });

// Recibe una fábrica: la promesa (quizá rechazada) nace recién cuando se llama a la action.
function dependenciasImagen(resultado: () => Promise<ResultadoAnalisis>) {
  return {
    reencodear: vi.fn<(archivo: Blob) => Promise<Blob>>(async () => JPEG),
    analizar: vi.fn<(formData: FormData) => Promise<ResultadoAnalisis>>(() => resultado()),
  };
}

describe('procesar-imagen', () => {
  describe('procesarImagen', () => {
    it('con resultado estimacion debe devolver analisis-ok con el solicitudId y la estimación', async () => {
      const deps = dependenciasImagen(() =>
        Promise.resolve({ tipo: 'estimacion', estimacion: ESTIMACION }),
      );

      const evento = await procesarImagen({ archivo: ARCHIVO, solicitudId: ID }, deps);

      expect(evento).toEqual({ tipo: 'analisis-ok', solicitudId: ID, estimacion: ESTIMACION });
      expect(deps.reencodear).toHaveBeenCalledExactlyOnceWith(ARCHIVO);
    });

    it('debe armar un FormData con el campo imagen igual al blob reencodeado', async () => {
      const deps = dependenciasImagen(() => Promise.resolve({ tipo: 'error' }));

      await procesarImagen({ archivo: ARCHIVO, solicitudId: ID }, deps);

      expect(deps.analizar).toHaveBeenCalledOnce();
      const formData = deps.analizar.mock.calls[0]?.[0];
      expect(formData).toBeInstanceOf(FormData);
      expect([...(formData as FormData).keys()]).toEqual(['imagen']);
      const imagen = (formData as FormData).get('imagen');
      expect(imagen).toBeInstanceOf(Blob);
      expect((imagen as Blob).type).toBe('image/jpeg');
      expect(new Uint8Array(await (imagen as Blob).arrayBuffer())).toEqual(
        new Uint8Array(await JPEG.arrayBuffer()),
      );
    });

    it.each(['no-legible', 'demasiado-grande'] as const)(
      'con reencodear que lanza ImagenNoProcesableError(%s) debe devolver analisis-fallo sin analizar',
      async (reason) => {
        const deps = dependenciasImagen(() => Promise.resolve({ tipo: 'error' }));
        deps.reencodear.mockRejectedValue(new ImagenNoProcesableError(reason));

        const evento = await procesarImagen({ archivo: ARCHIVO, solicitudId: ID }, deps);

        expect(evento).toEqual({ tipo: 'analisis-fallo', solicitudId: ID });
        expect(deps.analizar).not.toHaveBeenCalled();
      },
    );

    it('con analizar que rechaza (cuerpo > 1 MB) debe devolver analisis-fallo', async () => {
      const deps = dependenciasImagen(() => Promise.reject(new Error('Body exceeded 1 MB limit')));

      await expect(procesarImagen({ archivo: ARCHIVO, solicitudId: ID }, deps)).resolves.toEqual({
        tipo: 'analisis-fallo',
        solicitudId: ID,
      });
    });

    it('con resultado error debe devolver analisis-fallo', async () => {
      const deps = dependenciasImagen(() => Promise.resolve({ tipo: 'error' }));

      await expect(procesarImagen({ archivo: ARCHIVO, solicitudId: ID }, deps)).resolves.toEqual({
        tipo: 'analisis-fallo',
        solicitudId: ID,
      });
    });

    it.each<[string, unknown]>([
      ['undefined', undefined],
      ['null', null],
      ['un tipo desconocido', { tipo: 'otra-cosa' }],
      ['un valor que no es objeto', 'estimacion'],
    ])(
      'con un resultado inesperado (%s) debe devolver analisis-fallo sin lanzar',
      async (_nombre, resultado) => {
        const deps = dependenciasImagen(() => Promise.resolve(resultado as ResultadoAnalisis));

        await expect(procesarImagen({ archivo: ARCHIVO, solicitudId: ID }, deps)).resolves.toEqual({
          tipo: 'analisis-fallo',
          solicitudId: ID,
        });
      },
    );

    it('con resultado sin-sesion debe devolver el evento sin-sesion', async () => {
      const deps = dependenciasImagen(() => Promise.resolve({ tipo: 'sin-sesion' }));

      await expect(procesarImagen({ archivo: ARCHIVO, solicitudId: ID }, deps)).resolves.toEqual({
        tipo: 'sin-sesion',
      });
    });
  });

  describe('procesarGuardado', () => {
    const entrada = { borrador: BORRADOR, origen: 'galeria' as const, solicitudId: ID };

    function dependenciasGuardado(resultado: () => Promise<ResultadoGuardado>) {
      return { guardar: vi.fn<(datos: unknown) => Promise<ResultadoGuardado>>(() => resultado()) };
    }

    it('con resultado guardado debe devolver guardado-ok y enviar los datos convertidos', async () => {
      const deps = dependenciasGuardado(() => Promise.resolve({ tipo: 'guardado' }));

      const evento = await procesarGuardado(entrada, deps);

      expect(evento).toEqual({ tipo: 'guardado-ok', solicitudId: ID });
      expect(deps.guardar).toHaveBeenCalledExactlyOnceWith({
        descripcion: 'Ensalada',
        calorias: 200,
        desglose: { carbohidratos: 20, proteinas: 10, grasas: 20, otros: 50 },
        origen: 'galeria',
        solicitudId: ID,
      });
    });

    it('con dos llamadas con el mismo solicitudId debe enviar el mismo id', async () => {
      const deps = dependenciasGuardado(() => Promise.resolve({ tipo: 'error' }));

      await procesarGuardado(entrada, deps);
      await procesarGuardado(entrada, deps);

      const ids = deps.guardar.mock.calls.map(
        ([datos]) => (datos as { solicitudId: string }).solicitudId,
      );
      expect(ids).toEqual([ID, ID]);
    });

    it.each<[string, () => Promise<ResultadoGuardado>, unknown]>([
      [
        'datos-invalidos',
        () => Promise.resolve({ tipo: 'datos-invalidos' }),
        { tipo: 'guardado-fallo', solicitudId: ID, motivo: 'datos-invalidos' },
      ],
      [
        'error',
        () => Promise.resolve({ tipo: 'error' }),
        { tipo: 'guardado-fallo', solicitudId: ID, motivo: 'error' },
      ],
      ['sin-sesion', () => Promise.resolve({ tipo: 'sin-sesion' }), { tipo: 'sin-sesion' }],
      [
        'guardar que rechaza',
        () => Promise.reject(new Error('red')),
        { tipo: 'guardado-fallo', solicitudId: ID, motivo: 'error' },
      ],
      [
        'un resultado null',
        () => Promise.resolve(null as unknown as ResultadoGuardado),
        { tipo: 'guardado-fallo', solicitudId: ID, motivo: 'error' },
      ],
      [
        'un resultado undefined',
        () => Promise.resolve(undefined as unknown as ResultadoGuardado),
        { tipo: 'guardado-fallo', solicitudId: ID, motivo: 'error' },
      ],
      [
        'un tipo desconocido',
        () => Promise.resolve({ tipo: 'otra-cosa' } as unknown as ResultadoGuardado),
        { tipo: 'guardado-fallo', solicitudId: ID, motivo: 'error' },
      ],
    ])('con %s debe devolver el evento documentado', async (_nombre, resultado, esperado) => {
      const deps = dependenciasGuardado(resultado);

      await expect(procesarGuardado(entrada, deps)).resolves.toEqual(esperado);
    });
  });
});
