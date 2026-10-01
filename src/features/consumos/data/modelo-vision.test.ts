import { ApiError } from '@google/genai';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AnalisisImagenError, type AnalisisImagenReason } from '../domain/errors';
import {
  analizarConModeloVision,
  interpretarRespuestaModelo,
  MODELO_VISION,
  TIMEOUT_MODELO_MS,
} from './modelo-vision';

/**
 * El SDK siempre está mockeado: ningún test llama a la API paga, aunque haya una key en el entorno
 * (AGENTS.md, ADR-009). Solo se reemplaza `GoogleGenAI`; `Type` y `ApiError` son los reales para
 * que el adaptador y los tests usen las mismas clases que en producción.
 */

const holder = vi.hoisted(() => ({
  env: { geminiApiKey: 'key-de-test' as string | undefined },
  generateContent: vi.fn(),
  construirSdk: vi.fn(),
}));

vi.mock('@google/genai', async (importOriginal) => {
  const original = await importOriginal<typeof import('@google/genai')>();
  return {
    ...original,
    // `function` y no flecha: el adaptador lo invoca con `new`.
    GoogleGenAI: vi.fn(function (opciones: unknown) {
      holder.construirSdk(opciones);
      return { models: { generateContent: holder.generateContent } };
    }),
  };
});

// Getter (no valor): cada test fija la key antes de invocar el adaptador.
vi.mock('../../../env', () => ({
  get env() {
    return holder.env;
  },
}));

const KEY = 'key-de-test';
const MARCA_RESPUESTA = 'RESPUESTA-DEL-MODELO-7f3a';
// JPEG mínimo con bytes que dan un base64 reconocible en los logs si se filtrara.
const IMAGEN = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x7b]);
const IMAGEN_BASE64 = Buffer.from(IMAGEN).toString('base64');

function respuestaValida(): Record<string, unknown> {
  return {
    descripcion: '  Milanesa con puré y un vaso de agua  ',
    calorias: 649.6,
    carbohidratos: 40,
    proteinas: 30,
    grasas: 25,
    otros: 5,
    confianza: 85,
  };
}

function conTexto(texto: string | undefined): { text: string | undefined } {
  return { text: texto };
}

async function errorDe(promesa: Promise<unknown>): Promise<AnalisisImagenError> {
  const error = await promesa.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AnalisisImagenError);
  return error as AnalisisImagenError;
}

function errorDeGuard(valor: unknown): AnalisisImagenError {
  let capturado: unknown;
  try {
    interpretarRespuestaModelo(valor);
  } catch (error) {
    capturado = error;
  }
  expect(capturado).toBeInstanceOf(AnalisisImagenError);
  return capturado as AnalisisImagenError;
}

/** Un escenario por camino de error: nombre, `reason` esperado y cómo prepararlo. */
const ESCENARIOS_DE_ERROR: [string, AnalisisImagenReason, () => void][] = [
  ['sin key', 'no-configurado', () => (holder.env = { geminiApiKey: undefined })],
  [
    'AbortError',
    'timeout',
    () =>
      holder.generateContent.mockRejectedValue(
        new DOMException(`abort ${MARCA_RESPUESTA}`, 'AbortError'),
      ),
  ],
  [
    'TimeoutError',
    'timeout',
    () =>
      holder.generateContent.mockRejectedValue(
        new DOMException(`timeout ${MARCA_RESPUESTA}`, 'TimeoutError'),
      ),
  ],
  [
    'ApiError 500 con modelo, key y respuesta en su mensaje',
    'fallo',
    () =>
      holder.generateContent.mockRejectedValue(
        new ApiError({ message: `${MODELO_VISION} ${KEY} ${MARCA_RESPUESTA}`, status: 500 }),
      ),
  ],
  [
    'TypeError de red',
    'fallo',
    () =>
      holder.generateContent.mockRejectedValue(new TypeError(`fetch failed ${MARCA_RESPUESTA}`)),
  ],
  [
    'text undefined',
    'respuesta-invalida',
    () => holder.generateContent.mockResolvedValue(conTexto(undefined)),
  ],
  [
    'text que no es JSON',
    'respuesta-invalida',
    () => holder.generateContent.mockResolvedValue(conTexto(`{${MARCA_RESPUESTA}`)),
  ],
  [
    'JSON que no pasa el guard',
    'respuesta-invalida',
    () =>
      holder.generateContent.mockResolvedValue(
        conTexto(JSON.stringify({ ...respuestaValida(), calorias: MARCA_RESPUESTA })),
      ),
  ],
];

