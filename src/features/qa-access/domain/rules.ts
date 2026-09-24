import { normalizarEmail } from '../../../shared/sesion/domain/rules';

// Lista de permitidos (no de bloqueados): falla cerrado ante cualquier valor inesperado o con
// typos ('prod', 'Production', ''), y por eso mismo no hace falta normalizar el valor recibido.
// No se exporta: un array exportado es mutable en runtime y el control debe fallar cerrado.
const ENTORNOS_PERMITIDOS_ACCESO_QA: readonly string[] = ['development', 'test', 'staging'];

/**
 * Regla crítica de seguridad: el acceso QA solo se habilita con un NODE_ENV exactamente igual a
 * uno de `ENTORNOS_PERMITIDOS_ACCESO_QA`. Cualquier otro valor se rechaza, incluidas variantes de
 * mayúsculas o espacios. Esta función no lee el entorno: quien llama es responsable de pasar
 * `nodeEnv`.
 */
export function esEntornoPermitidoParaAccesoQa(nodeEnv: string): boolean {
  return ENTORNOS_PERMITIDOS_ACCESO_QA.includes(nodeEnv);
}

export function emailCoincideConQa(email: string, qaAccessEmail: string | undefined): boolean {
  if (qaAccessEmail === undefined) {
    return false;
  }
  const qaNormalizado = normalizarEmail(qaAccessEmail);
  // Un email de QA vacío nunca debe coincidir (ni siquiera con un email vacío).
  if (qaNormalizado === '') {
    return false;
  }
  return normalizarEmail(email) === qaNormalizado;
}
