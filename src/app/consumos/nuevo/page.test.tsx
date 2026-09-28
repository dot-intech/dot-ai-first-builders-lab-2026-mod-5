import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOMBRE_COOKIE_SESION } from '../../../shared/sesion/ui/cookie-sesion';
import { resolverUsuarioConsumo } from '../../../features/consumos/ui/sesion-consumo';
import NuevoConsumoPage, { dynamic } from './page';

const holder = vi.hoisted(() => ({
  cookieValor: undefined as string | undefined,
  cookieGet: vi.fn(),
  redirect: vi.fn((): never => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('../../../shared/sesion/ui/cookie-sesion', () => ({
  NOMBRE_COOKIE_SESION: 'nutrashot_session',
}));
vi.mock('../../../features/consumos/ui/sesion-consumo', () => ({
  resolverUsuarioConsumo: vi.fn(),
}));
// El contenedor real usa `useReducer`, `crypto.randomUUID` y `next/navigation`: la página no debe
// depender de nada de eso, así que se mockea (Files del bloque: "renderiza el contenedor (mock)").
vi.mock('../../../features/consumos/ui/nuevo-consumo', () => ({
  NuevoConsumo: () => <p>contenedor-nuevo-consumo</p>,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: holder.cookieGet }),
}));
// Como en Next, `redirect` no retorna: lanza.
vi.mock('next/navigation', () => ({
  redirect: holder.redirect,
}));

const TOKEN = 'token-de-sesion';

beforeEach(() => {
  vi.resetAllMocks();
  holder.cookieGet.mockImplementation((nombre: string) =>
    holder.cookieValor === undefined ? undefined : { name: nombre, value: holder.cookieValor },
  );
  holder.redirect.mockImplementation((): never => {
    throw new Error('NEXT_REDIRECT');
  });
  holder.cookieValor = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderizar(): Promise<string> {
  return renderToStaticMarkup(await NuevoConsumoPage());
}

describe('consumos/nuevo/page', () => {
  it('debe forzar el renderizado dinámico', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('con sesión renderiza el contenedor NuevoConsumo', async () => {
    holder.cookieValor = TOKEN;
    vi.mocked(resolverUsuarioConsumo).mockResolvedValue({
      tipo: 'usuario',
      usuarioId: 'usuario-1',
    });

    const html = await renderizar();

    expect(html).toContain('contenedor-nuevo-consumo');
    expect(resolverUsuarioConsumo).toHaveBeenCalledWith(TOKEN);
    expect(holder.cookieGet).toHaveBeenCalledWith(NOMBRE_COOKIE_SESION);
  });

  it('sin sesión redirige a /dev-login', async () => {
    vi.mocked(resolverUsuarioConsumo).mockResolvedValue({ tipo: 'sin-sesion' });

    await expect(renderizar()).rejects.toThrow('NEXT_REDIRECT');

    expect(holder.redirect).toHaveBeenCalledWith('/dev-login');
  });

  it('con error de sesión muestra un mensaje genérico sin detalles', async () => {
    vi.mocked(resolverUsuarioConsumo).mockResolvedValue({ tipo: 'error' });

    const html = await renderizar();

    // W-3 (ronda 2 del Block 8): el markup completo, no solo que "contenga" el texto — así falla si
    // se agrega cualquier otro dato (p. ej. `JSON.stringify(resultado)` o el propio `resultado`).
    expect(html).toBe('<main><p>No se pudo verificar la sesión</p></main>');
    expect(html).not.toContain('contenedor-nuevo-consumo');
    expect(html).not.toContain('"tipo"');
  });
});
