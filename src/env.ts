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
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new EnvValidationError('DATABASE_URL');
  }

  // QA_ACCESS_EMAIL es opcional a propósito: sin ella, el backdoor de acceso QA
  // nunca matchea ningún email (ver domain/rules.ts en Block 3).
  // Nunca prefijar con NEXT_PUBLIC_ — debe permanecer server-side (threat model).
  const qaAccessEmail = process.env.QA_ACCESS_EMAIL;

  return {
    nodeEnv,
    databaseUrl,
    qaAccessEmail,
  };
}

// Se lee y valida una sola vez, al cargar este módulo.
export const env: Env = buildEnv();
