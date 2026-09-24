import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '../../errors/repository-error';
import { SessionExpiredError, SessionNotFoundError } from '../domain/errors';
import { getSession } from '../domain/session-service';
import type { Usuario } from '../domain/types';
import { resolverUsuarioDeSesion } from './usuario-de-sesion';

// Factory explícita: el automock importaría los repositories reales y con ellos `client.ts`/`env.ts`.
vi.mock('../domain/session-service', () => ({
  getSession: vi.fn(),
}));

const TOKEN = 'token-crudo-secreto';
const usuario: Usuario = {
  id: 'usuario-1',
  email: 'qa@example.com',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('usuario-de-sesion/resolverUsuarioDeSesion', () => {
  it('debe devolver el usuario si getSession valida el token (AC-07)', async () => {
    vi.mocked(getSession).mockResolvedValue(usuario);

    const resultado = await resolverUsuarioDeSesion(TOKEN);

    expect(getSession).toHaveBeenCalledWith(TOKEN);
    expect(resultado).toEqual({ tipo: 'usuario', usuario });
  });

  it('debe devolver sin-sesion ante SessionNotFoundError (AC-08)', async () => {
    vi.mocked(getSession).mockRejectedValue(new SessionNotFoundError());

    await expect(resolverUsuarioDeSesion(TOKEN)).resolves.toEqual({ tipo: 'sin-sesion' });
  });

  it('debe devolver exactamente lo mismo ante SessionExpiredError que ante SessionNotFoundError (AC-08)', async () => {
    vi.mocked(getSession).mockRejectedValueOnce(new SessionNotFoundError());
    const noEncontrada = await resolverUsuarioDeSesion(TOKEN);
    vi.mocked(getSession).mockRejectedValueOnce(new SessionExpiredError());
    const expirada = await resolverUsuarioDeSesion(TOKEN);

    expect(expirada).toStrictEqual({ tipo: 'sin-sesion' });
    expect(expirada).toStrictEqual(noEncontrada);
  });

  it('debe consultar con un token vacío y devolver sin-sesion si el token es undefined (AC-08)', async () => {
    vi.mocked(getSession).mockRejectedValue(new SessionNotFoundError());

    const resultado = await resolverUsuarioDeSesion(undefined);

    expect(getSession).toHaveBeenCalledWith('');
    expect(resultado).toEqual({ tipo: 'sin-sesion' });
  });

  it('debe devolver error con solo la operation ante RepositoryError, sin lanzar (AC-09)', async () => {
    const cause = new Error(
      `select ... where token_hash = '${TOKEN}' and email = '${usuario.email}'`,
    );
    vi.mocked(getSession).mockRejectedValue(
      new RepositoryError('sesion.findByTokenHash', { cause }),
    );

    const resultado = await resolverUsuarioDeSesion(TOKEN);

    expect(resultado).toStrictEqual({ tipo: 'error', operation: 'sesion.findByTokenHash' });
    expect(resultado).not.toHaveProperty('message');
    expect(resultado).not.toHaveProperty('cause');
  });

  it('debe relanzar cualquier otro error sin tragarlo (AC-09)', async () => {
    const inesperado = new TypeError('fallo inesperado');
    vi.mocked(getSession).mockRejectedValue(inesperado);

    await expect(resolverUsuarioDeSesion(TOKEN)).rejects.toBe(inesperado);
  });
});
