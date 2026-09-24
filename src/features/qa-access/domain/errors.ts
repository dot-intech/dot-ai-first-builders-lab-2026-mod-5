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
