// Tipa los imports de CSS Modules (ADR-008): sin esto `tsc` no resuelve `*.module.css` porque
// `next-env.d.ts` está en `.gitignore`. Solo declara tipos: no tiene código ejecutable que medir.
declare module '*.module.css' {
  const clases: { readonly [clase: string]: string };
  export default clases;
}
