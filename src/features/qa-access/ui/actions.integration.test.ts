import { createHash, randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { sesiones, usuarios } from '../../../shared/db/schema';
import { qaBackdoorLogin } from './actions';
import { NOMBRE_COOKIE_SESION } from './cookie-sesion';

/**
 * Tests de integración contra la BD de test (TEST_DATABASE_URL), nunca contra la BD real: repositories
 * y session-service reales sobre un cliente de test. `env`, `next/headers` y `next/navigation` se
 * simulan. Cada test usa un email único y lo borra en `afterEach` (la cascada de FK borra sus sesiones).
 */

type EnvSimulado = { nodeEnv: string; qaAccessEmail: string | undefined };

const holder = vi.hoisted(() => ({
  db: undefined as NodePgDatabase | undefined,
  env: undefined as EnvSimulado | undefined,
  cookieSet: vi.fn(),
}));

// Getters (no valores): las factories corren al importar `actions`, antes de que cada test fije
// `holder.db` y `holder.env`.
vi.mock('../../../shared/db/client', () => ({
  get db() {
    return holder.db;
  },
}));
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

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL debe estar definida para correr actions.integration.test.ts contra una BD de test real.',
  );
}

let pool: Pool;
let dbDeTest: NodePgDatabase;
let info: MockInstance<typeof console.info>;
let warn: MockInstance<typeof console.warn>;
let consoleError: MockInstance<typeof console.error>;

const emailsCreados: string[] = [];

/** Email único ya normalizado; se registra para limpiarlo al terminar el test. */
function emailUnico(): string {
  const email = `qa-action-${randomUUID()}@example.com`;
  emailsCreados.push(email);
  return email;
}

function sha256Hex(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}

function lineasDeLog(espia: MockInstance<typeof console.info>): string {
  return espia.mock.calls.map((llamado) => String(llamado[0])).join('\n');
}

async function usuariosConEmail(email: string) {
  return dbDeTest.select().from(usuarios).where(eq(usuarios.email, email));
}

async function sesionesDelEmail(email: string) {
  const [usuario] = await usuariosConEmail(email);
  if (!usuario) {
    return [];
  }
  return dbDeTest.select().from(sesiones).where(eq(sesiones.usuarioId, usuario.id));
}

/** Simula un pg que rechaza toda query: el error trae datos sensibles como haría el real. */
function dbConPgQueFalla(): NodePgDatabase {
  const errorDeConexion = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
    code: 'ECONNREFUSED',
  });
  const pgFalso = { query: vi.fn().mockRejectedValue(errorDeConexion) } as unknown as Pool;
  return drizzle(pgFalso);
}

/** Argumentos con los que la action llamó a `cookies().set` (el token crudo va en el segundo). */
function cookieSeteada(): { nombre: string; token: string; opciones: Record<string, unknown> } {
  expect(holder.cookieSet).toHaveBeenCalledTimes(1);
  const [nombre, token, opciones] = holder.cookieSet.mock.calls[0] as [
    string,
    string,
    Record<string, unknown>,
  ];
  return { nombre, token, opciones };
}

beforeAll(() => {
  pool = new Pool({ connectionString: testDatabaseUrl });
  dbDeTest = drizzle(pool);
});

beforeEach(() => {
  holder.db = dbDeTest;
  holder.cookieSet.mockReset();
  info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  holder.db = dbDeTest;
  const pendientes = emailsCreados.splice(0);
  if (pendientes.length > 0) {
    await dbDeTest.delete(usuarios).where(inArray(usuarios.email, pendientes));
  }
});

afterAll(async () => {
  await pool.end();
});

