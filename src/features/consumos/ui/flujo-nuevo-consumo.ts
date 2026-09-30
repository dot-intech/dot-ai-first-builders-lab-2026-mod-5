import { DESCRIPCION_MAX, esBajaConfianza, sumaDesglose } from '../domain/rules';
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

export type AvisoRevision =
  | 'desglose-no-suma-100'
  | 'datos-invalidos'
  | 'error-al-guardar'
  | 'confirmar-revision'
  | 'guardado-sin-respuesta';

/** Origen de una foto elegida: la carga manual no tiene imagen, así que no entra en la selección. */
export type OrigenFoto = Exclude<OrigenImagen, 'manual'>;

export type EstadoFlujo =
  | { tipo: 'inicio' }
  | { tipo: 'procesando'; solicitudId: string; origen: OrigenFoto }
  | { tipo: 'baja-confianza'; solicitudId: string; origen: OrigenFoto; borrador: Borrador }
  | {
      tipo: 'revision';
      solicitudId: string;
      origen: OrigenImagen;
      borrador: Borrador;
      requiereConfirmacion: boolean;
      confirmado: boolean;
      aviso?: AvisoRevision;
    }
  | {
      tipo: 'guardando';
      solicitudId: string;
      origen: OrigenImagen;
      borrador: Borrador;
      requiereConfirmacion: boolean;
    }
  | { tipo: 'guardado' }
  | { tipo: 'sesion-vencida' }
  | { tipo: 'error' };

export type EventoFlujo =
  | { tipo: 'imagen-elegida'; origen: OrigenFoto; solicitudId: string }
  | { tipo: 'analisis-ok'; solicitudId: string; estimacion: EstimacionNutricional }
  | { tipo: 'analisis-fallo'; solicitudId: string }
  | { tipo: 'tiempo-agotado'; solicitudId: string }
  | { tipo: 'campo-editado'; campo: CampoBorrador; valor: string }
  | { tipo: 'guardar'; solicitudId: string }
  | { tipo: 'guardado-ok'; solicitudId: string }
  | { tipo: 'guardado-fallo'; solicitudId: string; motivo: 'datos-invalidos' | 'error' }
  | { tipo: 'guardado-tiempo-agotado'; solicitudId: string }
  | { tipo: 'sin-sesion'; solicitudId: string }
  | { tipo: 'carga-manual'; solicitudId: string }
  | { tipo: 'continuar-a-revision' }
  | { tipo: 'cargar-otra-imagen' }
  | { tipo: 'confirmar-revision'; confirmado: boolean }
  | { tipo: 'cancelar' }
  | { tipo: 'reintentar' }
  | { tipo: 'registrar-otro' };

export const ESTADO_INICIAL: EstadoFlujo = { tipo: 'inicio' };

// `Record` sobre el tipo: agregar un campo a `CampoBorrador` sin listarlo aquí no compila.
const BORRADOR_VACIO: Borrador = {
  descripcion: '',
  calorias: '',
  carbohidratos: '',
  proteinas: '',
  grasas: '',
  otros: '',
};

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
  const { solicitudId, origen, borrador, requiereConfirmacion, confirmado } = estado;
  return {
    tipo: 'revision',
    solicitudId,
    origen,
    borrador: { ...borrador, [campo]: nuevoValor },
    requiereConfirmacion,
    confirmado,
  };
}

function confirmarRevision(estado: EstadoFlujo, confirmado: boolean): EstadoFlujo {
  if (
    estado.tipo !== 'revision' ||
    !estado.requiereConfirmacion ||
    typeof confirmado !== 'boolean'
  ) {
    return estado;
  }
  const { solicitudId, origen, borrador, requiereConfirmacion } = estado;
  return { tipo: 'revision', solicitudId, origen, borrador, requiereConfirmacion, confirmado };
}

