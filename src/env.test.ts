import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('env', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('QA_ACCESS_EMAIL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('debe lanzar EnvValidationError si DATABASE_URL no está definida', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', '');

    let caught: unknown;
    try {
      await import('./env');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('EnvValidationError');
  });

  it('debe devolver qaAccessEmail como undefined si la variable no está seteada', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    vi.stubEnv('QA_ACCESS_EMAIL', undefined);

    const { env } = await import('./env');

    expect(env.qaAccessEmail).toBeUndefined();
  });

  it('debe exponer nodeEnv tal cual viene de process.env.NODE_ENV', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');

    const { env } = await import('./env');

    expect(env.nodeEnv).toBe('development');
  });
});
