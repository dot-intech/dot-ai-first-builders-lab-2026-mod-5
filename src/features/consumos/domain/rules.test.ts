import { describe, expect, it } from 'vitest';

import { AnalisisImagenError, DatosConsumoInvalidosError } from './errors';
import {
  CALORIAS_MAX,
  DESCRIPCION_MAX,
  IMAGEN_MAX_BYTES,
  esJpeg,
  normalizarDesglose,
  sumaDesglose,
  validarDatosConsumo,
  validarImagen,
} from './rules';
import type { DesgloseNutricional } from './types';

/** Devuelve lo lanzado por `fn`, o `undefined` si no lanzó (y la aserción siguiente falla). */
function capturar(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

function jpegDe(largo: number): Uint8Array {
  const bytes = new Uint8Array(largo);
  bytes.set([0xff, 0xd8, 0xff].slice(0, largo));
  return bytes;
}

function datosValidos() {
  return {
    descripcion: 'Milanesa con puré',
    calorias: 850,
    desglose: { carbohidratos: 40, proteinas: 30, grasas: 25, otros: 5 },
    origen: 'camara',
  };
}

describe('límites', () => {
  it('deben coincidir con los CHECKs de la tabla consumos y el tope de imagen de la spec', () => {
    expect(DESCRIPCION_MAX).toBe(500);
    expect(CALORIAS_MAX).toBe(10000);
    expect(IMAGEN_MAX_BYTES).toBe(950_000);
  });
});

describe('esJpeg', () => {
  it('debe devolver true si los primeros 3 bytes son FF D8 FF', () => {
    expect(esJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe(true);
  });

  it.each([
    ['PNG', [0x89, 0x50, 0x4e, 0x47]],
    ['FF D8 sin el tercer byte', [0xff, 0xd8]],
    ['FF D8 00', [0xff, 0xd8, 0x00]],
    ['vacío', []],
  ])('debe devolver false para %s', (_nombre, bytes) => {
    expect(esJpeg(new Uint8Array(bytes))).toBe(false);
  });
});

describe('validarImagen', () => {
  it('debe aceptar un JPEG mínimo (FF D8 FF …)', () => {
    expect(() => validarImagen(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).not.toThrow();
  });

  it('debe aceptar un JPEG de exactamente IMAGEN_MAX_BYTES', () => {
    expect(() => validarImagen(jpegDe(950_000))).not.toThrow();
  });

  it.each([
    ['0 bytes', new Uint8Array(0)],
    ['950 001 bytes', jpegDe(950_001)],
    ['un PNG', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['texto', new TextEncoder().encode('esto no es una imagen')],
  ])("con %s debe lanzar AnalisisImagenError('imagen-invalida')", (_nombre, bytes) => {
    const error = capturar(() => validarImagen(bytes));

    expect(error).toBeInstanceOf(AnalisisImagenError);
    expect((error as AnalisisImagenError).reason).toBe('imagen-invalida');
  });
});

describe('sumaDesglose', () => {
  it('debe sumar los 4 porcentajes', () => {
    expect(sumaDesglose({ carbohidratos: 40, proteinas: 30, grasas: 20, otros: 9 })).toBe(99);
  });
});

describe('normalizarDesglose', () => {
  it('con { 33.3, 33.3, 33.3, 0.1 } debe devolver enteros que suman exactamente 100', () => {
    const resultado = normalizarDesglose(
      { carbohidratos: 33.3, proteinas: 33.3, grasas: 33.3, otros: 0.1 },
      300,
    );

    for (const valor of Object.values(resultado)) {
      expect(Number.isInteger(valor)).toBe(true);
    }
    expect(sumaDesglose(resultado)).toBe(100);
    // 33.3 → 33 (resto .3) ×3, 0.1 → 0 (resto .1): el punto que falta va al primero con mayor resto.
    expect(resultado).toEqual({ carbohidratos: 34, proteinas: 33, grasas: 33, otros: 0 });
  });

  it('con valores que ya suman 100 debe devolverlos iguales', () => {
    const crudo = { carbohidratos: 50, proteinas: 20, grasas: 20, otros: 10 };

    expect(normalizarDesglose(crudo, 500)).toEqual(crudo);
  });

  it('con suma 50 debe escalarlos al doble', () => {
    expect(
      normalizarDesglose({ carbohidratos: 25, proteinas: 10, grasas: 10, otros: 5 }, 500),
    ).toEqual({ carbohidratos: 50, proteinas: 20, grasas: 20, otros: 10 });
  });

  it('debe resolver empates de resto en el orden fijo carbohidratos → proteinas → grasas → otros', () => {
    // 16.67 ×3 y 50: faltan 2 puntos y los tres primeros empatan en resto → carbohidratos y proteinas.
    expect(
      normalizarDesglose({ carbohidratos: 1, proteinas: 1, grasas: 1, otros: 3 }, 100),
    ).toEqual({ carbohidratos: 17, proteinas: 17, grasas: 16, otros: 50 });
    // 0 y 33.33 ×3: falta 1 punto y empatan proteinas, grasas y otros → proteinas.
    expect(
      normalizarDesglose({ carbohidratos: 0, proteinas: 1, grasas: 1, otros: 1 }, 100),
    ).toEqual({ carbohidratos: 0, proteinas: 34, grasas: 33, otros: 33 });
    // El orden de las claves en el objeto de entrada no cambia el desempate.
    expect(
      normalizarDesglose({ otros: 1, grasas: 1, proteinas: 1, carbohidratos: 0 }, 100),
    ).toEqual({ carbohidratos: 0, proteinas: 34, grasas: 33, otros: 33 });
  });

  it.each<[DesgloseNutricional, DesgloseNutricional]>([
    [
      { carbohidratos: 0, proteinas: 0, grasas: 46, otros: 34 },
      { carbohidratos: 0, proteinas: 0, grasas: 58, otros: 42 },
    ],
    [
      { carbohidratos: 0, proteinas: 1, grasas: 1, otros: 10 },
      { carbohidratos: 0, proteinas: 9, grasas: 8, otros: 83 },
    ],
    [
      { carbohidratos: 0, proteinas: 1, grasas: 1, otros: 58 },
      { carbohidratos: 0, proteinas: 2, grasas: 2, otros: 96 },
    ],
  ])(
    'con %o debe respetar el orden fijo en un empate exacto de resto pese al ruido de punto flotante',
    (crudo, esperado) => {
      expect(normalizarDesglose(crudo, 100)).toEqual(esperado);
    },
  );

  it('debe dar el punto al mayor resto antes que al orden fijo', () => {
    // 33.33 y 66.67: falta 1 punto y proteinas tiene el mayor resto.
    expect(
      normalizarDesglose({ carbohidratos: 1, proteinas: 2, grasas: 0, otros: 0 }, 100),
    ).toEqual({ carbohidratos: 33, proteinas: 67, grasas: 0, otros: 0 });
    // 20.41 ×3 y 38.78: faltan 2 puntos → otros (mayor resto) y luego carbohidratos (desempate).
    expect(
      normalizarDesglose({ carbohidratos: 1, proteinas: 1, grasas: 1, otros: 1.9 }, 100),
    ).toEqual({ carbohidratos: 21, proteinas: 20, grasas: 20, otros: 39 });
  });

  it('con los 4 valores en 0 y calorias = 0 debe devolver otros: 100', () => {
    expect(normalizarDesglose({ carbohidratos: 0, proteinas: 0, grasas: 0, otros: 0 }, 0)).toEqual({
      carbohidratos: 0,
      proteinas: 0,
      grasas: 0,
      otros: 100,
    });
  });

  it('con un valor finito enorme (1e307) no debe desbordar al escalar', () => {
    expect(
      normalizarDesglose({ carbohidratos: 1e307, proteinas: 0, grasas: 0, otros: 0 }, 100),
    ).toEqual({ carbohidratos: 100, proteinas: 0, grasas: 0, otros: 0 });
  });

  it('con los 4 valores en 1e307 (suma finita) debe repartir 25 a cada uno', () => {
    expect(
      normalizarDesglose(
        { carbohidratos: 1e307, proteinas: 1e307, grasas: 1e307, otros: 1e307 },
        100,
      ),
    ).toEqual({ carbohidratos: 25, proteinas: 25, grasas: 25, otros: 25 });
  });

  it('con calorias = 0 pero valores > 0 debe normalizarlos igual', () => {
    expect(normalizarDesglose({ carbohidratos: 0, proteinas: 0, grasas: 0, otros: 1 }, 0)).toEqual({
      carbohidratos: 0,
      proteinas: 0,
      grasas: 0,
      otros: 100,
    });
  });

  it.each<[string, DesgloseNutricional, number]>([
    ['un negativo', { carbohidratos: -1, proteinas: 50, grasas: 30, otros: 21 }, 300],
    ['NaN', { carbohidratos: Number.NaN, proteinas: 50, grasas: 30, otros: 20 }, 300],
    ['Infinity', { carbohidratos: 10, proteinas: Infinity, grasas: 30, otros: 20 }, 300],
    ['-Infinity', { carbohidratos: 10, proteinas: 50, grasas: -Infinity, otros: 20 }, 300],
    ['suma 0 con calorias = 150', { carbohidratos: 0, proteinas: 0, grasas: 0, otros: 0 }, 150],
    ['suma 0 con calorias NaN', { carbohidratos: 0, proteinas: 0, grasas: 0, otros: 0 }, NaN],
    [
      'una suma que desborda a Infinity',
      { carbohidratos: Number.MAX_VALUE, proteinas: Number.MAX_VALUE, grasas: 0, otros: 0 },
      300,
    ],
  ])("con %s debe lanzar AnalisisImagenError('respuesta-invalida')", (_nombre, crudo, calorias) => {
    const error = capturar(() => normalizarDesglose(crudo, calorias));

    expect(error).toBeInstanceOf(AnalisisImagenError);
    expect((error as AnalisisImagenError).reason).toBe('respuesta-invalida');
  });
});

describe('validarDatosConsumo', () => {
  function campoDelError(entrada: unknown): unknown {
    const error = capturar(() => validarDatosConsumo(entrada));
    expect(error).toBeInstanceOf(DatosConsumoInvalidosError);
    return (error as DatosConsumoInvalidosError).campo;
  }

  it('con datos válidos debe devolver un objeto nuevo con la descripción recortada', () => {
    const entrada = { ...datosValidos(), descripcion: '  Milanesa con puré \n' };

    const resultado = validarDatosConsumo(entrada);

    expect(resultado).toEqual({
      descripcion: 'Milanesa con puré',
      calorias: 850,
      desglose: { carbohidratos: 40, proteinas: 30, grasas: 25, otros: 5 },
      origen: 'camara',
    });
    expect(resultado).not.toBe(entrada);
    expect(resultado.desglose).not.toBe(entrada.desglose);
  });

  it('debe aceptar los bordes: descripción de 500, 0 y 10000 calorías, origen galeria', () => {
    const base = datosValidos();

    expect(validarDatosConsumo({ ...base, descripcion: 'a'.repeat(500) }).descripcion).toHaveLength(
      500,
    );
    // Se cuentan caracteres (code points), como `char_length` en la BD, no unidades UTF-16.
    expect(validarDatosConsumo({ ...base, descripcion: '🍎'.repeat(500) }).descripcion).toBe(
      '🍎'.repeat(500),
    );
    expect(validarDatosConsumo({ ...base, calorias: 0 }).calorias).toBe(0);
    expect(validarDatosConsumo({ ...base, calorias: 10000 }).calorias).toBe(10000);
    expect(validarDatosConsumo({ ...base, origen: 'galeria' }).origen).toBe('galeria');
    expect(
      validarDatosConsumo({
        ...base,
        desglose: { carbohidratos: 0, proteinas: 0, grasas: 0, otros: 100 },
      }).desglose,
    ).toEqual({ carbohidratos: 0, proteinas: 0, grasas: 0, otros: 100 });
  });

  it('debe descartar usuarioId y cualquier campo extra, también dentro del desglose', () => {
    const entrada = {
      ...datosValidos(),
      usuarioId: '00000000-0000-0000-0000-000000000001',
      id: 'x',
      extra: true,
      desglose: { carbohidratos: 40, proteinas: 30, grasas: 25, otros: 5, fibra: 3 },
    };

    const resultado = validarDatosConsumo(entrada);

    expect(Object.keys(resultado).sort()).toEqual([
      'calorias',
      'descripcion',
      'desglose',
      'origen',
    ]);
    expect(Object.keys(resultado.desglose).sort()).toEqual([
      'carbohidratos',
      'grasas',
      'otros',
      'proteinas',
    ]);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['un string', 'datos'],
    ['un array', [datosValidos()]],
    ['un número', 42],
  ])("con %s debe lanzar DatosConsumoInvalidosError('forma')", (_nombre, entrada) => {
    expect(campoDelError(entrada)).toBe('forma');
  });

  it.each([
    ["''", ''],
    ["'   '", '   '],
    ['501 caracteres', 'a'.repeat(501)],
    ['501 caracteres tras el trim', `  ${'a'.repeat(501)}  `],
    ['un número', 123],
    ['ausente', undefined],
  ])("con descripción %s debe lanzar campo 'descripcion'", (_nombre, descripcion) => {
    expect(campoDelError({ ...datosValidos(), descripcion })).toBe('descripcion');
  });

  it.each([
    ['-1', -1],
    ['10001', 10001],
    ['12.5', 12.5],
    ["'100'", '100'],
    ['NaN', Number.NaN],
    ['Infinity', Infinity],
  ])("con calorías %s debe lanzar campo 'calorias'", (_nombre, calorias) => {
    expect(campoDelError({ ...datosValidos(), calorias })).toBe('calorias');
  });

  it.each([
    ['que suman 99', { carbohidratos: 40, proteinas: 30, grasas: 25, otros: 4 }],
    ['con un 101', { carbohidratos: 101, proteinas: 0, grasas: 0, otros: -1 }],
    ['con un negativo', { carbohidratos: 50, proteinas: 51, grasas: 0, otros: -1 }],
    ['con un decimal', { carbohidratos: 40.5, proteinas: 29.5, grasas: 25, otros: 5 }],
    ['con una clave faltante', { carbohidratos: 40, proteinas: 30, grasas: 30 }],
    ['con un string', { carbohidratos: '40', proteinas: 30, grasas: 25, otros: 5 }],
    ['null', null],
    ['un número', 100],
  ])("con porcentajes %s debe lanzar campo 'desglose'", (_nombre, desglose) => {
    expect(campoDelError({ ...datosValidos(), desglose })).toBe('desglose');
  });

  it.each([
    ["'otro'", 'otro'],
    ['ausente', undefined],
    ["'Camara' (mayúscula)", 'Camara'],
  ])("con origen %s debe lanzar campo 'origen'", (_nombre, origen) => {
    expect(campoDelError({ ...datosValidos(), origen })).toBe('origen');
  });
});