function alAnalizar(
  estado: EstadoFlujo,
  evento: Extract<EventoFlujo, { tipo: 'analisis-ok' }>,
): EstadoFlujo {
  if (estado.tipo !== 'procesando' || estado.solicitudId !== evento.solicitudId) {
    return estado;
  }
  const { solicitudId, origen } = estado;
  const borrador = borradorDesdeEstimacion(evento.estimacion);
  return esBajaConfianza(evento.estimacion.confianza)
    ? { tipo: 'baja-confianza', solicitudId, origen, borrador }
    : {
        tipo: 'revision',
        solicitudId,
        origen,
        borrador,
        requiereConfirmacion: false,
        confirmado: false,
      };
}

function alAgotarseElGuardado(estado: EstadoFlujo, solicitudId: string): EstadoFlujo {
  if (estado.tipo !== 'guardando' || estado.solicitudId !== solicitudId) {
    return estado;
  }
  return volverARevision(estado, 'guardado-sin-respuesta');
}

function volverARevision(
  estado: Extract<EstadoFlujo, { tipo: 'guardando' }>,
  aviso: AvisoRevision,
): EstadoFlujo {
  const { solicitudId, origen, borrador, requiereConfirmacion } = estado;
  // Si llegó a `guardando`, la casilla ya estaba marcada (o no se exigía).
  return {
    tipo: 'revision',
    solicitudId,
    origen,
    borrador,
    requiereConfirmacion,
    confirmado: requiereConfirmacion,
    aviso,
  };
}

function pedirGuardado(estado: EstadoFlujo, solicitudId: string): EstadoFlujo {
  if (estado.tipo !== 'revision' || estado.solicitudId !== solicitudId) {
    return estado;
  }
  if (estado.requiereConfirmacion && !estado.confirmado) {
    return { ...estado, aviso: 'confirmar-revision' };
  }
  if (sumaDesglose(desgloseDesdeBorrador(estado.borrador)) !== 100) {
    return { ...estado, aviso: 'desglose-no-suma-100' };
  }
  const { origen, borrador, requiereConfirmacion } = estado;
  return { tipo: 'guardando', solicitudId, origen, borrador, requiereConfirmacion };
}

export function reducirFlujo(estado: EstadoFlujo, evento: EventoFlujo): EstadoFlujo {
  switch (evento.tipo) {
    case 'imagen-elegida':
      return estado.tipo === 'inicio'
        ? { tipo: 'procesando', solicitudId: evento.solicitudId, origen: evento.origen }
        : estado;
    case 'analisis-ok':
      return alAnalizar(estado, evento);
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
        ? volverARevision(
            estado,
            evento.motivo === 'datos-invalidos' ? 'datos-invalidos' : 'error-al-guardar',
          )
        : estado;
    case 'guardado-tiempo-agotado':
      return alAgotarseElGuardado(estado, evento.solicitudId);
    case 'sin-sesion':
      return (estado.tipo === 'procesando' || estado.tipo === 'guardando') &&
        estado.solicitudId === evento.solicitudId
        ? { tipo: 'sesion-vencida' }
        : estado;
    case 'carga-manual':
      return estado.tipo === 'error'
        ? {
            tipo: 'revision',
            solicitudId: evento.solicitudId,
            origen: 'manual',
            borrador: BORRADOR_VACIO,
            requiereConfirmacion: false,
            confirmado: false,
          }
        : estado;
    case 'continuar-a-revision':
      return estado.tipo === 'baja-confianza'
        ? {
            tipo: 'revision',
            solicitudId: estado.solicitudId,
            origen: estado.origen,
            borrador: estado.borrador,
            requiereConfirmacion: true,
            confirmado: false,
          }
        : estado;
    case 'cargar-otra-imagen':
      return estado.tipo === 'baja-confianza' ? ESTADO_INICIAL : estado;
    case 'confirmar-revision':
      return confirmarRevision(estado, evento.confirmado);
    case 'cancelar':
      // En `guardando` el insert ya está en camino: "cancelar" mentiría. En `guardado` no hay nada
      // que cancelar.
      return estado.tipo === 'guardando' ||
        estado.tipo === 'guardado' ||
        estado.tipo === 'sesion-vencida'
        ? estado
        : ESTADO_INICIAL;
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
