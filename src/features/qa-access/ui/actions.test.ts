import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { QaAccessDeniedError, RepositoryError } from '../domain/errors';
import { autenticarAccesoQa } from './acceso-qa';
import { qaBackdoorLogin } from './actions';
import { NOMBRE_COOKIE_SESION, opcionesCookieSesion } from './cookie-sesion';

/**
 * Unitario, sin BD: `autenticarAccesoQa` se simula y aquí se verifican las decisiones de la action
 * (redirect, cookie, nivel y contenido del log). El recorrido con BD real está en
 * `actions.integration.test.ts`.
 */

type EnvSimulado = { nodeEnv: string; qaAccessEmail: string | undefined };

const EMAIL = 'qa@example.com';
const TOKEN = 'token-crudo-secreto';
const REDIRECT_CON_ERROR = new Error('REDIRECT:/dev-login?error=1');

const holder = vi.hoisted(() => ({
  env: undefined as EnvSimulado | undefined,
  cookieSet: vi.fn(),
}));

// Factory explícita: el automock importaría `session-service`, los repositories y con ellos `client.ts`.
vi.mock('./acceso-qa', () => ({
  autenticarAccesoQa: vi.fn(),
}));
// Getter (no valor): cada test fija el entorno antes de invocar la action.
vi.mock('../../../env', () => ({
  get env() {
    return holder.env;
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: holder.cookieSet }),
}));
// Como en Next, `redirect` no retorna: lanza. El mensaje lleva la URL para poder afirmarla.
vi.mock('next/navigation', () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

let info: MockInstance<typeof console.info>;
let warn: MockInstance<typeof console.warn>;
let error: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.resetAllMocks();
  holder.env = { nodeEnv: 'development', qaAccessEmail: EMAIL };
  info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function lineasDe(espia: MockInstance<typeof console.info>): Record<string, unknown>[] {
  return espia.mock.calls.map(
    (llamado) => JSON.parse(String(llamado[0])) as Record<string, unknown>,
  );
}

function logCompleto(): string {
  return [info, warn, error]
    .flatMap((espia) => espia.mock.calls.map((llamado) => String(llamado[0])))
    .join('\n');
}

describe('actions/qaBackdoorLogin (unitario)', () => {
  describe('acceso denegado (QaAccessDeniedError)', () => {
    it.each(['environment_not_allowed', 'not_configured'] as const)(
      'debe redirigir a /dev-login?error=1 cuando el motivo es %s',
      async (reason) => {
        vi.mocked(autenticarAccesoQa).mockRejectedValue(new QaAccessDeniedError(reason));

        await expect(qaBackdoorLogin()).rejects.toThrow(REDIRECT_CON_ERROR);
      },
    );

    it('debe registrar un evento denied con el reason en nivel warn', async () => {
      vi.mocked(autenticarAccesoQa).mockRejectedValue(
        new QaAccessDeniedError('environment_not_allowed'),
      );

      await expect(qaBackdoorLogin()).rejects.toThrow(REDIRECT_CON_ERROR);

      expect(lineasDe(warn)).toEqual([
        expect.objectContaining({
          event: 'qa_backdoor_login',
          outcome: 'denied',
          reason: 'environment_not_allowed',
        }),
      ]);
      expect(info).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it('no debe setear cookie', async () => {
      vi.mocked(autenticarAccesoQa).mockRejectedValue(new QaAccessDeniedError('not_configured'));

      await expect(qaBackdoorLogin()).rejects.toThrow(REDIRECT_CON_ERROR);

      expect(holder.cookieSet).not.toHaveBeenCalled();
    });

    it('no debe exponer el email en el log', async () => {
      vi.mocked(autenticarAccesoQa).mockRejectedValue(
        new QaAccessDeniedError('environment_not_allowed'),
      );

      await expect(qaBackdoorLogin()).rejects.toThrow(REDIRECT_CON_ERROR);

      expect(logCompleto()).not.toContain(EMAIL);
    });
  });

  describe('error de datos (RepositoryError)', () => {
    const cause = new Error(`insert into sesiones ... token_hash = '${TOKEN}' email = '${EMAIL}'`);

    it('debe redirigir a /dev-login?error=1', async () => {
      vi.mocked(autenticarAccesoQa).mockRejectedValue(new RepositoryError('sesion.create'));

      await expect(qaBackdoorLogin()).rejects.toThrow(REDIRECT_CON_ERROR);
    });

    it('debe registrar un evento error con la operation en nivel error', async () => {
      vi.mocked(autenticarAccesoQa).mockRejectedValue(new RepositoryError('sesion.create'));

      await expect(qaBackdoorLogin()).rejects.toThrow(REDIRECT_CON_ERROR);

      expect(lineasDe(error)).toEqual([
        expect.objectContaining({
          event: 'qa_backdoor_login',
          outcome: 'error',
          operation: 'sesion.create',
        }),
      ]);
      expect(info).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });

    it('no debe setear cookie', async () => {
      vi.mocked(autenticarAccesoQa).mockRejectedValue(new RepositoryError('sesion.create'));

      await expect(qaBackdoorLogin()).rejects.toThrow(REDIRECT_CON_ERROR);

      expect(holder.cookieSet).not.toHaveBeenCalled();
    });

    it('no debe exponer el email, el token ni el cause en el log', async () => {
      vi.mocked(autenticarAccesoQa).mockRejectedValue(
        new RepositoryError('sesion.create', { cause }),
      );

      await expect(qaBackdoorLogin()).rejects.toThrow(REDIRECT_CON_ERROR);

      const log = logCompleto();
      expect(log).not.toContain(EMAIL);
      expect(log).not.toContain(TOKEN);
      expect(log).not.toMatch(/insert/i);
    });
  });

  describe('acceso concedido', () => {
    beforeEach(() => {
      vi.mocked(autenticarAccesoQa).mockResolvedValue(TOKEN);
    });

    it('debe autenticar con el entorno y el email de QA que trae env', async () => {
      holder.env = { nodeEnv: 'staging', qaAccessEmail: EMAIL };

      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login'));

      expect(autenticarAccesoQa).toHaveBeenCalledExactlyOnceWith({
        nodeEnv: 'staging',
        qaAccessEmail: EMAIL,
      });
    });

    it('debe setear la cookie de sesión con el token y las opciones del entorno', async () => {
      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login'));

      expect(holder.cookieSet).toHaveBeenCalledExactlyOnceWith(
        NOMBRE_COOKIE_SESION,
        TOKEN,
        opcionesCookieSesion('development'),
      );
    });

    it.each([
      { nodeEnv: 'development', secure: false },
      { nodeEnv: 'staging', secure: true },
    ])(
      'debe setear la cookie httpOnly, sameSite=lax y secure=$secure en $nodeEnv',
      async ({ nodeEnv, secure }) => {
        holder.env = { nodeEnv, qaAccessEmail: EMAIL };

        await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login'));

        expect(holder.cookieSet.mock.calls[0]?.[2]).toEqual({
          httpOnly: true,
          sameSite: 'lax',
          secure,
          path: '/',
        });
      },
    );

    it('debe registrar un evento granted en nivel info', async () => {
      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login'));

      expect(lineasDe(info)).toEqual([
        expect.objectContaining({ event: 'qa_backdoor_login', outcome: 'granted' }),
      ]);
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it('debe redirigir a /dev-login sin el token ni el email en la URL', async () => {
      const redirect = await qaBackdoorLogin().then(
        () => undefined,
        (rechazo: unknown) => rechazo,
      );

      expect(redirect).toEqual(new Error('REDIRECT:/dev-login'));
      expect(String((redirect as Error).message)).not.toMatch(new RegExp(`${TOKEN}|${EMAIL}`));
    });

    it('no debe exponer el token ni el email en el log', async () => {
      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login'));

      const log = logCompleto();
      expect(log).not.toContain(TOKEN);
      expect(log).not.toContain(EMAIL);
    });
  });

  describe('errores inesperados', () => {
    it('debe relanzar la misma instancia de un error que no es de dominio ni de datos', async () => {
      const inesperado = new Error('fallo imprevisto');
      vi.mocked(autenticarAccesoQa).mockRejectedValue(inesperado);

      await expect(qaBackdoorLogin()).rejects.toBe(inesperado);
    });

    it('no debe setear cookie ni registrar ningún evento de log', async () => {
      vi.mocked(autenticarAccesoQa).mockRejectedValue(new Error('fallo imprevisto'));

      await expect(qaBackdoorLogin()).rejects.toThrow('fallo imprevisto');

      expect(holder.cookieSet).not.toHaveBeenCalled();
      expect(logCompleto()).toBe('');
    });
  });

  describe('superficie expuesta', () => {
    it('debe exportar únicamente qaBackdoorLogin', async () => {
      // En un archivo 'use server' toda función exportada queda expuesta como endpoint invocable
      // por el cliente: un segundo export (aunque sea un helper) sería una superficie de ataque nueva.
      expect(Object.keys(await import('./actions'))).toEqual(['qaBackdoorLogin']);
    });
  });
});