describe('actions/qaBackdoorLogin', () => {
  describe('entorno permitido con email de QA configurado', () => {
    it('debe crear el usuario y redirigir a /dev-login (AC-01)', async () => {
      const email = emailUnico();
      holder.env = { nodeEnv: 'development', qaAccessEmail: email };

      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login'));

      expect(await usuariosConEmail(email)).toHaveLength(1);
    });

    it('debe crear una sesión que persiste solo el hash del token, nunca el token crudo (AC-02)', async () => {
      const email = emailUnico();
      holder.env = { nodeEnv: 'development', qaAccessEmail: email };

      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login'));

      const { token } = cookieSeteada();
      const filas = await sesionesDelEmail(email);
      expect(filas).toHaveLength(1);
      expect(filas[0]?.tokenHash).toBe(sha256Hex(token));
      expect(filas[0]?.tokenHash).not.toBe(token);
    });

    it('debe setear la cookie httpOnly con sameSite=lax y sin secure en development (AC-04, NFR-02)', async () => {
      holder.env = { nodeEnv: 'development', qaAccessEmail: emailUnico() };

      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login'));

      const { nombre, opciones } = cookieSeteada();
      expect(nombre).toBe(NOMBRE_COOKIE_SESION);
      expect(opciones).toEqual({ httpOnly: true, sameSite: 'lax', secure: false, path: '/' });
    });

    it('debe exigir secure en la cookie cuando el entorno es staging', async () => {
      const email = emailUnico();
      holder.env = { nodeEnv: 'staging', qaAccessEmail: email };

      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login'));

      expect(cookieSeteada().opciones).toMatchObject({ secure: true });
    });

    it('debe normalizar el email de QA antes de crear el usuario', async () => {
      const email = emailUnico();
      holder.env = { nodeEnv: 'test', qaAccessEmail: `  ${email.toUpperCase()} ` };

      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login'));

      expect(await usuariosConEmail(email)).toHaveLength(1);
    });

    it('debe reutilizar el usuario existente si se inicia sesión dos veces', async () => {
      const email = emailUnico();
      holder.env = { nodeEnv: 'development', qaAccessEmail: email };

      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login'));
      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login'));

      expect(await usuariosConEmail(email)).toHaveLength(1);
      expect(await sesionesDelEmail(email)).toHaveLength(2);
    });

    it('debe loguear outcome granted sin exponer el token ni el email', async () => {
      const email = emailUnico();
      holder.env = { nodeEnv: 'development', qaAccessEmail: email };

      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login'));

      const log = lineasDeLog(info);
      expect(log).toContain('"outcome":"granted"');
      expect(log).not.toContain(cookieSeteada().token);
      expect(log).not.toContain(email);
    });
  });

  describe('seguridad: rechazo incondicional en producción (AC-03, NFR-06)', () => {
    it('no debe crear usuario ni sesión ni cookie y debe redirigir con error, aun con QA_ACCESS_EMAIL configurada', async () => {
      const email = emailUnico();
      holder.env = { nodeEnv: 'production', qaAccessEmail: email };

      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login?error=1'));

      expect(await usuariosConEmail(email)).toHaveLength(0);
      expect(await sesionesDelEmail(email)).toHaveLength(0);
      expect(holder.cookieSet).not.toHaveBeenCalled();
    });

    it.each(['preview', ''])(
      'debe rechazar también con NODE_ENV %j (falla cerrado)',
      async (nodeEnv) => {
        const email = emailUnico();
        holder.env = { nodeEnv, qaAccessEmail: email };

        await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login?error=1'));

        expect(await usuariosConEmail(email)).toHaveLength(0);
        expect(holder.cookieSet).not.toHaveBeenCalled();
      },
    );

    it('debe loguear el motivo (solo server-side) sin incluir el email', async () => {
      const email = emailUnico();
      holder.env = { nodeEnv: 'production', qaAccessEmail: email };

      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login?error=1'));

      const log = lineasDeLog(warn);
      expect(log).toContain('"outcome":"denied"');
      expect(log).toContain('"reason":"environment_not_allowed"');
      expect(log).not.toContain(email);
    });
  });

  describe('sin QA_ACCESS_EMAIL configurada', () => {
    it('no debe setear cookie y debe redirigir con error genérico', async () => {
      holder.env = { nodeEnv: 'development', qaAccessEmail: undefined };

      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login?error=1'));

      expect(holder.cookieSet).not.toHaveBeenCalled();
    });

    it('debe loguear el motivo not_configured', async () => {
      holder.env = { nodeEnv: 'development', qaAccessEmail: undefined };

      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login?error=1'));

      expect(lineasDeLog(warn)).toContain('"reason":"not_configured"');
    });
  });

  describe('errores de datos', () => {
    it('debe redirigir con error genérico y sin cookie ante un RepositoryError', async () => {
      const email = emailUnico();
      holder.env = { nodeEnv: 'development', qaAccessEmail: email };
      holder.db = dbConPgQueFalla();

      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login?error=1'));

      expect(holder.cookieSet).not.toHaveBeenCalled();
    });

    it('debe loguear solo la operation, nunca el email, el SQL ni el error del driver', async () => {
      const email = emailUnico();
      holder.env = { nodeEnv: 'development', qaAccessEmail: email };
      holder.db = dbConPgQueFalla();

      await expect(qaBackdoorLogin()).rejects.toThrow(new Error('REDIRECT:/dev-login?error=1'));

      const log = lineasDeLog(consoleError);
      expect(log).toContain('"outcome":"error"');
      expect(log).toMatch(/"operation":"[^"]+"/);
      expect(log).not.toContain(email);
      expect(log).not.toMatch(/insert|select|ECONNREFUSED/i);
    });
  });
});
