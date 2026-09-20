/**
 * Error tipado de la capa de datos. Envuelve cualquier fallo de conexión o de query.
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

/** Ejecuta una operación de BD y traduce cualquier fallo a `RepositoryError` (sin tragarlo). */
export async function conRepositoryError<T>(
  operation: string,
  consulta: () => Promise<T>,
): Promise<T> {
  try {
    return await consulta();
  } catch (error) {
    throw new RepositoryError(operation, { cause: error });
  }
}
