import { RepositoryError } from '../errors/repository-error';

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
