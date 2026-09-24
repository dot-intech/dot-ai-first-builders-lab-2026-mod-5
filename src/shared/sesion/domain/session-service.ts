import { createHash, randomBytes } from 'node:crypto';
import { create, findByTokenHash, touchLastActivity } from '../data/sesion-repository';
import { findById, findOrCreateByEmail } from '../data/usuario-repository';
import { SessionExpiredError, SessionNotFoundError } from './errors';
import { sesionExpiradaPorInactividad } from './rules';
import type { Usuario } from './types';

const BYTES_TOKEN_SESION = 32;
// Defensa adicional: la cookie es input no confiable y no se hashean strings arbitrariamente largos.
const LONGITUD_MAXIMA_TOKEN = 128;

function hashearToken(tokenCrudo: string): string {
  return createHash('sha256').update(tokenCrudo).digest('hex');
}

// Se valida el tipo en runtime aunque la firma diga `string`: viene de una cookie.
function tokenTieneFormatoValido(tokenCrudo: unknown): tokenCrudo is string {
  return (
    typeof tokenCrudo === 'string' &&
    tokenCrudo.length > 0 &&
    tokenCrudo.length <= LONGITUD_MAXIMA_TOKEN
  );
}

/** Devuelve el token crudo (para la cookie); en la BD solo se persiste su hash SHA-256. */
export async function crearSesion(usuarioId: string, now: Date = new Date()): Promise<string> {
  const tokenCrudo = randomBytes(BYTES_TOKEN_SESION).toString('hex');
  await create({ usuarioId, tokenHash: hashearToken(tokenCrudo) }, now);
  return tokenCrudo;
}

/**
 * Abre una sesión para `email`: crea o reutiliza el usuario y devuelve el token crudo para la cookie.
 *
 * Contrato (ADR-007): no verifica identidad ni aplica reglas de ninguna feature. El caller debe haber
 * verificado la identidad antes; nunca se llama con un email que venga del cliente sin verificar,
 * porque abriría una sesión para ese email.
 */
export async function iniciarSesionParaEmail(email: string): Promise<string> {
  const usuario = await findOrCreateByEmail(email);
  return crearSesion(usuario.id);
}

/**
 * Valida el token de sesión y desliza la ventana de inactividad (NFR-01). Los errores de dominio
 * y los `RepositoryError` se propagan tal cual: decidir cómo mostrarlos es del caller.
 */
export async function getSession(tokenCrudo: string, now: Date = new Date()): Promise<Usuario> {
  if (!tokenTieneFormatoValido(tokenCrudo)) {
    throw new SessionNotFoundError();
  }

  const sesion = await findByTokenHash(hashearToken(tokenCrudo));
  if (!sesion) {
    throw new SessionNotFoundError();
  }

  if (sesionExpiradaPorInactividad(sesion.lastActivityAt, now)) {
    throw new SessionExpiredError();
  }

  const usuario = await findById(sesion.usuarioId);
  if (!usuario) {
    throw new SessionNotFoundError();
  }

  await touchLastActivity(sesion.id, now);
  return usuario;
}
