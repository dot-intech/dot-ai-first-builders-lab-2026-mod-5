'use server';

import { cookies } from 'next/headers';
import { NOMBRE_COOKIE_SESION } from '../../../shared/sesion/ui/cookie-sesion';
import {
  analizarFoto,
  guardar,
  type ResultadoAnalisis,
  type ResultadoGuardado,
} from './operaciones-consumo';

/*
 * En un archivo 'use server' toda función exportada queda expuesta como endpoint invocable por el
 * cliente: por eso este archivo exporta EXACTAMENTE `analizarFotoConsumo` y `guardarNuevoConsumo`
 * (M-2). Solo leen la cookie de sesión y delegan: la lógica parametrizable vive en
 * `operaciones-consumo.ts`, sin 'use server'. Sin sesión devuelven `{ tipo: 'sin-sesion' }` y no
 * redirigen: la redirección es de la página (D1).
 */

async function tokenDeSesion(): Promise<string | undefined> {
  return (await cookies()).get(NOMBRE_COOKIE_SESION)?.value;
}

/**
 * Analiza la foto de un consumo. Espera un `FormData` con el campo `imagen` (JPEG de hasta
 * `IMAGEN_MAX_BYTES` bytes, de `../domain/rules`; no se importa aquí para no sumar imports de valor
 * a un archivo 'use server'). La entrada se valida en el servidor. Devuelve la estimación,
 * `sin-sesion` o `error`, nunca mensajes técnicos.
 */
export async function analizarFotoConsumo(formData: unknown): Promise<ResultadoAnalisis> {
  return analizarFoto(await tokenDeSesion(), formData);
}

/**
 * Guarda el consumo revisado por el usuario a nombre del usuario de la sesión (el `usuarioId` nunca
 * se toma de `datos`). Devuelve `guardado`, `datos-invalidos`, `sin-sesion` o `error`.
 */
export async function guardarNuevoConsumo(datos: unknown): Promise<ResultadoGuardado> {
  return guardar(await tokenDeSesion(), datos);
}
