import { normalizarEmail } from '../../../shared/sesion/domain/rules';
import { iniciarSesionParaEmail } from '../../../shared/sesion/domain/session-service';
import { QaAccessDeniedError } from '../domain/errors';
import { esEntornoPermitidoParaAccesoQa } from '../domain/rules';

type ConfiguracionAccesoQa = {
  nodeEnv: string;
  qaAccessEmail: string | undefined;
};

/**
 * Valida que el acceso QA esté permitido y abre la sesión; devuelve el token crudo para la cookie.
 * Lanza `QaAccessDeniedError` (sin capturarlo) y deja pasar los errores del service: decidir cómo
 * responder al cliente es de la server action. No lee `env` ni `process`: recibe todo por parámetro.
 */
export async function autenticarAccesoQa(config: ConfiguracionAccesoQa): Promise<string> {
  if (!esEntornoPermitidoParaAccesoQa(config.nodeEnv)) {
    throw new QaAccessDeniedError('environment_not_allowed');
  }

  const email = normalizarEmail(config.qaAccessEmail ?? '');
  if (email === '') {
    throw new QaAccessDeniedError('not_configured');
  }

  return iniciarSesionParaEmail(email);
}
