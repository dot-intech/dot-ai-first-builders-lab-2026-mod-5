import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { SessionExpiredError, SessionNotFoundError } from '../../shared/sesion/domain/errors';
import { RepositoryError } from '../../shared/errors/repository-error';
import { getSession } from '../../shared/sesion/domain/session-service';
import { NOMBRE_COOKIE_SESION } from '../../features/qa-access/ui/cookie-sesion';
import DevLoginPage, { dynamic } from './page';

type SearchParams = { error?: string | string[] };

const holder = vi.hoisted(() => ({
  nodeEnv: 'development',
  cookieValor: undefined as string | undefined,
  cookieGet: vi.fn(),
}));

// Factory explícita en todo lo que cargaría `env.ts`/`client.ts` (lanzan sin DATABASE_URL).
vi.mock('../../env', () => ({
  get env() {
    return { nodeEnv: holder.nodeEnv, qaAccessEmail: undefined };
  },
}));
vi.mock('../../shared/sesion/domain/session-service', () => ({
  getSession: vi.fn(),
  iniciarSesionParaEmail: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: holder.cookieGet }),
}));
// Como en Next, `notFound` no retorna: lanza.
vi.mock('next/navigation', () => ({
  notFound: (): never => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (): never => {
    throw new Error('NEXT_REDIRECT');
  },
}));

const EMAIL = 'qa@example.com';
const TOKEN = 'token-crudo-secreto';
const ATRIBUTO_SUBMIT = 'type="submit"';

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.resetAllMocks();
  holder.nodeEnv = 'development';
  holder.cookieGet.mockImplementation((nombre: string) =>
    holder.cookieValor === undefined ? undefined : { name: nombre, value: holder.cookieValor },
  );
  holder.cookieValor = undefined;
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderizar(searchParams: SearchParams = {}): Promise<string> {
  return renderToStaticMarkup(await DevLoginPage({ searchParams: Promise.resolve(searchParams) }));
}

