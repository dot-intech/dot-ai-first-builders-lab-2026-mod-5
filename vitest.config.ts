import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig usa `jsx: preserve` (lo compila Next): vitest necesita el runtime automático para los .tsx.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.integration.test.{ts,tsx}',
        // Solo declara tipos: no tiene código ejecutable que medir.
        'src/features/**/domain/types.ts',
        // Solo declara tipos: no tiene código ejecutable que medir.
        'src/shared/**/domain/types.ts',
        // Contenedor cliente: solo cablea eventos del navegador, timers y actions al reductor (ADR-008).
        'src/features/consumos/ui/nuevo-consumo.tsx',
        // API de canvas, que no existe en `node`; la lógica pura está en `reducir-imagen.ts` (ADR-008).
        'src/features/consumos/ui/canvas-imagen.ts',
        // Solo declara tipos de los CSS Modules: no tiene código ejecutable que medir (ADR-008).
        'src/css-modules.d.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
      },
    },
  },
});
