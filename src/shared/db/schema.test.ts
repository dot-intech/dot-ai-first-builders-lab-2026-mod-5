import { getTableConfig, type PgColumn } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { sesiones, usuarios } from './schema';

/**
 * Tests unitarios de la definición TypeScript del schema (sin base de datos). El test de
 * integración valida las constraints sobre la BD creada con la migración SQL; este valida que
 * `schema.ts` declare lo que el spec de FEAT-001a (Block 2, Data model) exige.
 */

function columnaDe(tabla: typeof usuarios | typeof sesiones, nombre: string): PgColumn {
  const columna = getTableConfig(tabla).columns.find((c) => c.name === nombre);
  if (!columna) {
    throw new Error(`La tabla no define la columna "${nombre}"`);
  }
  return columna;
}

describe('schema: usuarios', () => {
  const config = getTableConfig(usuarios);

  it('debe llamarse "usuarios"', () => {
    expect(config.name).toBe('usuarios');
  });

  it('debe definir id como uuid, clave primaria y con valor por defecto', () => {
    const id = columnaDe(usuarios, 'id');

    expect(id.getSQLType()).toBe('uuid');
    expect(id.primary).toBe(true);
    expect(id.hasDefault).toBe(true);
  });

  it('debe definir email como text, NOT NULL y UNIQUE', () => {
    const email = columnaDe(usuarios, 'email');

    expect(email.getSQLType()).toBe('text');
    expect(email.notNull).toBe(true);
    expect(email.isUnique).toBe(true);
  });

  it('debe definir created_at como timestamptz, NOT NULL y con valor por defecto', () => {
    const createdAt = columnaDe(usuarios, 'created_at');

    expect(createdAt.getSQLType()).toBe('timestamp with time zone');
    expect(createdAt.notNull).toBe(true);
    expect(createdAt.hasDefault).toBe(true);
  });
});

describe('schema: sesiones', () => {
  const config = getTableConfig(sesiones);

  it('debe llamarse "sesiones"', () => {
    expect(config.name).toBe('sesiones');
  });

  it('debe definir id como uuid, clave primaria y con valor por defecto', () => {
    const id = columnaDe(sesiones, 'id');

    expect(id.getSQLType()).toBe('uuid');
    expect(id.primary).toBe(true);
    expect(id.hasDefault).toBe(true);
  });

  it('debe definir usuario_id como uuid NOT NULL', () => {
    const usuarioId = columnaDe(sesiones, 'usuario_id');

    expect(usuarioId.getSQLType()).toBe('uuid');
    expect(usuarioId.notNull).toBe(true);
  });

  it('debe definir token_hash como text, NOT NULL y UNIQUE', () => {
    const tokenHash = columnaDe(sesiones, 'token_hash');

    expect(tokenHash.getSQLType()).toBe('text');
    expect(tokenHash.notNull).toBe(true);
    expect(tokenHash.isUnique).toBe(true);
  });

  it.each(['last_activity_at', 'created_at'])(
    'debe definir %s como timestamptz, NOT NULL y con valor por defecto',
    (nombre) => {
      const columna = columnaDe(sesiones, nombre);

      expect(columna.getSQLType()).toBe('timestamp with time zone');
      expect(columna.notNull).toBe(true);
      expect(columna.hasDefault).toBe(true);
    },
  );

  it('debe tener una FK de usuario_id hacia usuarios.id con borrado en cascada', () => {
    expect(config.foreignKeys).toHaveLength(1);
    const [fk] = config.foreignKeys;

    // reference() ejecuta el callback perezoso `() => usuarios.id`.
    const referencia = fk!.reference();

    expect(referencia.columns.map((c) => c.name)).toEqual(['usuario_id']);
    expect(referencia.foreignColumns).toEqual([columnaDe(usuarios, 'id')]);
    expect(getTableConfig(referencia.foreignTable).name).toBe('usuarios');
    expect(fk!.onDelete).toBe('cascade');
  });

  it('debe tener el índice sesiones_usuario_id_idx sobre usuario_id', () => {
    const indice = config.indexes.find((i) => i.config.name === 'sesiones_usuario_id_idx');

    expect(indice).toBeDefined();
    expect(indice!.config.unique).toBe(false);
    expect(indice!.config.columns.map((c) => ('name' in c ? c.name : undefined))).toEqual([
      'usuario_id',
    ]);
  });
});
