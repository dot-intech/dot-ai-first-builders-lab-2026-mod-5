/**
 * Errores tipados del dominio de acceso QA. Los mensajes son genéricos a propósito: no deben
 * revelar si el rechazo fue por entorno no permitido, por variable de entorno faltante o por otra causa
 * (threat model FEAT-001a, Information Disclosure).
 */

export type QaAccessDeniedReason = 'environment_not_allowed' | 'not_configured';

/**
 * Acceso QA denegado (entorno no incluido en la lista de permitidos o email de QA no configurado).
 * La causa vive solo en `reason` (para log server-side); nunca en `message`.
 */
export class QaAccessDeniedError extends Error {
  readonly reason: QaAccessDeniedReason;

  constructor(reason: QaAccessDeniedReason, options?: ErrorOptions) {
    super('Acceso QA denegado', options);
    this.name = 'QaAccessDeniedError';
    this.reason = reason;
  }
}

/** La sesión existe pero superó la ventana de inactividad. */
export class SessionExpiredError extends Error {
  constructor(options?: ErrorOptions) {
    super('La sesión expiró por inactividad', options);
    this.name = 'SessionExpiredError';
  }
}

/** No existe una sesión válida para el token recibido. */
export class SessionNotFoundError extends Error {
  constructor(options?: ErrorOptions) {
    super('Sesión no encontrada', options);
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Fallo de conexión o de query en la capa de datos, ya traducido a un error propio. Vive en `domain`
 * para que la UI pueda distinguirlo sin importar de `data`.
 *
 * Desde drizzle-orm 0.44 el `message` del error original incluye el SQL y sus parámetros (emails,
 * `token_hash`), por eso este `message` es fijo y el original viaja solo en `cause`: nunca debe
 * copiarse ni interpolarse. `operation` es una etiqueta propia (sin datos) para el log del servidor.
 */
export class RepositoryError extends Error {
  readonly operation: string;

  constructor(operation: string, options?: ErrorOptions) {
    super('Error de acceso a datos', options);
    this.name = 'RepositoryError';
    this.operation = operation;
  }
}
