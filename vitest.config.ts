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
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
      },
    },
  },
});
