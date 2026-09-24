export const INACTIVIDAD_MAXIMA_MS = 24 * 60 * 60 * 1000;

// La cookie de sesión es `secure` por defecto y solo se relaja en local y en tests: así un NODE_ENV
// vacío, con typo o de un entorno remoto ('staging', 'prod') nunca viaja sin `secure` (fail-closed).
// No depende de reglas de ninguna feature: la sesión es compartida.
// No se exporta: un array exportado es mutable en runtime.
const ENTORNOS_SIN_COOKIE_SECURE: readonly string[] = ['development', 'test'];

/** `false` solo para 'development' y 'test' (comparación exacta); cualquier otro valor da `true`. */
export function cookieSesionEsSecure(nodeEnv: string): boolean {
  return !ENTORNOS_SIN_COOKIE_SECURE.includes(nodeEnv);
}

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
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
