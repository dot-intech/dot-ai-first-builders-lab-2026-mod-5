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

  it('debe devolver qaAccessEmail como undefined si la variable es un string vacío', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    vi.stubEnv('QA_ACCESS_EMAIL', '');

    const { env } = await import('./env');

    expect(env.qaAccessEmail).toBeUndefined();
  });

  it('debe devolver qaAccessEmail como undefined si la variable es solo espacios', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    vi.stubEnv('QA_ACCESS_EMAIL', '   ');

    const { env } = await import('./env');

    expect(env.qaAccessEmail).toBeUndefined();
  });

  it('debe devolver qaAccessEmail tal cual si tiene contenido', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    vi.stubEnv('QA_ACCESS_EMAIL', 'qa@example.com');

    const { env } = await import('./env');

    expect(env.qaAccessEmail).toBe('qa@example.com');
  });

  it('debe devolver qaAccessEmail sin espacios en los extremos', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    vi.stubEnv('QA_ACCESS_EMAIL', '  qa@example.com  ');

    const { env } = await import('./env');

    expect(env.qaAccessEmail).toBe('qa@example.com');
  });

  it("debe usar 'production' como nodeEnv si NODE_ENV no está definida (falla cerrado)", async () => {
    vi.stubEnv('NODE_ENV', undefined);
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');

    const { env } = await import('./env');

    expect(env.nodeEnv).toBe('production');
  });

  it("debe usar 'production' como nodeEnv si NODE_ENV está definida pero vacía (falla cerrado)", async () => {
    vi.stubEnv('NODE_ENV', '');
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');

    const { env } = await import('./env');

    expect(env.nodeEnv).toBe('production');
  });

  it('debe exponer nodeEnv tal cual viene de process.env.NODE_ENV', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');

    const { env } = await import('./env');

    expect(env.nodeEnv).toBe('development');
  });
});
