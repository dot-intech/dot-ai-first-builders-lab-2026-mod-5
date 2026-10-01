/**
 * Errores tipados del dominio de consumos. Los mensajes son fijos a propósito: el motivo vive en
 * `reason`/`campo` y el error original solo en `cause`, para que nada del proveedor (ni de la
 * imagen) llegue al usuario ni a un log por el `message` (threat model FEAT-001b, M-6).
 */

export type AnalisisImagenReason =
  | 'imagen-invalida'
  | 'no-configurado'
  | 'timeout'
  | 'fallo'
  | 'respuesta-invalida';

export type CampoDatosConsumo =
  | 'forma'
  | 'descripcion'
  | 'calorias'
  | 'desglose'
  | 'origen'
  | 'solicitudId';

/** No se pudo obtener una estimación a partir de la imagen. */
export class AnalisisImagenError extends Error {
  readonly reason: AnalisisImagenReason;

  constructor(reason: AnalisisImagenReason, options?: ErrorOptions) {
    super('No se pudo analizar la imagen', options);
    this.name = 'AnalisisImagenError';
    this.reason = reason;
  }
}

/** Los datos enviados para guardar el consumo no cumplen las reglas del dominio. */
export class DatosConsumoInvalidosError extends Error {
  readonly campo: CampoDatosConsumo;

  constructor(campo: CampoDatosConsumo, options?: ErrorOptions) {
    super('Los datos del consumo no son válidos', options);
    this.name = 'DatosConsumoInvalidosError';
    this.campo = campo;
  }
}
