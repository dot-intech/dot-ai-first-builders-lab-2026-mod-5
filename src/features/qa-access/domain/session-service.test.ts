import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as sesionRepository from '../data/sesion-repository';
import * as usuarioRepository from '../data/usuario-repository';
import { RepositoryError, SessionExpiredError, SessionNotFoundError } from './errors';
import { INACTIVIDAD_MAXIMA_MS } from './rules';
import { crearSesion, getSession, iniciarSesionQa } from './session-service';
import type { Sesion, Usuario } from './types';

// Los dos repositories se mockean con factory explícita: el automock de vitest importa el módulo
// real para descubrir sus exports, y eso cargaría `client.ts`/`env.ts` (lanza si falta DATABASE_URL).
vi.mock('../data/sesion-repository', () => ({
  create: vi.fn(),
  findByTokenHash: vi.fn(),
  touchLastActivity: vi.fn(),
}));
vi.mock('../data/usuario-repository', () => ({
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findOrCreateByEmail: vi.fn(),
}));

const LONGITUD_MAXIMA_TOKEN = 128;
const AHORA = new Date('2026-09-21T12:00:00.000Z');

const usuario: Usuario = {
  id: 'usuario-1',
  email: 'qa@example.com',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
};

function sesionConActividad(lastActivityAt: Date): Sesion {
  return {
    id: 'sesion-1',
    usuarioId: usuario.id,
    tokenHash: 'hash-de-la-sesion',
    lastActivityAt,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
  };
}

function sha256Hex(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}

