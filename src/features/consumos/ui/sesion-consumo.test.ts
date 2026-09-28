import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { Usuario } from '../../../shared/sesion/domain/types';
import { resolverUsuarioDeSesion } from '../../../shared/sesion/ui/usuario-de-sesion';
import { resolverUsuarioConsumo } from './sesion-consumo';

// Factory explícita: el módulo real importaría el service de sesión, los repositories y `client.ts`.
vi.mock('../../../shared/sesion/ui/usuario-de-sesion', () => ({
  resolverUsuarioDeSesion: vi.fn(),
}));

const TOKEN = 'token-crudo-secreto';
const usuario: Usuario = {
  id: 'usuario-1',
  email: 'qa@example.com',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
};

let info: MockInstance<typeof console.info>;
let warn: MockInstance<typeof console.warn>;
let error: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.resetAllMocks();
  info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sesion-consumo/resolverUsuarioConsumo', () => {
  it('debe devolver el usuarioId de la sesión con el token recibido (AC-14)', async () => {
    vi.mocked(resolverUsuarioDeSesion).mockResolvedValue({ tipo: 'usuario', usuario });

    const resultado = await resolverUsuarioConsumo(TOKEN);

    expect(resolverUsuarioDeSesion).toHaveBeenCalledExactlyOnceWith(TOKEN);
    expect(resultado).toEqual({ tipo: 'usuario', usuarioId: 'usuario-1' });
  });

  it('debe pasar el token undefined tal cual cuando no hay cookie', async () => {
    vi.mocked(resolverUsuarioDeSesion).mockResolvedValue({ tipo: 'sin-sesion' });

    await resolverUsuarioConsumo(undefined);

    expect(resolverUsuarioDeSesion).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('debe devolver sin-sesion sin registrar ningún log', async () => {
    vi.mocked(resolverUsuarioDeSesion).mockResolvedValue({ tipo: 'sin-sesion' });

    await expect(resolverUsuarioConsumo(TOKEN)).resolves.toEqual({ tipo: 'sin-sesion' });

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('debe devolver error y registrar consumo_sesion con solo la operation', async () => {
    vi.mocked(resolverUsuarioDeSesion).mockResolvedValue({
      tipo: 'error',
      operation: 'sesion.findByTokenHash',
    });

    await expect(resolverUsuarioConsumo(TOKEN)).resolves.toEqual({ tipo: 'error' });

    expect(error).toHaveBeenCalledTimes(1);
    const linea = JSON.parse(String(error.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(linea).toEqual({
      event: 'consumo_sesion',
      outcome: 'error',
      operation: 'sesion.findByTokenHash',
      timestamp: expect.any(String),
    });
    expect(String(error.mock.calls[0]?.[0])).not.toContain(TOKEN);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('debe relanzar cualquier error inesperado sin tragarlo', async () => {
    const inesperado = new TypeError('fallo inesperado');
    vi.mocked(resolverUsuarioDeSesion).mockRejectedValue(inesperado);

    await expect(resolverUsuarioConsumo(TOKEN)).rejects.toBe(inesperado);
  });
});
