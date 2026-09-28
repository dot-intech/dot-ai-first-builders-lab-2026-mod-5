import type { AnalisisImagenReason, CampoDatosConsumo } from '../domain/errors';

export type EventoConsumo = {
  event: 'consumo_analisis' | 'consumo_guardado' | 'consumo_sesion';
  outcome: 'ok' | 'rechazado' | 'error';
  reason?: AnalisisImagenReason | CampoDatosConsumo;
  operation?: string;
};

const REGISTRAR_SEGUN_OUTCOME: Record<EventoConsumo['outcome'], (linea: string) => void> = {
  ok: (linea) => console.info(linea),
  rechazado: (linea) => console.warn(linea),
  error: (linea) => console.error(linea),
};

/**
 * Log de auditoría de consumos: una línea JSON por evento, con el mismo patrón que
 * `registro-acceso-qa.ts` (nivel según `outcome`: ok→info, rechazado→warn, error→error). Se copian
 * los campos uno a uno y jamás se vuelca el evento entero: la imagen, la respuesta del modelo, el
 * `usuarioId` o el `cause` de un error (que puede traer el `ApiError` del SDK o SQL) no deben llegar
 * al log por descuido (M-7, NFR-04).
 */
export function registrarEventoConsumo(evento: EventoConsumo): void {
  REGISTRAR_SEGUN_OUTCOME[evento.outcome](
    JSON.stringify({
      event: evento.event,
      outcome: evento.outcome,
      reason: evento.reason,
      operation: evento.operation,
      timestamp: new Date().toISOString(),
    }),
  );
}
