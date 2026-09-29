// Único archivo de `domain` que importa de `data/` (A6, nota de ADR-007): las reglas siguen puras.
import { crearConsumo } from '../data/consumo-repository';
import { analizarConModeloVision } from '../data/modelo-vision';
import {
  normalizarConfianza,
  normalizarDesglose,
  validarDatosConsumo,
  validarImagen,
} from './rules';
import type { Consumo, EstimacionNutricional } from './types';

/**
 * Analiza la foto y devuelve la estimación con el desglose normalizado a enteros que suman 100.
 * Los `AnalisisImagenError` (de validación, del adaptador o de la normalización) se propagan tal
 * cual: decidir la respuesta es de la capa ui (ADR-004). No se loguea nada: el `cause` puede traer
 * el error del SDK (NFR-04).
 */
export async function analizarImagen(bytes: Uint8Array): Promise<EstimacionNutricional> {
  validarImagen(bytes);
  const crudo = await analizarConModeloVision(bytes);
  // El adaptador ya redondea; se reafirma porque el contrato de `EstimacionNutricional` es entero.
  // La normalización usa el mismo valor redondeado: si no, 0.4 kcal con todo en 0 se mostraría
  // como 0 kcal pero la regla de 0 kcal no aplicaría y se lanzaría `respuesta-invalida`.
  const calorias = Math.round(crudo.calorias);
  return {
    descripcion: crudo.descripcion,
    calorias,
    desglose: normalizarDesglose(crudo.desglose, calorias),
    confianza: normalizarConfianza(crudo.confianza),
  };
}

/**
 * Valida los datos del cliente y persiste el consumo. `usuarioId` lo resuelve la capa ui desde la
 * sesión y nunca se toma de `entrada` (M-1). `DatosConsumoInvalidosError` y `RepositoryError` se
 * propagan tal cual.
 */
export async function guardarConsumo(usuarioId: string, entrada: unknown): Promise<Consumo> {
  const datos = validarDatosConsumo(entrada);
  return crearConsumo({ ...datos, usuarioId });
}
