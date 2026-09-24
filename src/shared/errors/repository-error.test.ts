import { describe, expect, it } from 'vitest';

import { RepositoryError } from './repository-error';

describe('RepositoryError', () => {
  const OPERACION = 'sesion.create';

  it('debe ser instancia de Error y de su clase, con su name propio', () => {
    const error = new RepositoryError(OPERACION);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RepositoryError);
    expect(error.name).toBe('RepositoryError');
  });

  it('debe usar un message fijo, igual para cualquier operación', () => {
    expect(new RepositoryError(OPERACION).message).toBe('Error de acceso a datos');
    expect(new RepositoryError('usuario.findById').message).toBe('Error de acceso a datos');
  });

  it('debe exponer operation como propiedad pública', () => {
    expect(new RepositoryError(OPERACION).operation).toBe(OPERACION);
  });

  it('debe conservar el error original en cause', () => {
    const causa = new Error('causa original');

    expect(new RepositoryError(OPERACION, { cause: causa }).cause).toBe(causa);
  });

  it('el message no debe contener el SQL, los parámetros ni el mensaje del error original', () => {
    const causa = new Error(
      'insert into sesiones (token_hash) values ($1) -- params: qa@example.com, abc123hash',
    );

    const { message } = new RepositoryError(OPERACION, { cause: causa });

    expect(message).not.toContain('insert');
    expect(message).not.toContain('qa@example.com');
    expect(message).not.toContain('abc123hash');
    expect(message).not.toContain(causa.message);
  });
});