let espias: MockInstance[];

beforeEach(() => {
  holder.env = { geminiApiKey: KEY };
  holder.generateContent.mockReset();
  holder.construirSdk.mockReset();
  espias = (['log', 'info', 'warn', 'error', 'debug', 'trace'] as const).map((metodo) =>
    vi.spyOn(console, metodo).mockImplementation(() => undefined),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('modelo-vision/analizarConModeloVision — llamada al SDK', () => {
  it('debe instanciar el SDK con la key del entorno leída al llamar, no al cargar el módulo', async () => {
    holder.env = { geminiApiKey: 'otra-key-fijada-despues-de-importar' };
    holder.generateContent.mockResolvedValue(conTexto(JSON.stringify(respuestaValida())));

    await analizarConModeloVision(IMAGEN);

    expect(holder.construirSdk).toHaveBeenCalledTimes(1);
    expect(holder.construirSdk).toHaveBeenCalledWith({
      apiKey: 'otra-key-fijada-despues-de-importar',
    });
  });

  it('debe llamar a generateContent con el modelo, la imagen JPEG en base64 y el prompt', async () => {
    holder.generateContent.mockResolvedValue(conTexto(JSON.stringify(respuestaValida())));

    await analizarConModeloVision(IMAGEN);

    expect(holder.generateContent).toHaveBeenCalledTimes(1);
    const [parametros] = holder.generateContent.mock.calls[0] as [Record<string, unknown>];
    expect(parametros.model).toBe('gemini-3.1-flash-lite');
    expect(MODELO_VISION).toBe('gemini-3.1-flash-lite');
    expect(parametros.contents).toEqual([
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: IMAGEN_BASE64 } },
          { text: expect.any(String) },
        ],
      },
    ]);
    const contents = parametros.contents as { parts: { text?: string }[] }[];
    const prompt = contents[0]?.parts[1]?.text ?? '';
    expect(prompt).toMatch(/calor[ií]as/i);
    expect(prompt).toMatch(/carbohidratos/i);
    expect(prompt).toMatch(/prote[ií]nas/i);
    expect(prompt).toMatch(/grasas/i);
    expect(prompt).toMatch(/bebida/i);
    expect(prompt).toMatch(/"confianza"/);
    expect(prompt).toMatch(/0 a 100/);
    // Decisión del usuario (S-W1 de la revisión): sin instrucción extra para fotos sin comida.
    expect(prompt).not.toMatch(/no hay comida/i);
  });

  it('debe pedir JSON con responseSchema y un abortSignal, sin retryOptions ni httpOptions', async () => {
    holder.generateContent.mockResolvedValue(conTexto(JSON.stringify(respuestaValida())));

    await analizarConModeloVision(IMAGEN);

    expect(holder.generateContent).toHaveBeenCalledTimes(1);
    const [parametros] = holder.generateContent.mock.calls[0] as [
      { config: Record<string, unknown> },
    ];
    const { config } = parametros;
    expect(config.responseMimeType).toBe('application/json');
    expect(config.abortSignal).toBeInstanceOf(AbortSignal);
    expect((config.abortSignal as AbortSignal).aborted).toBe(false);
    expect(config).not.toHaveProperty('retryOptions');
    expect(config).not.toHaveProperty('httpOptions');
    expect(config.responseSchema).toMatchObject({
      type: 'OBJECT',
      properties: {
        descripcion: { type: 'STRING' },
        calorias: { type: 'NUMBER' },
        carbohidratos: { type: 'NUMBER' },
        proteinas: { type: 'NUMBER' },
        grasas: { type: 'NUMBER' },
        otros: { type: 'NUMBER' },
        confianza: { type: 'NUMBER' },
      },
    });
    const requeridos = (config.responseSchema as { required: string[] }).required;
    expect([...requeridos].sort()).toEqual(
      [
        'calorias',
        'carbohidratos',
        'confianza',
        'descripcion',
        'grasas',
        'otros',
        'proteinas',
      ].sort(),
    );
    expect((config.responseSchema as { propertyOrdering: string[] }).propertyOrdering).toContain(
      'confianza',
    );
    expect(TIMEOUT_MODELO_MS).toBe(25_000);
  });

  it('debe abortar a los 25 s: la señal de AbortSignal.timeout(TIMEOUT_MODELO_MS) es la que recibe el SDK', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    holder.generateContent.mockResolvedValue(conTexto(JSON.stringify(respuestaValida())));

    await analizarConModeloVision(IMAGEN);

    expect(timeout).toHaveBeenCalledTimes(1);
    expect(timeout).toHaveBeenCalledWith(TIMEOUT_MODELO_MS);
    expect(TIMEOUT_MODELO_MS).toBe(25_000);
    const [parametros] = holder.generateContent.mock.calls[0] as [
      { config: { abortSignal: unknown } },
    ];
    expect(parametros.config.abortSignal).toBe(timeout.mock.results[0]?.value);
  });

  it('debe devolver la EstimacionCruda con la descripción recortada y las calorías redondeadas', async () => {
    holder.generateContent.mockResolvedValue(conTexto(JSON.stringify(respuestaValida())));

    const estimacion = await analizarConModeloVision(IMAGEN);

    expect(estimacion).toEqual({
      descripcion: 'Milanesa con puré y un vaso de agua',
      calorias: 650,
      desglose: { carbohidratos: 40, proteinas: 30, grasas: 25, otros: 5 },
      confianza: 85,
    });
  });

  it('debe devolver los porcentajes crudos, sin normalizar', async () => {
    holder.generateContent.mockResolvedValue(
      conTexto(
        JSON.stringify({
          ...respuestaValida(),
          carbohidratos: 33.3,
          proteinas: 33.3,
          grasas: 33.3,
          otros: 0.1,
        }),
      ),
    );

    const estimacion = await analizarConModeloVision(IMAGEN);

    expect(estimacion.desglose).toEqual({
      carbohidratos: 33.3,
      proteinas: 33.3,
      grasas: 33.3,
      otros: 0.1,
    });
  });
});

