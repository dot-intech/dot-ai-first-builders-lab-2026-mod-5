import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { env } from '../../../env';
import { AnalisisImagenError } from '../domain/errors';
import { CALORIAS_MAX, DESCRIPCION_MAX } from '../domain/rules';

/**
 * Adaptador del modelo de visión: único archivo que importa `@google/genai` (ADR-009). La respuesta
 * del modelo es no confiable y todo fallo sale como `AnalisisImagenError` con mensaje fijo; nada de
 * la imagen, la key ni la respuesta se loguea ni se persiste (NFR-04, M-6).
 */

export const MODELO_VISION = 'gemini-3.1-flash-lite';
// Menor que el temporizador de 30 s del cliente (NFR-02).
export const TIMEOUT_MODELO_MS = 25_000;

/**
 * Porcentajes tal como los devuelve el modelo: números finitos, sin garantía de ser enteros ni de
 * sumar 100 (a diferencia de `DesgloseNutricional`). Los normaliza el service.
 */
export type DesgloseCrudo = {
  carbohidratos: number;
  proteinas: number;
  grasas: number;
  otros: number;
};

/** Estimación tal como la devuelve el modelo: porcentajes sin normalizar. */
export type EstimacionCruda = {
  descripcion: string;
  calorias: number;
  desglose: DesgloseCrudo;
};

const PROMPT = `Sos un asistente de nutrición. Analizá la foto y respondé solo con el JSON pedido.
1. Identificá los alimentos y la bebida que aparecen en la foto.
2. "descripcion": una descripción amigable, breve y concisa en español de Latinoamérica (máximo 200 caracteres) de lo que hay en el plato. Si hay una bebida, mencionala.
3. "calorias": las calorías totales estimadas (kcal) de todo lo que aparece en la foto, incluida la bebida.
4. "carbohidratos", "proteinas", "grasas" y "otros": el porcentaje de esas calorías totales que aportan los carbohidratos, las proteínas, las grasas y otros nutrientes (por ejemplo, alcohol o fibra). Los cuatro porcentajes deben sumar 100.`;

const CAMPOS_RESPUESTA = [
  'descripcion',
  'calorias',
  'carbohidratos',
  'proteinas',
  'grasas',
  'otros',
] as const;

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    descripcion: { type: Type.STRING },
    calorias: { type: Type.NUMBER },
    carbohidratos: { type: Type.NUMBER },
    proteinas: { type: Type.NUMBER },
    grasas: { type: Type.NUMBER },
    otros: { type: Type.NUMBER },
  },
  required: [...CAMPOS_RESPUESTA],
  propertyOrdering: [...CAMPOS_RESPUESTA],
};

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esNumeroFinito(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

/**
 * Guard de la respuesta del modelo. Solo copia los campos conocidos. Los porcentajes se validan como
 * números finitos y nada más: los normaliza (o rechaza) `normalizarDesglose` en el service.
 */
export function interpretarRespuestaModelo(valor: unknown): EstimacionCruda {
  if (!esObjeto(valor)) {
    throw new AnalisisImagenError('respuesta-invalida');
  }
  const { descripcion, calorias, carbohidratos, proteinas, grasas, otros } = valor;

  if (typeof descripcion !== 'string') {
    throw new AnalisisImagenError('respuesta-invalida');
  }
  const descripcionRecortada = descripcion.trim();
  // Se cuentan code points, como el dominio y `char_length` en la BD.
  const largo = Array.from(descripcionRecortada).length;
  if (largo < 1 || largo > DESCRIPCION_MAX) {
    throw new AnalisisImagenError('respuesta-invalida');
  }

  if (!esNumeroFinito(calorias) || calorias < 0 || calorias > CALORIAS_MAX) {
    throw new AnalisisImagenError('respuesta-invalida');
  }

  // Uno por uno (y no con `every`) para que el compilador estreche cada porcentaje a `number`.
  if (
    !esNumeroFinito(carbohidratos) ||
    !esNumeroFinito(proteinas) ||
    !esNumeroFinito(grasas) ||
    !esNumeroFinito(otros)
  ) {
    throw new AnalisisImagenError('respuesta-invalida');
  }

  return {
    descripcion: descripcionRecortada,
    calorias: Math.round(calorias),
    desglose: { carbohidratos, proteinas, grasas, otros },
  };
}

// El SDK aborta con un `AbortController` propio sin `reason`, así que el abort por
// `AbortSignal.timeout` llega como `AbortError`, no como `TimeoutError`: se aceptan ambos.
function esAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function textoARespuesta(texto: string | undefined): unknown {
  if (!texto) {
    throw new AnalisisImagenError('respuesta-invalida');
  }
  try {
    return JSON.parse(texto) as unknown;
  } catch (error) {
    throw new AnalisisImagenError('respuesta-invalida', { cause: error });
  }
}

/** Envía la imagen (JPEG ya validado por el service) al modelo y devuelve su estimación cruda. */
export async function analizarConModeloVision(imagen: Uint8Array): Promise<EstimacionCruda> {
  // Se lee al llamar y no al cargar el módulo: la app arranca sin key y solo falla el análisis.
  const apiKey = env.geminiApiKey;
  if (apiKey === undefined) {
    throw new AnalisisImagenError('no-configurado');
  }

  let texto: string | undefined;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const respuesta = await ai.models.generateContent({
      model: MODELO_VISION,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: { mimeType: 'image/jpeg', data: Buffer.from(imagen).toString('base64') },
            },
            { text: PROMPT },
          ],
        },
      ],
      // Sin `httpOptions.retryOptions`: el SDK no reintenta, así el tiempo total queda acotado.
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        abortSignal: AbortSignal.timeout(TIMEOUT_MODELO_MS),
      },
    });
    texto = respuesta.text;
  } catch (error) {
    throw new AnalisisImagenError(esAbort(error) ? 'timeout' : 'fallo', { cause: error });
  }

  return interpretarRespuestaModelo(textoARespuesta(texto));
}
