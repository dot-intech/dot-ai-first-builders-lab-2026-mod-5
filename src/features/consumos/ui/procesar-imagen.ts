import type { OrigenImagen } from '../domain/types';
import { datosDesdeBorrador, type Borrador, type EventoFlujo } from './flujo-nuevo-consumo';
// Solo tipos: un import de valor arrastraría el service (y el SDK) al bundle del cliente.
import type { ResultadoAnalisis, ResultadoGuardado } from './operaciones-consumo';

/*
 * Traducen los resultados de las actions a eventos del flujo. Las actions y el reencodeo llegan
 * inyectados (el contenedor pasa `reencodearComoJpeg` y las server actions). Nunca lanzan: cualquier
 * fallo termina en un evento que el reductor sabe manejar (A8).
 */

export type DependenciasImagen = {
  reencodear: (archivo: Blob) => Promise<Blob>;
  analizar: (formData: FormData) => Promise<ResultadoAnalisis>;
};

export type DependenciasGuardado = {
  guardar: (datos: unknown) => Promise<ResultadoGuardado>;
};

// La action es la frontera con el servidor: se verifica la forma antes de leer `tipo`, en vez de
// depender de un TypeError implícito.
function esObjeto(valor: unknown): valor is object {
  return typeof valor === 'object' && valor !== null;
}

function eventoDeAnalisis(resultado: ResultadoAnalisis, solicitudId: string): EventoFlujo {
  const fallo: EventoFlujo = { tipo: 'analisis-fallo', solicitudId };
  if (!esObjeto(resultado)) {
    return fallo;
  }
  switch (resultado.tipo) {
    case 'estimacion':
      return { tipo: 'analisis-ok', solicitudId, estimacion: resultado.estimacion };
    case 'sin-sesion':
      return { tipo: 'sin-sesion' };
    case 'error':
      return fallo;
    default:
      // Una variante nueva de `ResultadoAnalisis` sin su `case` no compila; un `tipo` desconocido
      // en tiempo de ejecución termina en fallo.
      resultado satisfies never;
      return fallo;
  }
}

function eventoDeGuardado(resultado: ResultadoGuardado, solicitudId: string): EventoFlujo {
  const fallo: EventoFlujo = { tipo: 'guardado-fallo', solicitudId, motivo: 'error' };
  if (!esObjeto(resultado)) {
    return fallo;
  }
  switch (resultado.tipo) {
    case 'guardado':
      return { tipo: 'guardado-ok', solicitudId };
    case 'datos-invalidos':
      return { tipo: 'guardado-fallo', solicitudId, motivo: 'datos-invalidos' };
    case 'sin-sesion':
      return { tipo: 'sin-sesion' };
    case 'error':
      return fallo;
    default:
      // Igual que en el análisis: exhaustivo en compilación, fallo en tiempo de ejecución.
      resultado satisfies never;
      return fallo;
  }
}

export async function procesarImagen(
  { archivo, solicitudId }: { archivo: Blob; solicitudId: string },
  { reencodear, analizar }: DependenciasImagen,
): Promise<EventoFlujo> {
  try {
    const formData = new FormData();
    formData.append('imagen', await reencodear(archivo));
    return eventoDeAnalisis(await analizar(formData), solicitudId);
  } catch {
    // No es un catch silencioso: imagen ilegible o demasiado grande (`ImagenNoProcesableError`),
    // cuerpo > 1 MB o red caída se traducen en `analisis-fallo`,
    // que la UI muestra como error (FR-15). El detalle no se muestra ni se registra (FR-10).
    return { tipo: 'analisis-fallo', solicitudId };
  }
}

export async function procesarGuardado(
  {
    borrador,
    origen,
    solicitudId,
  }: { borrador: Borrador; origen: OrigenImagen; solicitudId: string },
  { guardar }: DependenciasGuardado,
): Promise<EventoFlujo> {
  try {
    const datos = datosDesdeBorrador(borrador, origen, solicitudId);
    return eventoDeGuardado(await guardar(datos), solicitudId);
  } catch {
    // Igual que arriba: un rechazo (red) vuelve a la revisión con el
    // aviso "error al guardar", sin perder el borrador.
    return { tipo: 'guardado-fallo', solicitudId, motivo: 'error' };
  }
}