function primerLlamadoACreate(): Parameters<typeof sesionRepository.create> {
  const llamado = vi.mocked(sesionRepository.create).mock.calls[0];
  if (!llamado) {
    throw new Error('Se esperaba que sesionRepository.create fuera llamado');
  }
  return llamado;
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('session-service/crearSesion', () => {
  it('debe devolver un token de 256 bits en hex (64 caracteres)', async () => {
    vi.mocked(sesionRepository.create).mockResolvedValue(sesionConActividad(AHORA));

    const token = await crearSesion(usuario.id);

    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('debe persistir solo el hash SHA-256 del token, nunca el token crudo', async () => {
    vi.mocked(sesionRepository.create).mockResolvedValue(sesionConActividad(AHORA));

    const token = await crearSesion(usuario.id);

    const [nueva] = primerLlamadoACreate();
    expect(nueva).toEqual({ usuarioId: usuario.id, tokenHash: sha256Hex(token) });
  });

  it('debe pasar al repository el reloj recibido como segundo argumento', async () => {
    vi.mocked(sesionRepository.create).mockResolvedValue(sesionConActividad(AHORA));

    await crearSesion(usuario.id, AHORA);

    const [, now] = primerLlamadoACreate();
    expect(now).toBe(AHORA);
  });

  it('debe usar new Date() como reloj por defecto', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    vi.mocked(sesionRepository.create).mockResolvedValue(sesionConActividad(AHORA));

    await crearSesion(usuario.id);

    const [, now] = primerLlamadoACreate();
    expect(now).toEqual(AHORA);
  });

  it('debe generar tokens distintos en llamadas distintas', async () => {
    vi.mocked(sesionRepository.create).mockResolvedValue(sesionConActividad(AHORA));

    const primero = await crearSesion(usuario.id);
    const segundo = await crearSesion(usuario.id);

    expect(primero).not.toBe(segundo);
  });

  it('debe propagar el RepositoryError sin capturarlo', async () => {
    const errorDeRepository = new RepositoryError('sesion.create');
    vi.mocked(sesionRepository.create).mockRejectedValue(errorDeRepository);

    await expect(crearSesion(usuario.id)).rejects.toBe(errorDeRepository);
  });
});

describe('session-service/iniciarSesionQa', () => {
  it('debe llamar a findOrCreateByEmail con el email recibido', async () => {
    vi.mocked(usuarioRepository.findOrCreateByEmail).mockResolvedValue(usuario);
    vi.mocked(sesionRepository.create).mockResolvedValue(sesionConActividad(AHORA));

    await iniciarSesionQa(usuario.email);

    expect(usuarioRepository.findOrCreateByEmail).toHaveBeenCalledWith(usuario.email);
  });

  it('debe abrir la sesión con el id del usuario devuelto por findOrCreateByEmail', async () => {
    vi.mocked(usuarioRepository.findOrCreateByEmail).mockResolvedValue(usuario);
    vi.mocked(sesionRepository.create).mockResolvedValue(sesionConActividad(AHORA));

    await iniciarSesionQa(usuario.email);

    const [nueva] = primerLlamadoACreate();
    expect(nueva.usuarioId).toBe(usuario.id);
  });

  it('debe devolver el token crudo cuyo hash es el que se persistió', async () => {
    vi.mocked(usuarioRepository.findOrCreateByEmail).mockResolvedValue(usuario);
    vi.mocked(sesionRepository.create).mockResolvedValue(sesionConActividad(AHORA));

    const token = await iniciarSesionQa(usuario.email);

    const [nueva] = primerLlamadoACreate();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(nueva.tokenHash).toBe(sha256Hex(token));
  });

  it('debe propagar el RepositoryError del usuario sin capturarlo ni crear la sesión', async () => {
    const errorDeRepository = new RepositoryError('usuario.findOrCreateByEmail');
    vi.mocked(usuarioRepository.findOrCreateByEmail).mockRejectedValue(errorDeRepository);

    await expect(iniciarSesionQa(usuario.email)).rejects.toBe(errorDeRepository);
    expect(sesionRepository.create).not.toHaveBeenCalled();
  });

  it('debe propagar el RepositoryError de la sesión sin capturarlo', async () => {
    const errorDeRepository = new RepositoryError('sesion.create');
    vi.mocked(usuarioRepository.findOrCreateByEmail).mockResolvedValue(usuario);
    vi.mocked(sesionRepository.create).mockRejectedValue(errorDeRepository);

    await expect(iniciarSesionQa(usuario.email)).rejects.toBe(errorDeRepository);
  });
});

describe('session-service/getSession', () => {
  const tokenCrudo = 'a'.repeat(64);

  it('debe devolver el usuario si el token es válido y la actividad es reciente (AC-05)', async () => {
    const reciente = new Date(AHORA.getTime() - 60 * 60 * 1000);
    vi.mocked(sesionRepository.findByTokenHash).mockResolvedValue(sesionConActividad(reciente));
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuario);

    const resultado = await getSession(tokenCrudo, AHORA);

    expect(resultado).toEqual(usuario);
    expect(usuarioRepository.findById).toHaveBeenCalledWith(usuario.id);
  });

  it('debe actualizar last_activity_at por id de sesión con el reloj recibido (AC-05)', async () => {
    const reciente = new Date(AHORA.getTime() - 60 * 60 * 1000);
    vi.mocked(sesionRepository.findByTokenHash).mockResolvedValue(sesionConActividad(reciente));
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuario);

    await getSession(tokenCrudo, AHORA);

    expect(sesionRepository.touchLastActivity).toHaveBeenCalledTimes(1);
    expect(sesionRepository.touchLastActivity).toHaveBeenCalledWith('sesion-1', AHORA);
  });

  it('debe consultar la sesión por el hash SHA-256 del token, no por el token crudo', async () => {
    vi.mocked(sesionRepository.findByTokenHash).mockResolvedValue(null);

    await expect(getSession(tokenCrudo, AHORA)).rejects.toBeInstanceOf(SessionNotFoundError);

    expect(sesionRepository.findByTokenHash).toHaveBeenCalledWith(sha256Hex(tokenCrudo));
  });

  it('debe usar new Date() como reloj por defecto', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    vi.mocked(sesionRepository.findByTokenHash).mockResolvedValue(sesionConActividad(AHORA));
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuario);

    await getSession(tokenCrudo);

    expect(sesionRepository.touchLastActivity).toHaveBeenCalledWith('sesion-1', AHORA);
  });

  it('debe lanzar SessionExpiredError con más de 24h de inactividad (AC-06)', async () => {
    const vencida = new Date(AHORA.getTime() - INACTIVIDAD_MAXIMA_MS - 1);
    vi.mocked(sesionRepository.findByTokenHash).mockResolvedValue(sesionConActividad(vencida));

    await expect(getSession(tokenCrudo, AHORA)).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('debe evitar tocar last_activity_at y buscar al usuario si la sesión expiró (AC-06)', async () => {
    const vencida = new Date(AHORA.getTime() - INACTIVIDAD_MAXIMA_MS - 1);
    vi.mocked(sesionRepository.findByTokenHash).mockResolvedValue(sesionConActividad(vencida));

    await expect(getSession(tokenCrudo, AHORA)).rejects.toBeInstanceOf(SessionExpiredError);

    expect(sesionRepository.touchLastActivity).not.toHaveBeenCalled();
    expect(usuarioRepository.findById).not.toHaveBeenCalled();
  });

  it('debe seguir válida con exactamente 24h de inactividad (usa la regla de rules.ts)', async () => {
    const enElBorde = new Date(AHORA.getTime() - INACTIVIDAD_MAXIMA_MS);
    vi.mocked(sesionRepository.findByTokenHash).mockResolvedValue(sesionConActividad(enElBorde));
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuario);

    await expect(getSession(tokenCrudo, AHORA)).resolves.toEqual(usuario);
  });

  it('debe lanzar SessionNotFoundError si el hash no matchea ninguna sesión', async () => {
    vi.mocked(sesionRepository.findByTokenHash).mockResolvedValue(null);

    await expect(getSession(tokenCrudo, AHORA)).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('debe lanzar SessionNotFoundError sin tocar last_activity_at si el usuario ya no existe', async () => {
    vi.mocked(sesionRepository.findByTokenHash).mockResolvedValue(sesionConActividad(AHORA));
    vi.mocked(usuarioRepository.findById).mockResolvedValue(null);

    await expect(getSession(tokenCrudo, AHORA)).rejects.toBeInstanceOf(SessionNotFoundError);
    expect(sesionRepository.touchLastActivity).not.toHaveBeenCalled();
  });

  it('debe propagar el RepositoryError de findByTokenHash sin capturarlo', async () => {
    const errorDeRepository = new RepositoryError('sesion.findByTokenHash');
    vi.mocked(sesionRepository.findByTokenHash).mockRejectedValue(errorDeRepository);

    await expect(getSession(tokenCrudo, AHORA)).rejects.toBe(errorDeRepository);
  });

  it('debe propagar el RepositoryError de findById sin capturarlo', async () => {
    const errorDeRepository = new RepositoryError('usuario.findById');
    vi.mocked(sesionRepository.findByTokenHash).mockResolvedValue(sesionConActividad(AHORA));
    vi.mocked(usuarioRepository.findById).mockRejectedValue(errorDeRepository);

    await expect(getSession(tokenCrudo, AHORA)).rejects.toBe(errorDeRepository);
  });

  it('debe propagar el RepositoryError de touchLastActivity sin capturarlo', async () => {
    const errorDeRepository = new RepositoryError('sesion.touchLastActivity');
    vi.mocked(sesionRepository.findByTokenHash).mockResolvedValue(sesionConActividad(AHORA));
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuario);
    vi.mocked(sesionRepository.touchLastActivity).mockRejectedValue(errorDeRepository);

    await expect(getSession(tokenCrudo, AHORA)).rejects.toBe(errorDeRepository);
  });

  describe('validación del token (input no confiable)', () => {
    it('debe lanzar SessionNotFoundError sin llamar a ningún repository con un token vacío', async () => {
      await expect(getSession('', AHORA)).rejects.toBeInstanceOf(SessionNotFoundError);

      expect(sesionRepository.findByTokenHash).not.toHaveBeenCalled();
      expect(usuarioRepository.findById).not.toHaveBeenCalled();
      expect(sesionRepository.touchLastActivity).not.toHaveBeenCalled();
    });

    it('debe lanzar SessionNotFoundError sin llamar a ningún repository con 129 caracteres', async () => {
      const demasiadoLargo = 'a'.repeat(LONGITUD_MAXIMA_TOKEN + 1);

      await expect(getSession(demasiadoLargo, AHORA)).rejects.toBeInstanceOf(SessionNotFoundError);

      expect(sesionRepository.findByTokenHash).not.toHaveBeenCalled();
    });

    it('debe procesar un token de exactamente 128 caracteres (borde)', async () => {
      const enElBorde = 'a'.repeat(LONGITUD_MAXIMA_TOKEN);
      vi.mocked(sesionRepository.findByTokenHash).mockResolvedValue(null);

      await expect(getSession(enElBorde, AHORA)).rejects.toBeInstanceOf(SessionNotFoundError);

      expect(sesionRepository.findByTokenHash).toHaveBeenCalledWith(sha256Hex(enElBorde));
    });

    it.each([undefined, null, 123, {}])(
      'debe lanzar SessionNotFoundError sin llamar a ningún repository con un valor no-string (%j)',
      async (valor) => {
        // La cookie es input no confiable: en runtime puede no ser un string aunque el tipo lo diga.
        const tokenNoString = valor as unknown as string;

        await expect(getSession(tokenNoString, AHORA)).rejects.toBeInstanceOf(SessionNotFoundError);

        expect(sesionRepository.findByTokenHash).not.toHaveBeenCalled();
      },
    );
  });
});
