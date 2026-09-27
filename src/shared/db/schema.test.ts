import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTableConfig, type PgColumn } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { consumos, sesiones, usuarios } from './schema';

/**
 * Tests unitarios de la definición TypeScript del schema (sin base de datos). El test de
 * integración valida las constraints sobre la BD creada con las migraciones SQL; este valida que
 * `schema.ts` declare lo que exigen los specs de FEAT-001a (Block 2, Data model: `usuarios` y
 * `sesiones`) y FEAT-001b (Block 2, Data model: `consumos`), y que la migración 0001 sea aditiva.
 */

const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function columnaDe(
  tabla: typeof usuarios | typeof sesiones | typeof consumos,
  nombre: string,
): PgColumn {
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

describe('schema: consumos', () => {
  const config = getTableConfig(consumos);

  it('debe llamarse "consumos"', () => {
    expect(config.name).toBe('consumos');
  });

  it('debe definir id como uuid, clave primaria y con valor por defecto', () => {
    const id = columnaDe(consumos, 'id');

    expect(id.getSQLType()).toBe('uuid');
    expect(id.primary).toBe(true);
    expect(id.hasDefault).toBe(true);
  });

  it('debe definir usuario_id como uuid NOT NULL', () => {
    const usuarioId = columnaDe(consumos, 'usuario_id');

    expect(usuarioId.getSQLType()).toBe('uuid');
    expect(usuarioId.notNull).toBe(true);
  });

  it.each([
    ['descripcion', 'text'],
    ['calorias', 'integer'],
    ['pct_carbohidratos', 'smallint'],
    ['pct_proteinas', 'smallint'],
    ['pct_grasas', 'smallint'],
    ['pct_otros', 'smallint'],
    ['origen', 'text'],
  ])('debe definir %s como %s NOT NULL, sin default ni UNIQUE', (nombre, tipo) => {
    const columna = columnaDe(consumos, nombre);

    expect(columna.getSQLType()).toBe(tipo);
    expect(columna.notNull).toBe(true);
    expect(columna.hasDefault).toBe(false);
    expect(columna.isUnique).toBe(false);
  });

  it('debe definir created_at como timestamptz, NOT NULL y con valor por defecto', () => {
    const createdAt = columnaDe(consumos, 'created_at');

    expect(createdAt.getSQLType()).toBe('timestamp with time zone');
    expect(createdAt.notNull).toBe(true);
    expect(createdAt.hasDefault).toBe(true);
  });

  it('debe definir exactamente las columnas del data model', () => {
    expect(config.columns.map((c) => c.name).sort()).toEqual(
      [
        'id',
        'usuario_id',
        'descripcion',
        'calorias',
        'pct_carbohidratos',
        'pct_proteinas',
        'pct_grasas',
        'pct_otros',
        'origen',
        'created_at',
      ].sort(),
    );
  });

  it('debe tener una FK de usuario_id hacia usuarios.id con borrado en cascada', () => {
    expect(config.foreignKeys).toHaveLength(1);
    const [fk] = config.foreignKeys;

    const referencia = fk!.reference();

    expect(referencia.columns.map((c) => c.name)).toEqual(['usuario_id']);
    expect(referencia.foreignColumns).toEqual([columnaDe(usuarios, 'id')]);
    expect(getTableConfig(referencia.foreignTable).name).toBe('usuarios');
    expect(fk!.onDelete).toBe('cascade');
  });

  it('debe tener el índice consumos_usuario_id_idx sobre usuario_id', () => {
    const indice = config.indexes.find((i) => i.config.name === 'consumos_usuario_id_idx');

    expect(indice).toBeDefined();
    expect(indice!.config.unique).toBe(false);
    expect(indice!.config.columns.map((c) => ('name' in c ? c.name : undefined))).toEqual([
      'usuario_id',
    ]);
  });

  it('debe declarar los CHECKs con los nombres del spec', () => {
    expect(config.checks.map((c) => c.name).sort()).toEqual(
      [
        'consumos_descripcion_check',
        'consumos_calorias_check',
        'consumos_pct_carbohidratos_check',
        'consumos_pct_proteinas_check',
        'consumos_pct_grasas_check',
        'consumos_pct_otros_check',
        'consumos_origen_check',
        'consumos_desglose_suma_check',
      ].sort(),
    );
  });

  it('no debe declarar constraints UNIQUE', () => {
    expect(config.uniqueConstraints).toHaveLength(0);
  });
});

describe('migración 0001_consumos.sql', () => {
  // M-12 (threat model FEAT-001b): la migración debe ser aditiva.
  const leerSql = (): string =>
    readFileSync(join(RAIZ_REPO, 'drizzle', 'migrations', '0001_consumos.sql'), 'utf8');

  it('debe crear la tabla consumos', () => {
    expect(leerSql()).toMatch(/CREATE TABLE[^;]*"consumos"/i);
  });

  it('no debe contener sentencias DROP', () => {
    expect(leerSql()).not.toMatch(/\bDROP\b/i);
  });

  it('no debe contener ALTER ... TYPE', () => {
    expect(leerSql()).not.toMatch(/\bALTER\b[^;]*\bTYPE\b/i);
  });
});
