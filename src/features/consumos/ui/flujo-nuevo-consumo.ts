import { DESCRIPCION_MAX, sumaDesglose } from '../domain/rules';
import type { DesgloseNutricional, EstimacionNutricional, OrigenImagen } from '../domain/types';

/*
 * Flujo de la pantalla "nuevo consumo" como reductor puro (ADR-008): toda decisión vive aquí y el
 * contenedor solo despacha eventos. Es total: un evento no válido para el estado, o de una
 * solicitud que ya no es la vigente (A7, M-11), devuelve el mismo estado sin lanzar.
 */

export type CampoBorrador =
  | 'descripcion'
  | 'calorias'
  | 'carbohidratos'
  | 'proteinas'
  | 'grasas'
  | 'otros';

/** Campos editables tal como los escribe el usuario; se convierten a números al guardar. */
export type Borrador = Record<CampoBorrador, string>;

export type AvisoRevision = 'desglose-no-suma-100' | 'datos-invalidos' | 'error-al-guardar';

export type EstadoFlujo =
  | { tipo: 'inicio' }
  | { tipo: 'procesando'; solicitudId: string; origen: OrigenImagen }
  | {
      tipo: 'revision';
      solicitudId: string;
      origen: OrigenImagen;
      borrador: Borrador;
      aviso?: AvisoRevision;
    }
  | { tipo: 'guardando'; solicitudId: string; origen: OrigenImagen; borrador: Borrador }
  | { tipo: 'guardado' }
  | { tipo: 'error' };

export type EventoFlujo =
  | { tipo: 'imagen-elegida'; origen: OrigenImagen; solicitudId: string }
  | { tipo: 'analisis-ok'; solicitudId: string; estimacion: EstimacionNutricional }
  | { tipo: 'analisis-fallo'; solicitudId: string }
  | { tipo: 'tiempo-agotado'; solicitudId: string }
  | { tipo: 'campo-editado'; campo: CampoBorrador; valor: string }
  | { tipo: 'guardar'; solicitudId: string }
  | { tipo: 'guardado-ok'; solicitudId: string }
  | { tipo: 'guardado-fallo'; solicitudId: string; motivo: 'datos-invalidos' | 'error' }
  | { tipo: 'sin-sesion' }
  | { tipo: 'cancelar' }
  | { tipo: 'reintentar' }
  | { tipo: 'registrar-otro' };

export const ESTADO_INICIAL: EstadoFlujo = { tipo: 'inicio' };

// `Record` sobre el tipo: agregar un campo a `CampoBorrador` sin listarlo aquí no compila.
const CAMPOS_BORRADOR: Record<CampoBorrador, true> = {
  descripcion: true,
  calorias: true,
  carbohidratos: true,
  proteinas: true,
  grasas: true,
  otros: true,
};

// Vacío → NaN (no 0): un campo borrado no debe pasar por un valor válido; el servidor lo rechaza.
function aNumero(valor: string): number {
  return valor.trim() === '' ? Number.NaN : Number(valor);
}

function desgloseDesdeBorrador(borrador: Borrador): DesgloseNutricional {
  return {
    carbohidratos: aNumero(borrador.carbohidratos),
    proteinas: aNumero(borrador.proteinas),
    grasas: aNumero(borrador.grasas),
    otros: aNumero(borrador.otros),
  };
}

function borradorDesdeEstimacion(estimacion: EstimacionNutricional): Borrador {
  const { desglose } = estimacion;
  return {
    descripcion: estimacion.descripcion,
    calorias: String(estimacion.calorias),
    carbohidratos: String(desglose.carbohidratos),
    proteinas: String(desglose.proteinas),
    grasas: String(desglose.grasas),
    otros: String(desglose.otros),
  };
}

// Se cuentan code points (como el servidor y `char_length` en la BD): cortar por unidades UTF-16
// podría partir un emoji y dejar un surrogate suelto.
function recortarDescripcion(valor: string): string {
  return Array.from(valor).slice(0, DESCRIPCION_MAX).join('');
}

