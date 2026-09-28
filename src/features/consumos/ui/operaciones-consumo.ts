import { RepositoryError } from '../../../shared/errors/repository-error';
import { analizarImagen, guardarConsumo } from '../domain/consumo-service';
import { AnalisisImagenError, DatosConsumoInvalidosError } from '../domain/errors';
import { IMAGEN_MAX_BYTES } from '../domain/rules';
import type { EstimacionNutricional } from '../domain/types';
import { registrarEventoConsumo } from './registro-consumo';
import { resolverUsuarioConsumo } from './sesion-consumo';

/*
 * Lógica de las server actions de consumos, SIN 'use server' a propósito: estas funciones reciben
 * el token por parámetro y, expuestas como endpoint, serían un oráculo para probar tokens. Todo
 * llega por parámetro (token de la cookie y la entrada del cliente): aquí no se lee `next/headers`
 * ni `env`. Los resultados nunca llevan mensajes técnicos (FR-10).
 */

export type ResultadoAnalisis =
  | { tipo: 'estimacion'; estimacion: EstimacionNutricional }
  | { tipo: 'sin-sesion' }
  | { tipo: 'error' };

export type ResultadoGuardado =
  | { tipo: 'guardado' }
  | { tipo: 'datos-invalidos' }
  | { tipo: 'sin-sesion' }
  | { tipo: 'error' };

/** Extrae la imagen del `FormData` sin leer sus bytes; `null` si la entrada no es aceptable. */
function imagenDelFormulario(formData: unknown): Blob | null {
  if (!(formData instanceof FormData)) {
    return null;
  }
  const imagen = formData.get('imagen');
  // El tamaño se verifica antes de leer los bytes: una imagen enorme no llega a memoria como buffer.
  if (!(imagen instanceof Blob) || imagen.size > IMAGEN_MAX_BYTES) {
    return null;
  }
  return imagen;
}

/**
 * Analiza la foto del consumo para el usuario de la sesión. Solo se atrapa `AnalisisImagenError`
 * (lo único que `analizarImagen` lanza por contrato); cualquier otro error se relanza (ADR-005).
 */
export async function analizarFoto(
  token: string | undefined,
  formData: unknown,
): Promise<ResultadoAnalisis> {
  const sesion = await resolverUsuarioConsumo(token);
  // `switch` exhaustivo sin `default`: si la sesión suma una variante, no compila (en vez de seguir
  // de largo y llamar al modelo). Literales propios, no el objeto de la sesión: un campo nuevo de
  // esa variante no viaja al cliente.
  switch (sesion.tipo) {
    case 'sin-sesion':
      return { tipo: 'sin-sesion' };
    case 'error':
      return { tipo: 'error' };
    case 'usuario':
      return analizarFotoDeUsuario(formData);
  }
}

async function analizarFotoDeUsuario(formData: unknown): Promise<ResultadoAnalisis> {
  const imagen = imagenDelFormulario(formData);
  if (imagen === null) {
    registrarEventoConsumo({
      event: 'consumo_analisis',
      outcome: 'rechazado',
      reason: 'imagen-invalida',
    });
    return { tipo: 'error' };
  }

  try {
    const estimacion = await analizarImagen(new Uint8Array(await imagen.arrayBuffer()));
    registrarEventoConsumo({ event: 'consumo_analisis', outcome: 'ok' });
    return { tipo: 'estimacion', estimacion };
  } catch (error) {
    if (error instanceof AnalisisImagenError) {
      registrarEventoConsumo({
        event: 'consumo_analisis',
        outcome: error.reason === 'imagen-invalida' ? 'rechazado' : 'error',
        reason: error.reason,
      });
      return { tipo: 'error' };
    }
    throw error;
  }
}

/**
 * Guarda el consumo a nombre del usuario de la sesión: el `usuarioId` sale de la sesión y nunca de
 * `datos` (M-1). Solo se atrapan `DatosConsumoInvalidosError` y `RepositoryError`; cualquier otro
 * error se relanza (ADR-005).
 */
export async function guardar(
  token: string | undefined,
  datos: unknown,
): Promise<ResultadoGuardado> {
  const sesion = await resolverUsuarioConsumo(token);
  // Mismo patrón que `analizarFoto`: `switch` exhaustivo sin `default` y literales propios.
  switch (sesion.tipo) {
    case 'sin-sesion':
      return { tipo: 'sin-sesion' };
    case 'error':
      return { tipo: 'error' };
    case 'usuario':
      return guardarDeUsuario(sesion.usuarioId, datos);
  }
}

async function guardarDeUsuario(usuarioId: string, datos: unknown): Promise<ResultadoGuardado> {
  try {
    await guardarConsumo(usuarioId, datos);
    registrarEventoConsumo({ event: 'consumo_guardado', outcome: 'ok' });
    return { tipo: 'guardado' };
  } catch (error) {
    if (error instanceof DatosConsumoInvalidosError) {
      registrarEventoConsumo({
        event: 'consumo_guardado',
        outcome: 'rechazado',
        reason: error.campo,
      });
      return { tipo: 'datos-invalidos' };
    }
    if (error instanceof RepositoryError) {
      registrarEventoConsumo({
        event: 'consumo_guardado',
        outcome: 'error',
        operation: error.operation,
      });
      return { tipo: 'error' };
    }
    throw error;
  }
}
