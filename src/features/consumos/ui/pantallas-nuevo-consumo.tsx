import Link from 'next/link';
import type { ChangeEvent } from 'react';
import { CALORIAS_MAX, DESCRIPCION_MAX } from '../domain/rules';
import type { OrigenImagen } from '../domain/types';
import type { AvisoRevision, Borrador, CampoBorrador } from './flujo-nuevo-consumo';
import estilos from './nuevo-consumo.module.css';

/*
 * Pantallas de "nuevo consumo" (ADR-008): componentes presentacionales puros, sin estado propio.
 * Reciben datos y callbacks por props y devuelven JSX; el contenedor (`nuevo-consumo.tsx`) decide
 * qué pantalla mostrar y qué hacen los callbacks. Ninguna muestra endpoint, payload, nombre de
 * modelo ni texto técnico de error (FR-10). Importan el mismo CSS Module que el contenedor (A-F1,
 * ronda 2 del Block 8) y aplican `.campo`/`.boton` explícitamente a sus propios controles, en vez
 * de que el contenedor los alcance por selector de etiqueta.
 */

const TEXTO_AVISO: Record<AvisoRevision, string> = {
  'desglose-no-suma-100': 'Los porcentajes deben sumar 100.',
  'datos-invalidos': 'Revisá los datos: hay valores que no son válidos.',
  'error-al-guardar': 'No pudimos guardar. Probá de nuevo.',
  'confirmar-revision': 'Confirmá que revisaste la descripción y las calorías.',
  'guardado-sin-respuesta': 'No recibimos respuesta al guardar. Podés reintentar.',
};

export type PantallaInicioProps = {
  onSeleccionarImagen: (archivo: File, origen: OrigenImagen) => void;
};

/** Selección de la foto: cámara o galería, más la salida del flujo sin guardar nada (AC-13). */
export function PantallaInicio({ onSeleccionarImagen }: PantallaInicioProps) {
  function manejarCambio(origen: OrigenImagen) {
    return (evento: ChangeEvent<HTMLInputElement>) => {
      const archivo = evento.target.files?.[0];
      if (archivo !== undefined) {
        onSeleccionarImagen(archivo, origen);
      }
    };
  }

  return (
    <main>
      <h1>Registrar consumo</h1>
      <p>
        <label>
          Tomar foto
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className={estilos.campo}
            onChange={manejarCambio('camara')}
          />
        </label>
      </p>
      <p>
        <label>
          Elegir de la galería
          <input
            type="file"
            accept="image/*"
            className={estilos.campo}
            onChange={manejarCambio('galeria')}
          />
        </label>
      </p>
      <p>
        <Link href="/" className={estilos.boton}>
          Cancelar
        </Link>
      </p>
    </main>
  );
}

export type PantallaProcesandoProps = {
  onCancelar: () => void;
};

/** Espera del análisis de la foto (AC-09), con salida al inicio sin perder el flujo (AC-13). */
export function PantallaProcesando({ onCancelar }: PantallaProcesandoProps) {
  return (
    <main>
      <p role="status">Analizando tu foto…</p>
      <button type="button" className={estilos.boton} onClick={onCancelar}>
        Cancelar
      </button>
    </main>
  );
}

export type PantallaRevisionProps = {
  borrador: Borrador;
  aviso?: AvisoRevision;
  onCampoEditado: (campo: CampoBorrador, valor: string) => void;
  onGuardar: () => void;
  onCancelar: () => void;
};

/** Formulario editable con el borrador (AC-06, AC-07, AC-08, AC-11) y el aviso vigente, si hay. */
export function PantallaRevision({
  borrador,
  aviso,
  onCampoEditado,
  onGuardar,
  onCancelar,
}: PantallaRevisionProps) {
  function manejarCambio(campo: CampoBorrador) {
    return (evento: ChangeEvent<HTMLInputElement>) => {
      onCampoEditado(campo, evento.target.value);
    };
  }

  return (
    <main>
      <p>Esta información es una estimación y puede ser inexacta.</p>
      {aviso !== undefined && <p role="alert">{TEXTO_AVISO[aviso]}</p>}
      <form>
        <p>
          <label>
            Descripción
            <input
              type="text"
              maxLength={DESCRIPCION_MAX}
              className={estilos.campo}
              value={borrador.descripcion}
              onChange={manejarCambio('descripcion')}
            />
          </label>
        </p>
        <p>
          <label>
            Calorías
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={CALORIAS_MAX}
              step="1"
              className={estilos.campo}
              value={borrador.calorias}
              onChange={manejarCambio('calorias')}
            />
          </label>
        </p>
        <p>
          <label>
            Carbohidratos
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step="1"
              className={estilos.campo}
              value={borrador.carbohidratos}
              onChange={manejarCambio('carbohidratos')}
            />
          </label>
        </p>
        <p>
          <label>
            Proteínas
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step="1"
              className={estilos.campo}
              value={borrador.proteinas}
              onChange={manejarCambio('proteinas')}
            />
          </label>
        </p>
        <p>
          <label>
            Grasas
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step="1"
              className={estilos.campo}
              value={borrador.grasas}
              onChange={manejarCambio('grasas')}
            />
          </label>
        </p>
        <p>
          <label>
            Otros Nutrientes
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step="1"
              className={estilos.campo}
              value={borrador.otros}
              onChange={manejarCambio('otros')}
            />
          </label>
        </p>
        <p>
          <button type="button" className={estilos.boton} onClick={onGuardar}>
            Guardar
          </button>{' '}
          <button type="button" className={estilos.boton} onClick={onCancelar}>
            Cancelar
          </button>
        </p>
      </form>
    </main>
  );
}

/** Guardado en curso (AC-02, AC-04): sin "Cancelar", el insert ya está en camino. */
export function PantallaGuardando() {
  return (
    <main>
      <p role="status">Guardando…</p>
    </main>
  );
}

export type PantallaErrorProps = {
  onReintentar: () => void;
  onCancelar: () => void;
};

/** Fin del flujo tras un fallo, sin detalle técnico (FR-15, AC-15). */
export function PantallaError({ onReintentar, onCancelar }: PantallaErrorProps) {
  return (
    <main>
      <p>No pudimos analizar la imagen. Probá de nuevo.</p>
      <button type="button" className={estilos.boton} onClick={onReintentar}>
        Reintentar
      </button>{' '}
      <button type="button" className={estilos.boton} onClick={onCancelar}>
        Cancelar
      </button>
    </main>
  );
}

export type PantallaGuardadoProps = {
  onRegistrarOtro: () => void;
};

/** Confirmación del guardado (AC-02). */
export function PantallaGuardado({ onRegistrarOtro }: PantallaGuardadoProps) {
  return (
    <main>
      <p>Consumo guardado</p>
      <button type="button" className={estilos.boton} onClick={onRegistrarOtro}>
        Registrar otro
      </button>
    </main>
  );
}