describe('dev-login/page', () => {
  it('debe forzar el renderizado dinámico', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  describe('entorno no permitido (defensa en profundidad)', () => {
    it.each(['production', 'preview', ''])(
      'debe responder notFound y no renderizar nada con NODE_ENV %j',
      async (nodeEnv) => {
        holder.nodeEnv = nodeEnv;

        await expect(renderizar()).rejects.toThrow('NEXT_NOT_FOUND');
      },
    );

    it('no debe consultar la sesión en producción', async () => {
      holder.nodeEnv = 'production';

      await expect(renderizar()).rejects.toThrow('NEXT_NOT_FOUND');

      expect(getSession).not.toHaveBeenCalled();
    });

    it('no debe leer las cookies en producción: notFound va antes de cookies()', async () => {
      holder.nodeEnv = 'production';

      await expect(renderizar()).rejects.toThrow('NEXT_NOT_FOUND');

      expect(holder.cookieGet).not.toHaveBeenCalled();
    });
  });

  describe('con sesión válida', () => {
    beforeEach(() => {
      holder.cookieValor = TOKEN;
      vi.mocked(getSession).mockResolvedValue({
        id: 'usuario-1',
        email: EMAIL,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      });
    });

    it('debe mostrar "Conectado como <email>"', async () => {
      const html = await renderizar();

      expect(html).toContain(`Conectado como ${EMAIL}`);
    });

    it('no debe mostrar el botón de login ni ningún formulario', async () => {
      const html = await renderizar();

      expect(html).not.toContain(ATRIBUTO_SUBMIT);
      expect(html).not.toContain('<form');
    });

    it('debe ignorar ?error=1: no muestra el mensaje de error de login', async () => {
      const html = await renderizar({ error: '1' });

      expect(html).toContain(`Conectado como ${EMAIL}`);
      expect(html).not.toContain('No se pudo iniciar sesión');
    });

    it('debe validar el token de la cookie de sesión', async () => {
      await renderizar();

      expect(holder.cookieGet).toHaveBeenCalledWith(NOMBRE_COOKIE_SESION);
      expect(getSession).toHaveBeenCalledWith(TOKEN);
    });
  });

  describe('sin sesión', () => {
    it('debe mostrar el botón de login si no hay cookie', async () => {
      vi.mocked(getSession).mockRejectedValue(new SessionNotFoundError());

      const html = await renderizar();

      expect(html).toContain(ATRIBUTO_SUBMIT);
      expect(html).not.toContain('Conectado como');
    });

    it('debe renderizar el botón de submit dentro de un <form>', async () => {
      vi.mocked(getSession).mockRejectedValue(new SessionNotFoundError());

      const html = await renderizar();

      expect(html).toMatch(/<form[^>]*>[\s\S]*type="submit"[\s\S]*<\/form>/);
    });

    it('debe mostrar el botón de login si la sesión no se encuentra (SessionNotFoundError)', async () => {
      holder.cookieValor = TOKEN;
      vi.mocked(getSession).mockRejectedValue(new SessionNotFoundError());

      expect(await renderizar()).toContain(ATRIBUTO_SUBMIT);
    });

    it('debe mostrar el botón de login si la sesión expiró (SessionExpiredError)', async () => {
      holder.cookieValor = TOKEN;
      vi.mocked(getSession).mockRejectedValue(new SessionExpiredError());

      expect(await renderizar()).toContain(ATRIBUTO_SUBMIT);
    });

    it('no debe mostrar mensaje de error si no viene ?error', async () => {
      vi.mocked(getSession).mockRejectedValue(new SessionNotFoundError());

      expect(await renderizar()).not.toContain('No se pudo iniciar sesión');
    });

    it('debe mostrar un mensaje genérico junto al botón si viene ?error=1', async () => {
      vi.mocked(getSession).mockRejectedValue(new SessionNotFoundError());

      const html = await renderizar({ error: '1' });

      expect(html).toContain('No se pudo iniciar sesión');
      expect(html).toContain(ATRIBUTO_SUBMIT);
    });

    // Objetos y no valores sueltos: `it.each` expande los arrays como listas de argumentos.
    it.each<{ error: string | string[] }>([{ error: '' }, { error: '2' }, { error: ['1', '2'] }])(
      'no debe mostrar el mensaje de error si ?error vale $error (solo "1" lo activa)',
      async ({ error }) => {
        vi.mocked(getSession).mockRejectedValue(new SessionNotFoundError());

        const html = await renderizar({ error });

        expect(html).not.toContain('No se pudo iniciar sesión');
        expect(html).toContain(ATRIBUTO_SUBMIT);
      },
    );

    it('no debe revelar la causa del rechazo en el mensaje de error', async () => {
      vi.mocked(getSession).mockRejectedValue(new SessionNotFoundError());

      const html = await renderizar({ error: '1' });

      expect(html).not.toMatch(/production|producción|QA_ACCESS_EMAIL|configur|base de datos/i);
    });
  });

  describe('error de datos', () => {
    beforeEach(() => {
      holder.cookieValor = TOKEN;
      const cause = new Error(`select ... token_hash = '${TOKEN}' and email = '${EMAIL}'`);
      vi.mocked(getSession).mockRejectedValue(
        new RepositoryError('sesion.findByTokenHash', { cause }),
      );
    });

    it('debe mostrar un mensaje genérico de error y ningún botón', async () => {
      const html = await renderizar();

      expect(html).toContain('No se pudo verificar la sesión');
      expect(html).not.toContain(ATRIBUTO_SUBMIT);
    });

    it('debe loguear solo la operation, sin email, token ni cause', async () => {
      await renderizar();

      const log = consoleError.mock.calls.map((llamado) => String(llamado[0])).join('\n');
      expect(log).toContain('sesion.findByTokenHash');
      expect(log).not.toContain(EMAIL);
      expect(log).not.toContain(TOKEN);
      expect(log).not.toMatch(/select/i);
    });

    it('no debe filtrar el email, el token ni el SQL en el HTML', async () => {
      const html = await renderizar();

      expect(html).not.toContain(EMAIL);
      expect(html).not.toContain(TOKEN);
      expect(html).not.toMatch(/select/i);
    });
  });
});
