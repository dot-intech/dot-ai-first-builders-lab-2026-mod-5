'use client';

import { useFormStatus } from 'react-dom';

export function QaLoginButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Ingresando…' : 'Ingresar como QA'}
    </button>
  );
}
