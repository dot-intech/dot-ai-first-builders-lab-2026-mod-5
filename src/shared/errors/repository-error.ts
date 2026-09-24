/**
 * Fallo de conexión o de query en la capa de datos, ya traducido a un error propio. Vive en
 * `shared/errors` para que la UI, el dominio y los datos de cualquier feature lo distingan sin
 * importar de `shared/db` (ADR-007).
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
