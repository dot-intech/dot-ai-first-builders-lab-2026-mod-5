import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RepositoryError } from '../../../shared/errors/repository-error';
import * as consumoRepository from '../data/consumo-repository';
import * as modeloVision from '../data/modelo-vision';
import type { EstimacionCruda } from '../data/modelo-vision';
import { analizarImagen, guardarConsumo } from './consumo-service';
import { AnalisisImagenError, DatosConsumoInvalidosError } from './errors';
import type { Consumo, OrigenImagen } from './types';

// Factories explícitas: el automock importaría los módulos reales para descubrir sus exports, y eso
// cargaría `@google/genai`, `env.ts` y el cliente de la BD. Nunca se llama a la API real ni a la BD.
vi.mock('../data/modelo-vision', () => ({
  analizarConModeloVision: vi.fn(),
}));
vi.mock('../data/consumo-repository', () => ({
  crearConsumo: vi.fn(),
}));

const JPEG_MINIMO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function estimacionCruda(parcial: Partial<EstimacionCruda> = {}): EstimacionCruda {
  return {
    descripcion: 'Milanesa con papas fritas y un vaso de agua',
    calorias: 850,
    desglose: { carbohidratos: 45, proteinas: 25, grasas: 30, otros: 0 },
    ...parcial,
  };
}

function datosValidos(origen: OrigenImagen = 'camara'): Record<string, unknown> {
  return {
    descripcion: 'Ensalada César con pollo',
    calorias: 420,
    desglose: { carbohidratos: 20, proteinas: 35, grasas: 40, otros: 5 },
    origen,
  };
}

function consumoGuardado(parcial: Partial<Consumo> = {}): Consumo {
  return {
    id: 'consumo-1',
    usuarioId: 'u-1',
    descripcion: 'Ensalada César con pollo',
    calorias: 420,
    desglose: { carbohidratos: 20, proteinas: 35, grasas: 40, otros: 5 },
    origen: 'camara',
    createdAt: new Date('2026-09-27T12:00:00.000Z'),
    ...parcial,
  };
}

function espiarConsola() {
  return (['log', 'info', 'warn', 'error', 'debug'] as const).map((metodo) =>
    vi.spyOn(console, metodo).mockImplementation(() => undefined),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('consumo-service/analizarImagen', () => {
  it('debe llamar al adaptador con los bytes y devolver el desglose normalizado a 100', async () => {
    vi.mocked(modeloVision.analizarConModeloVision).mockResolvedValue(
      estimacionCruda({
        desglose: { carbohidratos: 33.3, proteinas: 33.3, grasas: 33.3, otros: 0.1 },
      }),
    );

    const estimacion = await analizarImagen(JPEG_MINIMO);

    expect(modeloVision.analizarConModeloVision).toHaveBeenCalledTimes(1);
    expect(modeloVision.analizarConModeloVision).toHaveBeenCalledWith(JPEG_MINIMO);
    expect(estimacion).toEqual({
      descripcion: 'Milanesa con papas fritas y un vaso de agua',
      calorias: 850,
      desglose: { carbohidratos: 34, proteinas: 33, grasas: 33, otros: 0 },
    });
    expect(Number.isInteger(estimacion.calorias)).toBe(true);
  });

  it('debe rechazar bytes PNG con imagen-invalida sin llamar al adaptador', async () => {
    const error = await analizarImagen(PNG).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AnalisisImagenError);
    expect((error as AnalisisImagenError).reason).toBe('imagen-invalida');
    expect(modeloVision.analizarConModeloVision).not.toHaveBeenCalled();
  });

  it('debe propagar el mismo AnalisisImagenError de timeout del adaptador, sin loguear', async () => {
    const espias = espiarConsola();
    const timeout = new AnalisisImagenError('timeout', { cause: new Error('aborted') });
    vi.mocked(modeloVision.analizarConModeloVision).mockRejectedValue(timeout);

    await expect(analizarImagen(JPEG_MINIMO)).rejects.toBe(timeout);
    for (const espia of espias) {
      expect(espia).not.toHaveBeenCalled();
    }
  });

  it('debe rechazar con respuesta-invalida si el desglose es todo 0 con calorías > 0', async () => {
    vi.mocked(modeloVision.analizarConModeloVision).mockResolvedValue(
      estimacionCruda({
        calorias: 150,
        desglose: { carbohidratos: 0, proteinas: 0, grasas: 0, otros: 0 },
      }),
    );

    const error = await analizarImagen(JPEG_MINIMO).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AnalisisImagenError);
    expect((error as AnalisisImagenError).reason).toBe('respuesta-invalida');
  });

  it('debe asignar otros: 100 a un consumo de 0 kcal con el desglose todo en 0', async () => {
    vi.mocked(modeloVision.analizarConModeloVision).mockResolvedValue(
      estimacionCruda({
        descripcion: 'Un vaso de agua',
        calorias: 0,
        desglose: { carbohidratos: 0, proteinas: 0, grasas: 0, otros: 0 },
      }),
    );

    const estimacion = await analizarImagen(JPEG_MINIMO);

    expect(estimacion).toEqual({
      descripcion: 'Un vaso de agua',
      calorias: 0,
      desglose: { carbohidratos: 0, proteinas: 0, grasas: 0, otros: 100 },
    });
  });

  it('debe redondear las calorías a entero', async () => {
    vi.mocked(modeloVision.analizarConModeloVision).mockResolvedValue(
      estimacionCruda({ calorias: 849.6 }),
    );

    const estimacion = await analizarImagen(JPEG_MINIMO);

    expect(estimacion.calorias).toBe(850);
  });

  it('debe normalizar con las calorías ya redondeadas (0.4 kcal cuenta como 0 kcal)', async () => {
    vi.mocked(modeloVision.analizarConModeloVision).mockResolvedValue(
      estimacionCruda({
        calorias: 0.4,
        desglose: { carbohidratos: 0, proteinas: 0, grasas: 0, otros: 0 },
      }),
    );

    const estimacion = await analizarImagen(JPEG_MINIMO);

    expect(estimacion).toEqual({
      descripcion: 'Milanesa con papas fritas y un vaso de agua',
      calorias: 0,
      desglose: { carbohidratos: 0, proteinas: 0, grasas: 0, otros: 100 },
    });
  });
});

