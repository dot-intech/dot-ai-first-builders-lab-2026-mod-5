import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { RepositoryError, SessionExpiredError, SessionNotFoundError } from '../domain/errors';
import { getSession } from '../domain/session-service';
import type { Usuario } from '../domain/types';
import { resolverEstadoSesion } from './estado-sesion';

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

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.resetAllMocks();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('estado-sesion/resolverEstadoSesion', () => {
  it('debe devolver conectada con el email si getSession valida el token', async () => {
    vi.mocked(getSession).mockResolvedValue(usuario);

    const estado = await resolverEstadoSesion(TOKEN);

    expect(getSession).toHaveBeenCalledWith(TOKEN);
    expect(estado).toEqual({ tipo: 'conectada', email: usuario.email });
  });

  it('debe consultar con un token vacío y devolver sin-sesion si no hay cookie', async () => {
    vi.mocked(getSession).mockRejectedValue(new SessionNotFoundError());

    const estado = await resolverEstadoSesion(undefined);

    expect(getSession).toHaveBeenCalledWith('');
    expect(estado).toEqual({ tipo: 'sin-sesion' });
  });

  it('debe devolver sin-sesion ante SessionNotFoundError', async () => {
    vi.mocked(getSession).mockRejectedValue(new SessionNotFoundError());

    await expect(resolverEstadoSesion(TOKEN)).resolves.toEqual({ tipo: 'sin-sesion' });
  });

  it('debe devolver sin-sesion ante SessionExpiredError (mismo trato hacia el usuario)', async () => {
    vi.mocked(getSession).mockRejectedValue(new SessionExpiredError());

    await expect(resolverEstadoSesion(TOKEN)).resolves.toEqual({ tipo: 'sin-sesion' });
  });

  it('debe devolver error ante RepositoryError', async () => {
    vi.mocked(getSession).mockRejectedValue(new RepositoryError('sesion.findByTokenHash'));

    await expect(resolverEstadoSesion(TOKEN)).resolves.toEqual({ tipo: 'error' });
  });

  it('debe loguear solo la operation del RepositoryError, nunca cause, email ni token', async () => {
    const cause = new Error(
      `select ... where token_hash = '${TOKEN}' and email = '${usuario.email}'`,
    );
    vi.mocked(getSession).mockRejectedValue(
      new RepositoryError('sesion.findByTokenHash', { cause }),
    );

    await resolverEstadoSesion(TOKEN);

    expect(consoleError).toHaveBeenCalledTimes(1);
    const linea = String(consoleError.mock.calls[0]?.[0]);
    expect(linea).toContain('sesion.findByTokenHash');
    expect(linea).not.toContain(TOKEN);
    expect(linea).not.toContain(usuario.email);
    expect(linea).not.toMatch(/select/i);
  });

  it('debe relanzar cualquier otro error sin tragarlo', async () => {
    const inesperado = new TypeError('fallo inesperado');
    vi.mocked(getSession).mockRejectedValue(inesperado);

    await expect(resolverEstadoSesion(TOKEN)).rejects.toBe(inesperado);
  });
});
