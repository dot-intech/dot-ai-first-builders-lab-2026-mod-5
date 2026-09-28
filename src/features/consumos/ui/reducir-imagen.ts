/*
 * Cálculo puro de la reducción de la foto antes de subirla (ADR-008): las llamadas a canvas viven en
 * `canvas-imagen.ts`, que usa estas funciones.
 */

export type ImagenNoProcesableReason = 'no-legible' | 'demasiado-grande';

/** El navegador no pudo decodificar la imagen o no logró dejarla bajo el tope de bytes. */
export class ImagenNoProcesableError extends Error {
  readonly reason: ImagenNoProcesableReason;

  constructor(reason: ImagenNoProcesableReason, options?: ErrorOptions) {
    super('No se pudo procesar la imagen', options);
    this.name = 'ImagenNoProcesableError';
    this.reason = reason;
  }
}

export const LADO_MAXIMO = 1280;
// Por debajo del tope del servidor (`IMAGEN_MAX_BYTES` = 950 000) con margen para el `FormData`.
export const BYTES_OBJETIVO = 900_000;
export const CALIDAD_INICIAL = 0.9;
export const CALIDAD_MINIMA = 0.5;
const PASO_CALIDAD = 0.1;

function esEnteroPositivo(valor: number): boolean {
  return Number.isInteger(valor) && valor > 0;
}

/**
 * Escala proporcionalmente para que el lado mayor no supere `maximo`; nunca agranda. Lanza
 * `RangeError` si ancho o alto no son enteros mayores que 0.
 */
export function calcularDimensiones(
  ancho: number,
  alto: number,
  maximo = LADO_MAXIMO,
): { ancho: number; alto: number } {
  if (!esEnteroPositivo(ancho) || !esEnteroPositivo(alto)) {
    throw new RangeError('Las dimensiones deben ser enteros mayores que 0');
  }
  const escala = maximo / Math.max(ancho, alto);
  if (escala >= 1) {
    return { ancho, alto };
  }
  // Una imagen muy alargada redondearía su lado menor a 0: el canvas necesita al menos 1 px.
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

/**
 * Calidad JPEG para el próximo intento: la misma si `bytes` ya entra en `BYTES_OBJETIVO`; 0,1 menos
 * (sin bajar de `CALIDAD_MINIMA`) si no; `null` si ya se probó con la mínima y sigue grande.
 */
export function siguienteCalidad(bytes: number, calidad: number): number | null {
  if (bytes <= BYTES_OBJETIVO) {
    return calidad;
  }
  if (calidad <= CALIDAD_MINIMA) {
    return null;
  }
  // Redondeo a centésimas: 0.7 - 0.1 da 0.6000000000000001 en punto flotante.
  return Math.max(CALIDAD_MINIMA, Math.round((calidad - PASO_CALIDAD) * 100) / 100);
}

/**
 * `calcularDimensiones` para el bitmap que decodificó el navegador: un bitmap vacío (0×0) o con
 * dimensiones inválidas es una imagen que no se puede procesar, no un error de programación.
 */
export function dimensionesParaReencodear(
  ancho: number,
  alto: number,
): { ancho: number; alto: number } {
  try {
    return calcularDimensiones(ancho, alto);
  } catch (error) {
    throw new ImagenNoProcesableError('no-legible', { cause: error });
  }
}