describe('modelo-vision/analizarConModeloVision — errores', () => {
  it('debe lanzar no-configurado sin instanciar GoogleGenAI si falta la key', async () => {
    holder.env = { geminiApiKey: undefined };

    const error = await errorDe(analizarConModeloVision(IMAGEN));

    expect(error.reason).toBe('no-configurado');
    expect(holder.construirSdk).not.toHaveBeenCalled();
    expect(holder.generateContent).not.toHaveBeenCalled();
  });

  it.each([
    ['AbortError', new DOMException('This operation was aborted', 'AbortError')],
    ['TimeoutError', new DOMException('The operation was aborted due to timeout', 'TimeoutError')],
  ])('debe lanzar timeout si el SDK rechaza con %s, con el original en cause', async (_, abort) => {
    holder.generateContent.mockRejectedValue(abort);

    const error = await errorDe(analizarConModeloVision(IMAGEN));

    expect(error.reason).toBe('timeout');
    expect(error.cause).toBe(abort);
  });

  it.each([
    ['ApiError 500', new ApiError({ message: 'Internal error', status: 500 })],
    ['ApiError 400', new ApiError({ message: 'API key not valid', status: 400 })],
    ['TypeError de red', new TypeError('fetch failed')],
  ])(
    'debe lanzar fallo si el SDK rechaza con %s, con el original en cause',
    async (_, original) => {
      holder.generateContent.mockRejectedValue(original);

      const error = await errorDe(analizarConModeloVision(IMAGEN));

      expect(error.reason).toBe('fallo');
      expect(error.cause).toBe(original);
    },
  );

  it('debe lanzar fallo si el propio constructor del SDK lanza', async () => {
    const original = new Error('SDK roto');
    holder.construirSdk.mockImplementation(() => {
      throw original;
    });

    const error = await errorDe(analizarConModeloVision(IMAGEN));

    expect(error.reason).toBe('fallo');
    expect(error.cause).toBe(original);
  });

  it.each([
    ['text undefined', undefined],
    ['text vacío', ''],
    ['text que no es JSON', `no es json ${MARCA_RESPUESTA}`],
    ['JSON que no pasa el guard', JSON.stringify({ descripcion: MARCA_RESPUESTA })],
  ])('debe lanzar respuesta-invalida con %s', async (_, texto) => {
    holder.generateContent.mockResolvedValue(conTexto(texto));

    const error = await errorDe(analizarConModeloVision(IMAGEN));

    expect(error.reason).toBe('respuesta-invalida');
  });

  it('debe conservar el SyntaxError del JSON inválido en cause', async () => {
    holder.generateContent.mockResolvedValue(conTexto('no es json'));

    const error = await errorDe(analizarConModeloVision(IMAGEN));

    expect(error.cause).toBeInstanceOf(SyntaxError);
  });

  // Cada caso es independiente: `beforeEach` resetea los mocks y la key antes de preparar.
  it.each(ESCENARIOS_DE_ERROR)(
    'debe usar el mensaje fijo, sin el modelo, la key ni el texto de la respuesta: %s',
    async (_, reason, preparar) => {
      preparar();

      const error = await errorDe(analizarConModeloVision(IMAGEN));

      expect(error.reason).toBe(reason);
      expect(error.message).toBe('No se pudo analizar la imagen');
      expect(error.message).not.toContain(MODELO_VISION);
      expect(error.message).not.toContain(KEY);
      expect(error.message).not.toContain(MARCA_RESPUESTA);
    },
  );

  it.each(ESCENARIOS_DE_ERROR)(
    'no debe escribir en console la imagen ni la respuesta: %s',
    async (_, reason, preparar) => {
      preparar();

      // Precondición: el escenario ejercita de verdad ese camino de error del adaptador.
      const error = await errorDe(analizarConModeloVision(IMAGEN));
      expect(error.reason).toBe(reason);

      for (const espia of espias) {
        expect(espia).not.toHaveBeenCalled();
        const escrito = JSON.stringify(espia.mock.calls);
        expect(escrito).not.toContain(IMAGEN_BASE64);
        expect(escrito).not.toContain(MARCA_RESPUESTA);
      }
    },
  );
});

