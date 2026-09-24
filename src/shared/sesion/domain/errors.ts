/** La sesión existe pero superó la ventana de inactividad. */
export class SessionExpiredError extends Error {
  constructor(options?: ErrorOptions) {
    super('La sesión expiró por inactividad', options);
    this.name = 'SessionExpiredError';
  }
}

/** No existe una sesión válida para el token recibido. */
export class SessionNotFoundError extends Error {
  constructor(options?: ErrorOptions) {
    super('Sesión no encontrada', options);
    this.name = 'SessionNotFoundError';
  }
}
