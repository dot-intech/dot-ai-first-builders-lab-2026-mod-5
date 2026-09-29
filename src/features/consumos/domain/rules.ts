import { AnalisisImagenError, DatosConsumoInvalidosError } from './errors';
import type { DatosConsumo, DesgloseNutricional, OrigenImagen } from './types';

// Mismos valores que los CHECKs de la tabla `consumos`: la BD vuelve a imponerlos.
export const DESCRIPCION_MAX = 500;
export const CALORIAS_MAX = 10000;
// El cliente reencodea a < ~900 KB; el margen cubre variaciones del encoder sin aceptar archivos crudos.
export const IMAGEN_MAX_BYTES = 950_000;

// Orden fijo: define el desempate del reparto por mayor resto y el orden de lectura del desglose.
const CLAVES_DESGLOSE = ['carbohidratos', 'proteinas', 'grasas', 'otros'] as const;

// El escalado arrastra ruido de punto flotante (57.5 puede quedar en 57.49999999999999): sin esta
// tolerancia, restos que en aritmética exacta empatan dejan de empatar y se pierde el desempate por
// orden fijo. 1e-9 está muy por encima del ruido (~1e-14) y muy por debajo de la menor diferencia
// real entre restos de entradas razonables. Se usa también al truncar, para que 57.99999999999999
// cuente como 58.
const TOLERANCIA_ESCALADO = 1e-9;

// Si el truncado se empujó al entero siguiente, el resto queda apenas negativo (~-1e-11): se lleva a 0.
function restoRedondeado(escalado: number, entero: number): number {
  return Math.max(0, Math.round((escalado - entero) / TOLERANCIA_ESCALADO) * TOLERANCIA_ESCALADO);
}

const ORIGENES: readonly string[] = ['camara', 'galeria', 'manual'] satisfies OrigenImagen[];

export function esJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Lanza `AnalisisImagenError('imagen-invalida')` si la imagen está vacía, excede el tope o no es JPEG. */
export function validarImagen(bytes: Uint8Array): void {
  if (bytes.length === 0 || bytes.length > IMAGEN_MAX_BYTES || !esJpeg(bytes)) {
    throw new AnalisisImagenError('imagen-invalida');
  }
}

export function sumaDesglose(d: DesgloseNutricional): number {
  return d.carbohidratos + d.proteinas + d.grasas + d.otros;
}

/**
 * Lleva los porcentajes crudos del modelo a enteros que suman exactamente 100, repartiendo los
 * puntos que faltan tras truncar por mayor resto (empates en el orden de `CLAVES_DESGLOSE`).
 * Un consumo de 0 kcal sin macronutrientes (agua, café solo) va entero a `otros`, para cumplir la
 * suma 100 de FR-08 y el CHECK de la BD.
 */
export function normalizarDesglose(
  crudo: DesgloseNutricional,
  calorias: number,
): DesgloseNutricional {
  const valores = CLAVES_DESGLOSE.map((clave) => crudo[clave]);
  if (valores.some((valor) => !Number.isFinite(valor) || valor < 0)) {
    throw new AnalisisImagenError('respuesta-invalida');
  }

  const suma = sumaDesglose(crudo);
  if (suma === 0 && calorias === 0) {
    return { carbohidratos: 0, proteinas: 0, grasas: 0, otros: 100 };
  }
  // `!(suma > 0)` cubre suma 0 con calorías distintas de 0; `isFinite`, una suma que desborda.
  if (!(suma > 0) || !Number.isFinite(suma)) {
    throw new AnalisisImagenError('respuesta-invalida');
  }

  // Dividir antes de multiplicar: `valor <= suma`, así que no desborda con valores enormes.
  const escalados = valores.map((valor) => (valor / suma) * 100);
  const enteros = escalados.map((valor) => Math.floor(valor + TOLERANCIA_ESCALADO));
  const faltantes = 100 - enteros.reduce((total, valor) => total + valor, 0);
  const porMayorResto = escalados
    .map((valor, indice) => ({ indice, resto: restoRedondeado(valor, enteros[indice] as number) }))
    // `sort` es estable: a igual resto se conserva el orden fijo.
    .sort((a, b) => b.resto - a.resto);
  for (const { indice } of porMayorResto.slice(0, faltantes)) {
    enteros[indice] = (enteros[indice] as number) + 1;
  }

  const [carbohidratos, proteinas, grasas, otros] = enteros as [number, number, number, number];
  return { carbohidratos, proteinas, grasas, otros };
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esEnteroEnRango(valor: unknown, min: number, max: number): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= min && valor <= max;
}

const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Acepta solo un UUID (mayúsculas o minúsculas) y lo devuelve en minúsculas. */
export function validarSolicitudId(valor: unknown): string {
  if (typeof valor !== 'string' || !FORMA_UUID.test(valor)) {
    throw new DatosConsumoInvalidosError('solicitudId');
  }
  return valor.toLowerCase();
}

function validarDescripcion(valor: unknown): string {
  if (typeof valor !== 'string') {
    throw new DatosConsumoInvalidosError('descripcion');
  }
  const descripcion = valor.trim();
  // Se cuentan code points (como `char_length` en la BD), no unidades UTF-16.
  const largo = Array.from(descripcion).length;
  if (largo < 1 || largo > DESCRIPCION_MAX) {
    throw new DatosConsumoInvalidosError('descripcion');
  }
  return descripcion;
}

function validarDesglose(valor: unknown): DesgloseNutricional {
  if (!esObjeto(valor)) {
    throw new DatosConsumoInvalidosError('desglose');
  }
  const { carbohidratos, proteinas, grasas, otros } = valor;
  const porcentajes = [carbohidratos, proteinas, grasas, otros];
  if (!porcentajes.every((porcentaje) => esEnteroEnRango(porcentaje, 0, 100))) {
    throw new DatosConsumoInvalidosError('desglose');
  }
  const desglose = { carbohidratos, proteinas, grasas, otros } as DesgloseNutricional;
  // Sin normalizar: un desglose editado a mano que no suma 100 se rechaza, no se corrige.
  if (sumaDesglose(desglose) !== 100) {
    throw new DatosConsumoInvalidosError('desglose');
  }
  return desglose;
}

/**
 * Valida los datos que llegan del cliente para guardar un consumo y devuelve un objeto nuevo solo
 * con los campos conocidos: cualquier otro (p. ej. `usuarioId`) se descarta (M-3).
 */
export function validarDatosConsumo(entrada: unknown): DatosConsumo {
  if (!esObjeto(entrada)) {
    throw new DatosConsumoInvalidosError('forma');
  }
  const descripcion = validarDescripcion(entrada.descripcion);
  if (!esEnteroEnRango(entrada.calorias, 0, CALORIAS_MAX)) {
    throw new DatosConsumoInvalidosError('calorias');
  }
  const desglose = validarDesglose(entrada.desglose);
  const origen = entrada.origen;
  if (typeof origen !== 'string' || !ORIGENES.includes(origen)) {
    throw new DatosConsumoInvalidosError('origen');
  }
  const solicitudId = validarSolicitudId(entrada.solicitudId);
  return {
    descripcion,
    calorias: entrada.calorias,
    desglose,
    origen: origen as OrigenImagen,
    solicitudId,
  };
}
