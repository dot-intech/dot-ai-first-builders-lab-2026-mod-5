import estilos from './nuevo-consumo.module.css';

export type PantallaBajaConfianzaProps = {
  onCargarOtraImagen: () => void;
  onRevisarDatos: () => void;
  onCancelar: () => void;
};

/** Aviso de estimación poco confiable, con las tres salidas posibles (ADR-008: sin estado propio). */
export function PantallaBajaConfianza({
  onCargarOtraImagen,
  onRevisarDatos,
  onCancelar,
}: PantallaBajaConfianzaProps) {
  return (
    <main>
      <p role="alert">
        La estimación de esta foto es poco confiable. Podés cargar otra imagen o revisar los datos a
        mano.
      </p>
      <button type="button" className={estilos.boton} onClick={onCargarOtraImagen}>
        Cargar otra imagen
      </button>{' '}
      <button type="button" className={estilos.boton} onClick={onRevisarDatos}>
        Revisar datos
      </button>{' '}
      <button type="button" className={estilos.boton} onClick={onCancelar}>
        Cancelar
      </button>
    </main>
  );
}