describe('modelo-vision/interpretarRespuestaModelo', () => {
  it('debe aceptar una respuesta válida y anidar los porcentajes en desglose', () => {
    expect(interpretarRespuestaModelo(respuestaValida())).toEqual({
      descripcion: 'Milanesa con puré y un vaso de agua',
      calorias: 650,
      desglose: { carbohidratos: 40, proteinas: 30, grasas: 25, otros: 5 },
      confianza: 85,
    });
  });

  it('debe aceptar los límites: 0 y 10000 calorías, descripción de 500 caracteres', () => {
    const descripcion = 'a'.repeat(500);

    expect(interpretarRespuestaModelo({ ...respuestaValida(), calorias: 0 }).calorias).toBe(0);
    expect(interpretarRespuestaModelo({ ...respuestaValida(), calorias: 10000 }).calorias).toBe(
      10000,
    );
    expect(interpretarRespuestaModelo({ ...respuestaValida(), descripcion }).descripcion).toBe(
      descripcion,
    );
  });

  it('debe contar el largo de la descripción en code points: 500 emojis se aceptan', () => {
    const descripcion = '🍕'.repeat(500);

    expect(interpretarRespuestaModelo({ ...respuestaValida(), descripcion }).descripcion).toBe(
      descripcion,
    );
  });

  it('debe rechazar 501 emojis (501 code points)', () => {
    expect(errorDeGuard({ ...respuestaValida(), descripcion: '🍕'.repeat(501) }).reason).toBe(
      'respuesta-invalida',
    );
  });

  it('debe descartar campos extra de la respuesta del modelo', () => {
    const resultado = interpretarRespuestaModelo({
      ...respuestaValida(),
      usuarioId: 'x',
      extra: 1,
    });

    expect(Object.keys(resultado).sort()).toEqual([
      'calorias',
      'confianza',
      'descripcion',
      'desglose',
    ]);
    expect(Object.keys(resultado.desglose).sort()).toEqual([
      'carbohidratos',
      'grasas',
      'otros',
      'proteinas',
    ]);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['un string', 'hola'],
    ['un array', [respuestaValida()]],
    ['un número', 42],
    ['descripción vacía', { ...respuestaValida(), descripcion: '' }],
    ['descripción de solo espacios', { ...respuestaValida(), descripcion: '   ' }],
    ['descripción de 501 caracteres', { ...respuestaValida(), descripcion: 'a'.repeat(501) }],
    ['descripción que no es string', { ...respuestaValida(), descripcion: 12 }],
    ['calorías -5', { ...respuestaValida(), calorias: -5 }],
    ['calorías 10001', { ...respuestaValida(), calorias: 10001 }],
    ["calorías '300'", { ...respuestaValida(), calorias: '300' }],
    ['calorías NaN', { ...respuestaValida(), calorias: Number.NaN }],
    ['calorías Infinity', { ...respuestaValida(), calorias: Number.POSITIVE_INFINITY }],
    ['calorías faltantes', { ...respuestaValida(), calorias: undefined }],
    ['porcentaje faltante', { ...respuestaValida(), otros: undefined }],
    ['porcentaje string', { ...respuestaValida(), grasas: '25' }],
    ['porcentaje NaN', { ...respuestaValida(), proteinas: Number.NaN }],
    ['porcentaje infinito', { ...respuestaValida(), carbohidratos: Number.POSITIVE_INFINITY }],
    ['grasas NaN', { ...respuestaValida(), grasas: Number.NaN }],
    ['otros infinito', { ...respuestaValida(), otros: Number.POSITIVE_INFINITY }],
  ])('debe rechazar %s con respuesta-invalida', (_, valor) => {
    const error = errorDeGuard(valor);

    expect(error.reason).toBe('respuesta-invalida');
    expect(error.message).toBe('No se pudo analizar la imagen');
  });

  it('debe devolver la confianza del modelo en la EstimacionCruda', () => {
    expect(interpretarRespuestaModelo({ ...respuestaValida(), confianza: 85 }).confianza).toBe(85);
  });

  it.each<[string, unknown]>([
    ['ausente', undefined],
    ['un string', 'alta'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['null', null],
  ])('debe devolver confianza 0 sin lanzar si es %s', (_, confianza) => {
    const resultado = interpretarRespuestaModelo({ ...respuestaValida(), confianza });

    expect(resultado.confianza).toBe(0);
  });

  it('debe seguir rechazando una descripción inválida aunque la confianza sea válida', () => {
    expect(errorDeGuard({ ...respuestaValida(), descripcion: '', confianza: 90 }).reason).toBe(
      'respuesta-invalida',
    );
  });
});
