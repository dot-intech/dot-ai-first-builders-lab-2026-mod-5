import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Guardián de las reglas de dependencias de la ADR-007 que se pueden automatizar (FR-09, FR-10,
 * threat model mitigación 3). Compara rutas resueltas, no texto: por eso los especificadores de
 * ejemplo de este archivo se arman con `${...}` y el parser no los resuelve al escanearse a sí mismo.
 */

type ArchivoFuente = { ruta: string; contenido: string };

const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = 'src';
const SHARED = 'src/shared';
const FEATURES = 'src/features';
const QA_ACCESS = 'src/features/qa-access';
const MODULOS_DE_SESION_PROHIBIDOS_EN_QA_ACCESS = [
  `${QA_ACCESS}/domain/session-service.ts`,
  `${QA_ACCESS}/domain/types.ts`,
  `${QA_ACCESS}/ui/cookie-sesion.ts`,
  `${QA_ACCESS}/data`,
];

// --- Funciones puras del guardián ---

// La cláusula de `import`/`export … from` no lleva comillas ni `;`: `[^'";]*?` cruza los saltos de
// línea de un import de varias líneas sin saltar a la sentencia siguiente.
// Límite conocido: un apóstrofo o comilla dentro de un comentario en la cláusula
// (`import {\n a, // don't\n} from '…'`) corta la coincidencia y oculta ese especificador.
const PATRONES_DE_ESPECIFICADOR = [
  /\b(?:import|export)\s[^'";]*?\bfrom\s*(['"])([^'"\n]+)\1/g,
  /\bimport\s*(['"])([^'"\n]+)\1/g,
  /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*[,)]/g,
  // Template literal sin interpolación: se trata como un string normal; con `${` no se resuelve.
  /\bimport\s*\(\s*(`)((?:(?!\$\{)[^`\n])+)\1\s*[,)]/g,
  /\bvi\.(?:mock|doMock|unmock|doUnmock|importActual|importMock)\s*(?:<[^\n]*?>)?\s*\(\s*(['"])([^'"\n]+)\1/g,
];

function extraerEspecificadores(contenido: string): string[] {
  const encontrados: { indice: number; especificador: string }[] = [];
  for (const patron of PATRONES_DE_ESPECIFICADOR) {
    for (const coincidencia of contenido.matchAll(patron)) {
      const especificador = coincidencia[2];
      if (especificador !== undefined) {
        encontrados.push({ indice: coincidencia.index, especificador });
      }
    }
  }
  return encontrados.sort((a, b) => a.indice - b.indice).map(({ especificador }) => especificador);
}

/** Ruta dentro del repo (con `/`) a la que apunta el especificador, o `null` si es un paquete externo. */
function resolverEspecificador(rutaArchivo: string, especificador: string): string | null {
  if (especificador.startsWith('./') || especificador.startsWith('../')) {
    return path.posix.join(path.posix.dirname(rutaArchivo), especificador);
  }
  if (especificador.startsWith('@/')) {
    return path.posix.join(SRC, especificador.slice(2));
  }
  return null;
}

const COMENTARIOS_Y_ESPACIOS_INICIALES = /^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/;
const DIRECTIVA_INICIAL = /^(['"])([^'"\n]*)\1\s*;?/;

/** Recorre el prólogo de directivas (`'use strict'; 'use server'; …`) saltando comentarios. */
function tieneDirectivaUseServer(contenido: string): boolean {
  let resto = contenido;
  for (;;) {
    resto = resto.replace(COMENTARIOS_Y_ESPACIOS_INICIALES, '');
    const directiva = DIRECTIVA_INICIAL.exec(resto);
    if (directiva === null) {
      return false;
    }
    if (directiva[2] === 'use server') {
      return true;
    }
    resto = resto.slice(directiva[0].length);
  }
}

function estaDentroDe(ruta: string, carpeta: string): boolean {
  return ruta === carpeta || ruta.startsWith(`${carpeta}/`);
}

/** Nombre de la feature (`src/features/<nombre>/…`) o `null` si la ruta no está dentro de una. */
function featureDe(ruta: string): string | null {
  if (!ruta.startsWith(`${FEATURES}/`)) {
    return null;
  }
  const nombre = ruta.slice(FEATURES.length + 1).split('/')[0];
  return nombre === undefined || nombre === '' ? null : nombre;
}

function importsQueIncumplen(
  archivos: ArchivoFuente[],
  incumple: (rutaArchivo: string, rutaResuelta: string) => boolean,
): string[] {
  return archivos.flatMap(({ ruta, contenido }) =>
    extraerEspecificadores(contenido)
      .filter((especificador) => {
        const resuelta = resolverEspecificador(ruta, especificador);
        return resuelta !== null && incumple(ruta, resuelta);
      })
      .map((especificador) => `${ruta} → '${especificador}'`),
  );
}

function violacionesSharedImportaFeatures(archivos: ArchivoFuente[]): string[] {
  return importsQueIncumplen(
    archivos,
    (rutaArchivo, rutaResuelta) =>
      estaDentroDe(rutaArchivo, SHARED) && estaDentroDe(rutaResuelta, FEATURES),
  );
}

function violacionesFeatureImportaOtraFeature(archivos: ArchivoFuente[]): string[] {
  return importsQueIncumplen(archivos, (rutaArchivo, rutaResuelta) => {
    const origen = featureDe(rutaArchivo);
    const destino = featureDe(rutaResuelta);
    return origen !== null && destino !== null && origen !== destino;
  });
}

function violacionesUseServerEnShared(archivos: ArchivoFuente[]): string[] {
  return archivos
    .filter(
      ({ ruta, contenido }) => estaDentroDe(ruta, SHARED) && tieneDirectivaUseServer(contenido),
    )
    .map(({ ruta }) => `${ruta} → 'use server'`);
}

function modulosDeSesionEnQaAccess(rutasExistentes: string[]): string[] {
  return MODULOS_DE_SESION_PROHIBIDOS_EN_QA_ACCESS.filter((prohibida) =>
    rutasExistentes.includes(prohibida),
  );
}

// --- Lectura del disco (el test de tsconfig también lee un archivo, dentro de su `it`) ---

/** Devuelve todas las rutas (archivos y carpetas) bajo `dir`, relativas a la raíz y con `/`. */
function listarRutas(dir: string): string[] {
  const rutas: string[] = [];
  const entradas = readdirSync(path.join(RAIZ_REPO, dir), { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entrada of entradas) {
    const ruta = path.posix.join(dir, entrada.name);
    rutas.push(ruta);
    if (entrada.isDirectory()) {
      rutas.push(...listarRutas(ruta));
    }
  }
  return rutas;
}

function leerArchivosFuente(rutas: string[]): ArchivoFuente[] {
  return rutas
    .filter((ruta) => /\.tsx?$/.test(ruta))
    .map((ruta) => ({ ruta, contenido: readFileSync(path.join(RAIZ_REPO, ruta), 'utf8') }));
}

// Armados por partes para que el escaneo de este mismo archivo no los resuelva a `src/features/`.
const ALIAS = '@/';
const CARPETA_FEATURES = 'features';

describe('extraerEspecificadores', () => {
  it('debe detectar el especificador de `import … from`', () => {
    expect(extraerEspecificadores(`import { a, type B } from './modulo';`)).toEqual(['./modulo']);
  });

  it('debe detectar un `import … from` de varias líneas y con comillas dobles', () => {
    const contenido = `import {\n  uno,\n  dos,\n} from "../otro/modulo";\n`;

    expect(extraerEspecificadores(contenido)).toEqual(['../otro/modulo']);
  });

  it('debe detectar `import type … from` e `import * as … from`', () => {
    const contenido = `import type { T } from './tipos';\nimport * as todo from './todo';\n`;

    expect(extraerEspecificadores(contenido)).toEqual(['./tipos', './todo']);
  });

  it("debe detectar el import de efecto lateral `import '…'`", () => {
    expect(extraerEspecificadores(`import './estilos.css';\nimport "server-only";\n`)).toEqual([
      './estilos.css',
      'server-only',
    ]);
  });

  it('debe detectar `export … from`', () => {
    const contenido = `export { a } from './a';\nexport * from "./b";\nexport type { C } from './c';\n`;

    expect(extraerEspecificadores(contenido)).toEqual(['./a', './b', './c']);
  });

  it('debe detectar el import dinámico `import()`', () => {
    const contenido = `const m = await import('./dinamico');\nconst n = import( "./otro" );\n`;

    expect(extraerEspecificadores(contenido)).toEqual(['./dinamico', './otro']);
  });

  it('debe detectar `vi.mock()` con y sin factory', () => {
    const contenido = `vi.mock('./simulado');\nvi.mock("../con-factory", () => ({ a: 1 }));\n`;

    expect(extraerEspecificadores(contenido)).toEqual(['./simulado', '../con-factory']);
  });

  it('debe detectar `vi.doMock()`', () => {
    const contenido = `vi.doMock('./diferido');\nvi.doMock( "../otro", () => ({}) );\n`;

    expect(extraerEspecificadores(contenido)).toEqual(['./diferido', '../otro']);
  });

  it('debe detectar `vi.unmock()`', () => {
    expect(extraerEspecificadores(`vi.unmock('./real');\nvi.unmock("../otro");\n`)).toEqual([
      './real',
      '../otro',
    ]);
  });

  it('debe detectar `vi.importActual()`', () => {
    const contenido = `const r = await vi.importActual('./real');\nvi.importActual<typeof M>("../m");\n`;

    expect(extraerEspecificadores(contenido)).toEqual(['./real', '../m']);
  });

  it('debe detectar `vi.importActual()` con un genérico anidado, `vi.doUnmock()` y `vi.importMock()`', () => {
    const contenido = [
      `vi.importActual<Record<string, M>>('./anidado');`,
      `vi.doUnmock('./deshecho');`,
      `vi.importMock<T>('./simulado');`,
      `vi.mock<A>(x); f('./no-es-mock');`,
    ].join('\n');

    expect(extraerEspecificadores(contenido)).toEqual(['./anidado', './deshecho', './simulado']);
  });

  it('debe detectar `import()` con template literal sin interpolación, pero no con `${`', () => {
    const contenido = 'const m = import(`./plantilla`);\nconst n = import(`./${nombre}`);\n';

    expect(extraerEspecificadores(contenido)).toEqual(['./plantilla']);
  });

  it('debe detectar varias sintaxis en un mismo archivo', () => {
    const contenido = [
      `import { a } from './uno';`,
      `import './dos';`,
      `export { b } from './tres';`,
      `const c = import('./cuatro');`,
      `vi.mock('./cinco');`,
    ].join('\n');

    expect(extraerEspecificadores(contenido).sort()).toEqual(
      ['./cinco', './cuatro', './dos', './tres', './uno'].sort(),
    );
  });

  it('debe devolver una lista vacía si no hay imports', () => {
    expect(extraerEspecificadores(`const x = 1;\nexport const y = x;\n`)).toEqual([]);
  });
});

describe('resolverEspecificador', () => {
  it('debe resolver un relativo que sube de carpeta contra la carpeta del archivo', () => {
    expect(resolverEspecificador('src/shared/sesion/x.ts', `../../${CARPETA_FEATURES}/x`)).toBe(
      'src/features/x',
    );
  });

  it('debe resolver el alias `@/` contra `src/`', () => {
    expect(resolverEspecificador('src/shared/sesion/x.ts', `${ALIAS}${CARPETA_FEATURES}/x`)).toBe(
      'src/features/x',
    );
  });

  it('debe resolver `./algo` contra la carpeta del archivo', () => {
    expect(resolverEspecificador('src/shared/sesion/x.ts', './algo')).toBe(
      'src/shared/sesion/algo',
    );
  });

  it('debe ignorar un paquete externo (`react`)', () => {
    expect(resolverEspecificador('src/shared/sesion/x.ts', 'react')).toBeNull();
  });

  it('debe ignorar un módulo de Node (`node:fs`)', () => {
    expect(resolverEspecificador('src/shared/sesion/x.ts', 'node:fs')).toBeNull();
  });

  it('debe ignorar un paquete con scope (`@vitest/…`) aunque empiece con `@`', () => {
    expect(resolverEspecificador('src/shared/sesion/x.ts', '@vitest/coverage-v8')).toBeNull();
  });

  it('debe coincidir con los alias de tsconfig.json (solo `@/*` → `./src/*`)', () => {
    // JSON.parse estricto: si tsconfig.json llega a tener comentarios, el test falla de forma visible.
    const tsconfig: unknown = JSON.parse(
      readFileSync(path.join(RAIZ_REPO, 'tsconfig.json'), 'utf8'),
    );
    const paths =
      typeof tsconfig === 'object' &&
      tsconfig !== null &&
      'compilerOptions' in tsconfig &&
      typeof tsconfig.compilerOptions === 'object' &&
      tsconfig.compilerOptions !== null &&
      'paths' in tsconfig.compilerOptions
        ? tsconfig.compilerOptions.paths
        : undefined;

    expect(
      paths,
      'Si se agrega un alias nuevo en tsconfig.json, hay que actualizar resolverEspecificador ' +
        'de este guardián; si no, los imports con ese alias se tratarán como paquetes externos.',
    ).toEqual({ '@/*': ['./src/*'] });
  });
});

describe('tieneDirectivaUseServer', () => {
  it("debe detectar `'use server'` como primera sentencia", () => {
    expect(tieneDirectivaUseServer(`'use server';\n\nexport async function f() {}\n`)).toBe(true);
  });

  it('debe detectar `"use server"` sin punto y coma, después de comentarios y líneas vacías', () => {
    const contenido = `// comentario\n/* bloque\n   de comentario */\n\n"use server"\nexport const x = 1;\n`;

    expect(tieneDirectivaUseServer(contenido)).toBe(true);
  });

  it('debe detectar `use server` aunque otra directiva vaya antes en el prólogo', () => {
    expect(tieneDirectivaUseServer(`'use strict';\n'use server';\nexport const x = 1;\n`)).toBe(
      true,
    );
  });

  it('no debe marcar una mención dentro de un JSDoc', () => {
    const contenido = `/**\n * Este archivo nunca debe llevar 'use server'.\n */\nexport const x = 1;\n`;

    expect(tieneDirectivaUseServer(contenido)).toBe(false);
  });

  it('no debe marcar `use server` si no es la primera sentencia', () => {
    const contenido = `import { a } from './a';\n'use server';\nexport const x = a;\n`;

    expect(tieneDirectivaUseServer(contenido)).toBe(false);
  });
});

describe('violaciones simuladas', () => {
  it('debe reportar el archivo de shared y el especificador que resuelve dentro de features', () => {
    const archivos: ArchivoFuente[] = [
      {
        ruta: 'src/shared/sesion/ui/falso.ts',
        contenido: `import { x } from '${ALIAS}${CARPETA_FEATURES}/qa-access/domain/rules';\n`,
      },
      {
        ruta: 'src/shared/db/falso.ts',
        contenido: `vi.mock('../../${CARPETA_FEATURES}/qa-access/ui/actions');\n`,
      },
      { ruta: 'src/shared/db/sano.ts', contenido: `import { y } from './client';\n` },
    ];

    expect(violacionesSharedImportaFeatures(archivos)).toEqual([
      `src/shared/sesion/ui/falso.ts → '${ALIAS}${CARPETA_FEATURES}/qa-access/domain/rules'`,
      `src/shared/db/falso.ts → '../../${CARPETA_FEATURES}/qa-access/ui/actions'`,
    ]);
  });

  it('no debe reportar un especificador de shared que contiene "features" pero no resuelve ahí', () => {
    const archivos: ArchivoFuente[] = [
      { ruta: 'src/shared/x.ts', contenido: `import { f } from './${CARPETA_FEATURES}-flags';\n` },
    ];

    expect(violacionesSharedImportaFeatures(archivos)).toEqual([]);
  });

  it('debe reportar una feature que importa de otra, pero no los imports dentro de la misma', () => {
    const archivos: ArchivoFuente[] = [
      {
        ruta: 'src/features/consumos/ui/falso.ts',
        contenido: [
          `import { a } from '../../qa-access/domain/rules';`,
          `import { b } from '../domain/propio';`,
          `import { c } from '${ALIAS}${CARPETA_FEATURES}/consumos/data/repo';`,
          `import { d } from '${ALIAS}shared/sesion/domain/rules';`,
        ].join('\n'),
      },
    ];

    expect(violacionesFeatureImportaOtraFeature(archivos)).toEqual([
      `src/features/consumos/ui/falso.ts → '../../qa-access/domain/rules'`,
    ]);
  });

  it("debe reportar el archivo de shared con `'use server'` y la directiva", () => {
    const archivos: ArchivoFuente[] = [
      { ruta: 'src/shared/sesion/ui/falso.ts', contenido: `'use server';\nexport const x = 1;\n` },
      { ruta: 'src/features/qa-access/ui/actions.ts', contenido: `'use server';\n` },
    ];

    expect(violacionesUseServerEnShared(archivos)).toEqual([
      `src/shared/sesion/ui/falso.ts → 'use server'`,
    ]);
  });

  it('debe reportar cada módulo de sesión que siga en qa-access', () => {
    const rutas = [
      `${QA_ACCESS}/domain/rules.ts`,
      `${QA_ACCESS}/domain/types.ts`,
      `${QA_ACCESS}/data`,
      `${QA_ACCESS}/data/sesion-repository.ts`,
    ];

    expect(modulosDeSesionEnQaAccess(rutas)).toEqual([
      `${QA_ACCESS}/domain/types.ts`,
      `${QA_ACCESS}/data`,
    ]);
  });
});

describe('reglas de dependencias sobre el código real (ADR-007)', () => {
  // Se lee en beforeAll (no al cargar el módulo) para que un error de disco falle solo este bloque.
  let rutasDeSrc: string[] = [];
  let archivosDeSrc: ArchivoFuente[] = [];

  beforeAll(() => {
    rutasDeSrc = listarRutas(SRC);
    archivosDeSrc = leerArchivosFuente(rutasDeSrc);
  });

  it('debe encontrar archivos de shared y de features para escanear', () => {
    expect(archivosDeSrc.some(({ ruta }) => ruta.startsWith(`${SHARED}/`))).toBe(true);
    expect(archivosDeSrc.some(({ ruta }) => ruta.startsWith(`${FEATURES}/`))).toBe(true);
  });

  it('regla 1: ningún archivo de src/shared/ debe importar de src/features/', () => {
    expect(violacionesSharedImportaFeatures(archivosDeSrc)).toEqual([]);
  });

  it('regla 2: ninguna feature debe importar de otra feature', () => {
    expect(violacionesFeatureImportaOtraFeature(archivosDeSrc)).toEqual([]);
  });

  it("regla 3: ningún archivo de src/shared/ debe llevar la directiva 'use server'", () => {
    expect(violacionesUseServerEnShared(archivosDeSrc)).toEqual([]);
  });

  it('regla 4: src/features/qa-access/ no debe contener módulos de sesión', () => {
    expect(modulosDeSesionEnQaAccess(rutasDeSrc)).toEqual([]);
  });
});
