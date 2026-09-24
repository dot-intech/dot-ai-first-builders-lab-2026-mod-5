import { describe, expect, it } from 'vitest';

import { RepositoryError } from '../errors/repository-error';
import { conRepositoryError } from './con-repository-error';

const OPERACION = 'sesion.create';

describe('conRepositoryError', () => {
  it('debe devolver el valor de la consulta cuando no falla', async () => {
    const valor = { id: 'usuario-1' };

    await expect(conRepositoryError(OPERACION, async () => valor)).resolves.toBe(valor);
  });

  it('ante una consulta que lanza, debe relanzar un RepositoryError con la operation y el error original en cause', async () => {
    const causa = new Error('fallo de conexión');

    const error = await conRepositoryError(OPERACION, async () => {
      throw causa;
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).operation).toBe(OPERACION);
    expect((error as RepositoryError).cause).toBe(causa);
  });
});
