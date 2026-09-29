import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOMBRE_COOKIE_SESION } from '../../../shared/sesion/ui/cookie-sesion';
import { analizarFotoConsumo, guardarNuevoConsumo } from './actions';
import { analizarFoto, guardar } from './operaciones-consumo';

/**
 * Las actions solo leen la cookie y delegan: la lógica (sesión, validación, log) vive en
 * `operaciones-consumo.ts` y se prueba allí.
 */

const TOKEN = 'token-crudo-secreto';

const holder = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  cookieGet: vi.fn(),
}));

// Factory explícita: el módulo real importaría el service y con él `@google/genai`, `client.ts` y `env.ts`.
vi.mock('./operaciones-consumo', () => ({
  analizarFoto: vi.fn(),
  guardar: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: holder.cookieGet }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  holder.cookies = new Map([[NOMBRE_COOKIE_SESION, TOKEN]]);
  holder.cookieGet.mockImplementation((nombre: string) => {
    const value = holder.cookies.get(nombre);
    return value === undefined ? undefined : { name: nombre, value };
  });
});

describe('actions (consumos)', () => {
  describe('analizarFotoConsumo', () => {
    it('debe leer la cookie nutrashot_session y delegar en analizarFoto con el token', async () => {
      const formData = new FormData();
      vi.mocked(analizarFoto).mockResolvedValue({ tipo: 'error' });

      const resultado = await analizarFotoConsumo(formData);

      expect(holder.cookieGet).toHaveBeenCalledWith('nutrashot_session');
      expect(analizarFoto).toHaveBeenCalledExactlyOnceWith(TOKEN, formData);
      expect(resultado).toEqual({ tipo: 'error' });
    });

    it('debe delegar con token undefined si no hay cookie', async () => {
      holder.cookies = new Map();
      vi.mocked(analizarFoto).mockResolvedValue({ tipo: 'sin-sesion' });

      await expect(analizarFotoConsumo('x')).resolves.toEqual({ tipo: 'sin-sesion' });

      expect(analizarFoto).toHaveBeenCalledExactlyOnceWith(undefined, 'x');
    });
  });

  describe('guardarNuevoConsumo', () => {
    it('debe leer la cookie nutrashot_session y delegar en guardar con el token', async () => {
      const datos = {
        descripcion: 'Té',
        calorias: 0,
        solicitudId: '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b',
      };
      vi.mocked(guardar).mockResolvedValue({ tipo: 'guardado' });

      const resultado = await guardarNuevoConsumo(datos);

      expect(holder.cookieGet).toHaveBeenCalledWith('nutrashot_session');
      expect(guardar).toHaveBeenCalledExactlyOnceWith(TOKEN, datos);
      expect(resultado).toEqual({ tipo: 'guardado' });
    });

    it('debe delegar con token undefined si no hay cookie', async () => {
      holder.cookies = new Map();
      vi.mocked(guardar).mockResolvedValue({ tipo: 'sin-sesion' });

      await expect(guardarNuevoConsumo({})).resolves.toEqual({ tipo: 'sin-sesion' });

      expect(guardar).toHaveBeenCalledExactlyOnceWith(undefined, {});
    });
  });

  describe('superficie expuesta', () => {
    it('debe exportar únicamente analizarFotoConsumo y guardarNuevoConsumo (M-2)', async () => {
      // En un archivo 'use server' toda función exportada queda expuesta como endpoint invocable
      // por el cliente: un tercer export (aunque sea un helper) sería una superficie de ataque nueva.
      expect(Object.keys(await import('./actions'))).toEqual([
        'analizarFotoConsumo',
        'guardarNuevoConsumo',
      ]);
    });
  });
});
