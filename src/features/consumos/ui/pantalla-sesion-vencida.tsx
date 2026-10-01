import estilos from './nuevo-consumo.module.css';

export type PantallaSesionVencidaProps = {
  onIniciarSesion: () => void;
};

/** La sesión expiró durante el flujo: única salida, volver a iniciar sesión. */
export function PantallaSesionVencida({ onIniciarSesion }: PantallaSesionVencidaProps) {
  return (
    <main>
      <p role="alert">Tu sesión venció.</p>
      <button type="button" className={estilos.boton} onClick={onIniciarSesion}>
        Iniciar sesión
      </button>
    </main>
  );
}