function editarCampo(
  estado: EstadoFlujo,
  evento: Extract<EventoFlujo, { tipo: 'campo-editado' }>,
): EstadoFlujo {
  const { campo, valor } = evento;
  if (
    estado.tipo !== 'revision' ||
    !Object.hasOwn(CAMPOS_BORRADOR, campo) ||
    typeof valor !== 'string'
  ) {
    return estado;
  }
  const nuevoValor = campo === 'descripcion' ? recortarDescripcion(valor) : valor;
  // Editar borra el aviso: si el cambio no lo resuelve, el próximo `guardar` lo vuelve a mostrar.
  const { solicitudId, origen, borrador } = estado;
  return { tipo: 'revision', solicitudId, origen, borrador: { ...borrador, [campo]: nuevoValor } };
}

function pedirGuardado(estado: EstadoFlujo, solicitudId: string): EstadoFlujo {
  if (estado.tipo !== 'revision' || estado.solicitudId !== solicitudId) {
    return estado;
  }
  if (sumaDesglose(desgloseDesdeBorrador(estado.borrador)) !== 100) {
    return { ...estado, aviso: 'desglose-no-suma-100' };
  }
  const { origen, borrador } = estado;
  return { tipo: 'guardando', solicitudId, origen, borrador };
}

export function reducirFlujo(estado: EstadoFlujo, evento: EventoFlujo): EstadoFlujo {
  switch (evento.tipo) {
    case 'imagen-elegida':
      return estado.tipo === 'inicio'
        ? { tipo: 'procesando', solicitudId: evento.solicitudId, origen: evento.origen }
        : estado;
    case 'analisis-ok':
      return estado.tipo === 'procesando' && estado.solicitudId === evento.solicitudId
        ? {
            tipo: 'revision',
            solicitudId: estado.solicitudId,
            origen: estado.origen,
            borrador: borradorDesdeEstimacion(evento.estimacion),
          }
        : estado;
    case 'analisis-fallo':
    case 'tiempo-agotado':
      return estado.tipo === 'procesando' && estado.solicitudId === evento.solicitudId
        ? { tipo: 'error' }
        : estado;
    case 'campo-editado':
      return editarCampo(estado, evento);
    case 'guardar':
      return pedirGuardado(estado, evento.solicitudId);
    case 'guardado-ok':
      return estado.tipo === 'guardando' && estado.solicitudId === evento.solicitudId
        ? { tipo: 'guardado' }
        : estado;
    case 'guardado-fallo':
      return estado.tipo === 'guardando' && estado.solicitudId === evento.solicitudId
        ? {
            tipo: 'revision',
            solicitudId: estado.solicitudId,
            origen: estado.origen,
            borrador: estado.borrador,
            aviso: evento.motivo === 'datos-invalidos' ? 'datos-invalidos' : 'error-al-guardar',
          }
        : estado;
    case 'sin-sesion':
      return ESTADO_INICIAL;
    case 'cancelar':
      // En `guardando` el insert ya está en camino: "cancelar" mentiría. En `guardado` no hay nada
      // que cancelar.
      return estado.tipo === 'guardando' || estado.tipo === 'guardado' ? estado : ESTADO_INICIAL;
    case 'reintentar':
      return estado.tipo === 'error' ? ESTADO_INICIAL : estado;
    case 'registrar-otro':
      return estado.tipo === 'guardado' ? ESTADO_INICIAL : estado;
    default:
      // `satisfies never`: un evento nuevo en `EventoFlujo` sin su `case` no compila. En tiempo de
      // ejecución, un evento desconocido devuelve el mismo estado (reductor total).
      evento satisfies never;
      return estado;
  }
}

/**
 * Convierte el borrador a la forma que espera la action de guardado. Devuelve `unknown` a
 * propósito: no se valida aquí, la validación real la hace el servidor.
 */
export function datosDesdeBorrador(
  borrador: Borrador,
  origen: OrigenImagen,
  solicitudId: string,
): unknown {
  return {
    descripcion: borrador.descripcion,
    calorias: aNumero(borrador.calorias),
    desglose: desgloseDesdeBorrador(borrador),
    origen,
    solicitudId,
  };
}