describe('consumo-service/guardarConsumo', () => {
  it('debe usar el usuarioId del parámetro aunque la entrada traiga otro', async () => {
    const guardado = consumoGuardado();
    vi.mocked(consumoRepository.crearConsumo).mockResolvedValue(guardado);

    const resultado = await guardarConsumo('u-1', { ...datosValidos(), usuarioId: 'otro' });

    expect(consumoRepository.crearConsumo).toHaveBeenCalledTimes(1);
    expect(consumoRepository.crearConsumo).toHaveBeenCalledWith({
      descripcion: 'Ensalada César con pollo',
      calorias: 420,
      desglose: { carbohidratos: 20, proteinas: 35, grasas: 40, otros: 5 },
      origen: 'camara',
      usuarioId: 'u-1',
    });
    expect(resultado).toBe(guardado);
  });

  it.each<OrigenImagen>(['camara', 'galeria'])(
    'debe persistir el origen %s tal como llega',
    async (origen) => {
      vi.mocked(consumoRepository.crearConsumo).mockResolvedValue(consumoGuardado({ origen }));

      const resultado = await guardarConsumo('u-1', datosValidos(origen));

      expect(consumoRepository.crearConsumo).toHaveBeenCalledWith(
        expect.objectContaining({ origen, usuarioId: 'u-1' }),
      );
      expect(resultado.origen).toBe(origen);
    },
  );

  it('debe rechazar un desglose que suma 99 sin llamar al repository', async () => {
    const entrada = {
      ...datosValidos(),
      desglose: { carbohidratos: 20, proteinas: 35, grasas: 40, otros: 4 },
    };

    const error = await guardarConsumo('u-1', entrada).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DatosConsumoInvalidosError);
    expect((error as DatosConsumoInvalidosError).campo).toBe('desglose');
    expect(consumoRepository.crearConsumo).not.toHaveBeenCalled();
  });

  it('debe propagar el mismo RepositoryError del repository, sin loguear', async () => {
    const espias = espiarConsola();
    const fallo = new RepositoryError('consumos.crear', { cause: new Error('fk violada') });
    vi.mocked(consumoRepository.crearConsumo).mockRejectedValue(fallo);

    await expect(guardarConsumo('u-1', datosValidos())).rejects.toBe(fallo);
    for (const espia of espias) {
      expect(espia).not.toHaveBeenCalled();
    }
  });
});
