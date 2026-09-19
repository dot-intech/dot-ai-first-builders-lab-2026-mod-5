/**
 * Error tipado lanzado cuando falta una variable de entorno requerida al arrancar.
 * Nunca se atrapa silenciosamente: si esto se lanza, la app no debe seguir arrancando.
 */
export class EnvValidationError extends Error {
  constructor(missingVariable: string) {
    super(`Falta la variable de entorno requerida: ${missingVariable}`);
    this.name = 'EnvValidationError';
  }
}

export type Env = {
  nodeEnv: string;
  databaseUrl: string;
  qaAccessEmail: string | undefined;
};

function buildEnv(): Env {
  // Sin NODE_ENV (o vacía) se asume 'production': el acceso QA usa una lista de entornos permitidos,
  // así que un default permisivo sería fail-open. Por eso `||` y no `??`: '' también cierra.
  // Next.js siempre define NODE_ENV y vitest usa 'test'.
  const nodeEnv = process.env.NODE_ENV || 'production';
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new EnvValidationError('DATABASE_URL');
  }

  // QA_ACCESS_EMAIL es opcional a propósito: sin ella, el backdoor de acceso QA
  // nunca matchea ningún email.
  // Nunca prefijar con NEXT_PUBLIC_ — debe permanecer server-side (threat model).
  // Un valor vacío o de solo espacios equivale a "no configurada". Esa regla se repite a
  // propósito en emailCoincideConQa (qa-access): env.ts no puede importar de features/.
  const qaAccessEmailRaw = process.env.QA_ACCESS_EMAIL?.trim();
  const qaAccessEmail = qaAccessEmailRaw ? qaAccessEmailRaw : undefined;

  return {
    nodeEnv,
    databaseUrl,
    qaAccessEmail,
  };
}

// Se lee y valida una sola vez, al cargar este módulo.
export const env: Env = buildEnv();
