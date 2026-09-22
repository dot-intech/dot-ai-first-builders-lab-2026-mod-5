import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QaAccessDeniedError, RepositoryError } from '../domain/errors';
import { iniciarSesionQa } from '../domain/session-service';
import { autenticarAccesoQa } from './acceso-qa';

// Factory explícita: el automock importaría los repositories reales y con ellos `client.ts`/`env.ts`.
vi.mock('../domain/session-service', () => ({
  iniciarSesionQa: vi.fn(),
}));

const EMAIL_QA = 'qa@example.com';
const TOKEN = 'token-crudo-de-prueba';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(iniciarSesionQa).mockResolvedValue(TOKEN);
});

describe('acceso-qa/autenticarAccesoQa', () => {
  describe('entorno no permitido', () => {
    it.each(['production', 'preview', '', 'Production'])(
      'debe lanzar QaAccessDeniedError(environment_not_allowed) con NODE_ENV %j, aun con email configurado',
      async (nodeEnv) => {
        const error = await autenticarAccesoQa({ nodeEnv, qaAccessEmail: EMAIL_QA }).catch(
          (e: unknown) => e,
        );

        expect(error).toBeInstanceOf(QaAccessDeniedError);
        expect((error as QaAccessDeniedError).reason).toBe('environment_not_allowed');
      },
    );

    it.each(['production', 'preview', '', 'Production'])(
      'no debe llamar al service con NODE_ENV %j',
      async (nodeEnv) => {
        await expect(
          autenticarAccesoQa({ nodeEnv, qaAccessEmail: EMAIL_QA }),
        ).rejects.toBeInstanceOf(QaAccessDeniedError);

        expect(iniciarSesionQa).not.toHaveBeenCalled();
      },
    );

    it('debe priorizar el rechazo por entorno sobre el email no configurado', async () => {
      const error = await autenticarAccesoQa({
        nodeEnv: 'production',
        qaAccessEmail: undefined,
      }).catch((e: unknown) => e);

      expect((error as QaAccessDeniedError).reason).toBe('environment_not_allowed');
    });
  });

  describe('email de QA no configurado', () => {
    it.each([undefined, '', '   '])(
      'debe lanzar QaAccessDeniedError(not_configured) con el email %j',
      async (qaAccessEmail) => {
        const error = await autenticarAccesoQa({ nodeEnv: 'development', qaAccessEmail }).catch(
          (e: unknown) => e,
        );

        expect(error).toBeInstanceOf(QaAccessDeniedError);
        expect((error as QaAccessDeniedError).reason).toBe('not_configured');
      },
    );

    it('no debe llamar al service si el email no está configurado', async () => {
      await expect(
        autenticarAccesoQa({ nodeEnv: 'development', qaAccessEmail: undefined }),
      ).rejects.toBeInstanceOf(QaAccessDeniedError);

      expect(iniciarSesionQa).not.toHaveBeenCalled();
    });
  });

  describe('acceso permitido', () => {
    it.each(['development', 'test', 'staging'])(
      'debe llamar al service con el email normalizado y devolver el token crudo en %s',
      async (nodeEnv) => {
        const token = await autenticarAccesoQa({
          nodeEnv,
          qaAccessEmail: '  QA@Example.COM ',
        });

        expect(iniciarSesionQa).toHaveBeenCalledExactlyOnceWith(EMAIL_QA);
        expect(token).toBe(TOKEN);
      },
    );

    it('debe propagar el RepositoryError del service sin capturarlo', async () => {
      const errorDeDatos = new RepositoryError('sesion.create');
      vi.mocked(iniciarSesionQa).mockRejectedValue(errorDeDatos);

      await expect(
        autenticarAccesoQa({ nodeEnv: 'development', qaAccessEmail: EMAIL_QA }),
      ).rejects.toBe(errorDeDatos);
    });
  });
});
