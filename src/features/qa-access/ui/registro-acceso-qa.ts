import type { QaAccessDeniedReason } from '../domain/errors';

type EventoAccesoQa = {
  event: 'qa_backdoor_login' | 'dev_login_page';
  outcome: 'granted' | 'denied' | 'error';
  reason?: QaAccessDeniedReason;
  operation?: string;
};

const REGISTRAR_SEGUN_OUTCOME: Record<EventoAccesoQa['outcome'], (linea: string) => void> = {
  granted: (linea) => console.info(linea),
  denied: (linea) => console.warn(linea),
  error: (linea) => console.error(linea),
};

/**
 * Log de auditoría del acceso QA: una línea JSON por evento, sin librería de logging porque no se
 * agregan dependencias. El nivel depende del resultado (granted→info, denied→warn, error→error): así
 * un colector que filtre por nivel ve los rechazos y los fallos de datos, no solo los accesos exitosos.
 * Se copian los campos uno a uno: jamás se vuelca el evento entero, para que un email, un token o el
 * `cause` de un error no lleguen al log por descuido.
 */
export function registrarEventoAccesoQa(evento: EventoAccesoQa): void {
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
