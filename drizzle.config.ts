import { defineConfig } from 'drizzle-kit';
import { env } from './src/env';

// src/shared/db/schema.ts es creado por el Block 2 de este spec. Este archivo puede
// referenciarlo antes de que exista porque drizzle-kit sólo lo resuelve al ejecutarse.
export default defineConfig({
  schema: './src/shared/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.databaseUrl,
  },
});
