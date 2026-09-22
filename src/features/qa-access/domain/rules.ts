export const INACTIVIDAD_MAXIMA_MS = 24 * 60 * 60 * 1000;

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

// La cookie de sesión es `secure` por defecto y solo se relaja en local y en tests: así un NODE_ENV
// vacío, con typo o de un entorno remoto ('staging', 'prod') nunca viaja sin `secure` (fail-closed).
// Independiente de la regla del backdoor: el servicio de sesión se reutilizará para el login real.
// No se exporta: un array exportado es mutable en runtime.
const ENTORNOS_SIN_COOKIE_SECURE: readonly string[] = ['development', 'test'];

/** `false` solo para 'development' y 'test' (comparación exacta); cualquier otro valor da `true`. */
export function cookieSesionEsSecure(nodeEnv: string): boolean {
  return !ENTORNOS_SIN_COOKIE_SECURE.includes(nodeEnv);
}

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
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

/**
 * Ventana deslizante de 24h: exactamente 24h de inactividad todavía no expira.
 * Falla cerrado: con una fecha inválida `elapsed` es NaN, la comparación da false y la sesión
 * se considera expirada. Una `lastActivityAt` futura (desfase de reloj) no expira.
 */
export function sesionExpiradaPorInactividad(lastActivityAt: Date, now: Date): boolean {
  const elapsed = now.getTime() - lastActivityAt.getTime();
  return !(elapsed <= INACTIVIDAD_MAXIMA_MS);
}
