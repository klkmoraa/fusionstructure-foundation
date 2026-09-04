import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import * as foundationUnits from './units';

const sourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
});

const dependencyTarget = (expression: ts.Expression | undefined, sourceFile: ts.SourceFile): string =>
  expression && ts.isStringLiteral(expression) ? expression.text : expression?.getText(sourceFile) ?? '<missing>';

const typeDependencyTarget = (argument: ts.TypeNode, sourceFile: ts.SourceFile): string =>
  ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)
    ? argument.literal.text
    : argument.getText(sourceFile);

const foundationDependencyViolations = (source: string): string[] => {
  const sourceFile = ts.createSourceFile('foundation-boundary.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      violations.push(`static import: ${dependencyTarget(node.moduleSpecifier, sourceFile)}`);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      violations.push(`re-export: ${dependencyTarget(node.moduleSpecifier, sourceFile)}`);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      violations.push(`require import: ${dependencyTarget(node.moduleReference.expression, sourceFile)}`);
    } else if (ts.isImportTypeNode(node)) {
      violations.push(`type import: ${typeDependencyTarget(node.argument, sourceFile)}`);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        violations.push(`dynamic import: ${dependencyTarget(node.arguments[0], sourceFile)}`);
      } else if (
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')
        || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'require')
      ) {
        violations.push(`require call: ${dependencyTarget(node.arguments[0], sourceFile)}`);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
};

// Frozen pre-extraction factors. These are intentionally literal and must not
// import Foundation metadata or use its factor resolver to form expectations.
const LEGACY_QUANTITIES = [
  'length', 'force', 'moment', 'distributedForce', 'elasticModulus', 'area',
  'inertia', 'sectionModulus', 'sectionDimension', 'translationalStiffness',
  'rotationalStiffness', 'density',
] as const;

const LEGACY_BUILT_IN_IDS = [
  'kN-m', 'N-mm', 'kgf-m', 'kip-ft',
  'N-m', 'kN-cm', 'kN-mm', 'kgf-cm',
  't-m', 't-cm', 'lb-ft', 'lb-in', 'kip-in', 'MN-m',
] as const;

const LEGACY_FORCE_IDS = ['N', 'kN', 'MN', 'gf', 'kgf', 't', 'lb', 'kip'] as const;
const LEGACY_LENGTH_IDS = ['mm', 'cm', 'm', 'km', 'in', 'ft', 'yd'] as const;

type LegacyQuantity = (typeof LEGACY_QUANTITIES)[number];
type LegacyBuiltInUnitSystemId = (typeof LEGACY_BUILT_IN_IDS)[number];
type LegacyForce = (typeof LEGACY_FORCE_IDS)[number];
type LegacyLength = (typeof LEGACY_LENGTH_IDS)[number];
type TestUnitSystemId = LegacyBuiltInUnitSystemId | `custom:${string}`;

const LEGACY_BUILT_IN_FACTORS: Readonly<Record<LegacyBuiltInUnitSystemId, readonly number[]>> = {
  'kN-m': [1, 1, 1, 1, 0.001, 1, 1, 1, 1000, 1, 1, 1],
  'N-mm': [1000, 1000, 1_000_000, 1, 0.001, 1_000_000, 1_000_000_000_000, 1_000_000_000, 1000, 1, 1_000_000, 1],
  'kgf-m': [1, 101.9716212978, 101.9716212978, 101.9716212978, 0.01019716212978, 10_000, 100_000_000, 1_000_000, 100, 101.9716212978, 101.9716212978, 1],
  'kip-ft': [3.28083989501312, 0.22480894387096, 0.73756214927727, 0.06852176585679, 1.45037737730209e-4, 1550.0031000062, 2_402_509.60999038, 61_023.7440947323, 39.3700787401575, 0.06852176585679, 0.73756214927727, 0.0624279605761],
  'N-m': [1, 1000, 1000, 1000, 1000, 1, 1, 1, 1, 1000, 1000, 1],
  'kN-cm': [100, 1, 100, 0.01, 0.0001, 10_000, 100_000_000, 1_000_000, 100, 0.01, 100, 0.000001],
  'kN-mm': [1000, 1, 1000, 0.001, 0.000001, 1_000_000, 1_000_000_000_000, 1_000_000_000, 1000, 0.001, 1000, 1e-9],
  'kgf-cm': [100, 101.9716212978, 10_197.16212978, 1.019716212978, 0.01019716212978, 10_000, 100_000_000, 1_000_000, 100, 1.019716212978, 10_197.16212978, 0.000001],
  't-m': [1, 0.1019716212978, 0.1019716212978, 0.1019716212978, 0.1019716212978, 1, 1, 1, 1, 0.1019716212978, 0.1019716212978, 0.001],
  't-cm': [100, 0.1019716212978, 10.19716212978, 0.001019716212978, 0.00001019716212978, 10_000, 100_000_000, 1_000_000, 100, 0.001019716212978, 10.19716212978, 1e-9],
  'lb-ft': [3.280839895013123, 224.80894387096, 737.5621518076115, 68.52176609186861, 20.885434304801556, 10.76391041670972, 115.86176745895202, 35.31466672148858, 3.280839895013123, 68.52176609186861, 737.5621518076115, 0.062427960576179296],
  'lb-in': [39.37007874015748, 224.80894387096, 8850.745821691338, 5.710147174322384, 0.14503773822778854, 1550.0031000062002, 2_402_509.6100288304, 61_023.74409473229, 39.37007874015748, 5.710147174322384, 8850.745821691338, 0.000036127292000103745],
  'kip-in': [39.37007874015748, 0.22480894387096, 8.850745821691339, 0.005710147174322384, 0.00014503773822778854, 1550.0031000062002, 2_402_509.6100288304, 61_023.74409473229, 39.37007874015748, 0.005710147174322384, 8.850745821691339, 0.000036127292000103745],
  'MN-m': [1, 0.001, 0.001, 0.001, 0.001, 1, 1, 1, 1, 0.001, 0.001, 1],
};

const LEGACY_BUILT_IN_IDENTITIES: Readonly<Record<LegacyBuiltInUnitSystemId, { readonly force: LegacyForce; readonly length: LegacyLength }>> = {
  'kN-m': { force: 'kN', length: 'm' },
  'N-mm': { force: 'N', length: 'mm' },
  'kgf-m': { force: 'kgf', length: 'm' },
  'kip-ft': { force: 'kip', length: 'ft' },
  'N-m': { force: 'N', length: 'm' },
  'kN-cm': { force: 'kN', length: 'cm' },
  'kN-mm': { force: 'kN', length: 'mm' },
  'kgf-cm': { force: 'kgf', length: 'cm' },
  't-m': { force: 't', length: 'm' },
  't-cm': { force: 't', length: 'cm' },
  'lb-ft': { force: 'lb', length: 'ft' },
  'lb-in': { force: 'lb', length: 'in' },
  'kip-in': { force: 'kip', length: 'in' },
  'MN-m': { force: 'MN', length: 'm' },
};

const LEGACY_CUSTOM_FORCES: Readonly<Record<LegacyForce, { readonly factor: number; readonly massFactor: number }>> = {
  N: { factor: 1000, massFactor: 1 },
  kN: { factor: 1, massFactor: 1 },
  MN: { factor: 0.001, massFactor: 1 },
  gf: { factor: 101_971.6212978, massFactor: 1000 },
  kgf: { factor: 101.9716212978, massFactor: 1 },
  t: { factor: 0.1019716212978, massFactor: 0.001 },
  lb: { factor: 224.80894387096, massFactor: 2.20462262185 },
  kip: { factor: 0.22480894387096, massFactor: 2.20462262185 },
} as const;

const LEGACY_CUSTOM_LENGTHS: Readonly<Record<LegacyLength, number>> = {
  mm: 1000,
  cm: 100,
  m: 1,
  km: 0.001,
  in: 39.37007874015748,
  ft: 3.280839895013123,
  yd: 1.0936132983377078,
} as const;

const legacyCustomFactors = (forceId: LegacyForce, lengthId: LegacyLength): Readonly<Record<LegacyQuantity, number>> => {
  const { factor: force, massFactor } = LEGACY_CUSTOM_FORCES[forceId];
  const length = LEGACY_CUSTOM_LENGTHS[lengthId];
  return {
    length,
    force,
    moment: force * length,
    distributedForce: force / length,
    elasticModulus: force / length ** 2,
    area: length ** 2,
    inertia: length ** 4,
    sectionModulus: length ** 3,
    sectionDimension: length,
    translationalStiffness: force / length,
    rotationalStiffness: force * length,
    density: massFactor / length ** 3,
  };
};

const expectIndependentConversion = (system: TestUnitSystemId, quantity: LegacyQuantity, factor: number): void => {
  const canonicalValue = 7.25;
  const displayValue = -13.5;
  const expectedDisplay = canonicalValue * factor;
  const expectedCanonical = displayValue / factor;
  const tolerance = (value: number) => Math.max(1, Math.abs(value)) * 1e-12;

  expect(
    Math.abs(foundationUnits.toDisplay(canonicalValue, system, quantity) - expectedDisplay),
    `${system}/${quantity} toDisplay`,
  ).toBeLessThanOrEqual(tolerance(expectedDisplay));
  expect(
    Math.abs(foundationUnits.fromDisplay(displayValue, system, quantity) - expectedCanonical),
    `${system}/${quantity} fromDisplay`,
  ).toBeLessThanOrEqual(tolerance(expectedCanonical));
};

describe('foundation unit contracts', () => {
  it('exposes the neutral unit API independently of engine presentation', () => {
    expect(Object.keys(foundationUnits).sort()).toEqual([
      'UNIT_FORCE_IDS', 'UNIT_LENGTH_IDS', 'UNIT_QUANTITIES', 'UNIT_SYSTEM_IDS',
      'createCustomUnitSystemId', 'fromDisplay', 'isBuiltInUnitSystemId',
      'isCustomUnitSystemId', 'isUnitSystemId', 'parseCustomUnitSystemId',
      'toDisplay', 'unitSystemIdentity',
    ]);
  });

  it('preserves the fourteen canonical built-in identities in persisted order', () => {
    expect(foundationUnits.UNIT_SYSTEM_IDS).toEqual([
      'kN-m', 'N-mm', 'kgf-m', 'kip-ft',
      'N-m', 'kN-cm', 'kN-mm', 'kgf-cm',
      't-m', 't-cm', 'lb-ft', 'lb-in', 'kip-in', 'MN-m',
    ]);
    expect(foundationUnits.UNIT_QUANTITIES).toEqual([
      'length', 'force', 'moment', 'distributedForce', 'elasticModulus', 'area',
      'inertia', 'sectionModulus', 'sectionDimension', 'translationalStiffness',
      'rotationalStiffness', 'density',
    ]);
    expect(foundationUnits.UNIT_FORCE_IDS).toEqual(LEGACY_FORCE_IDS);
    expect(foundationUnits.UNIT_LENGTH_IDS).toEqual(LEGACY_LENGTH_IDS);
  });

  it('matches frozen legacy factors for every built-in system and physical quantity', () => {
    expect(LEGACY_BUILT_IN_IDS).toHaveLength(14);
    expect(LEGACY_QUANTITIES).toHaveLength(12);

    for (const system of LEGACY_BUILT_IN_IDS) {
      const factors = LEGACY_BUILT_IN_FACTORS[system];
      expect(factors).toHaveLength(LEGACY_QUANTITIES.length);
      expect(foundationUnits.isBuiltInUnitSystemId(system)).toBe(true);
      expect(foundationUnits.isCustomUnitSystemId(system)).toBe(false);
      expect(foundationUnits.isUnitSystemId(system)).toBe(true);
      expect(foundationUnits.unitSystemIdentity(system)).toEqual(LEGACY_BUILT_IN_IDENTITIES[system]);
      for (const [index, quantity] of LEGACY_QUANTITIES.entries()) {
        expectIndependentConversion(system, quantity, factors[index]!);
      }
    }
  });

  it('matches hard-derived physical factors for all 56 valid custom force and length combinations', () => {
    expect(LEGACY_FORCE_IDS.length * LEGACY_LENGTH_IDS.length).toBe(56);

    for (const force of LEGACY_FORCE_IDS) {
      for (const length of LEGACY_LENGTH_IDS) {
        const system = `custom:matrix%20${force}%2F${length}:${force}:${length}` as `custom:${string}`;
        expect(foundationUnits.createCustomUnitSystemId(`matrix ${force}/${length}`, force, length)).toBe(system);
        expect(foundationUnits.parseCustomUnitSystemId(system)).toEqual({ name: `matrix ${force}/${length}`, force, length });
        expect(foundationUnits.isCustomUnitSystemId(system)).toBe(true);
        expect(foundationUnits.isUnitSystemId(system)).toBe(true);
        expect(foundationUnits.isBuiltInUnitSystemId(system)).toBe(false);
        expect(foundationUnits.unitSystemIdentity(system)).toEqual({ force, length });
        const factors = legacyCustomFactors(force, length);
        for (const quantity of LEGACY_QUANTITIES) {
          expectIndependentConversion(system, quantity, factors[quantity]);
        }
      }
    }
  });

  it('normalizes and percent-encodes valid custom identities without changing their grammar', () => {
    const custom = foundationUnits.createCustomUnitSystemId('  T / M  ', 't', 'm');

    expect(custom).toBe('custom:T%20%2F%20M:t:m');
    expect(foundationUnits.parseCustomUnitSystemId(custom)).toEqual({ name: 'T / M', force: 't', length: 'm' });
    expect(foundationUnits.createCustomUnitSystemId('', 'kN', 'm')).toBe('custom:kN%2Fm:kN:m');
  });

  it('rejects malformed, control-character and overlong custom identifiers', () => {
    expect(foundationUnits.isUnitSystemId('custom:bad:bogus:m')).toBe(false);
    expect(foundationUnits.isUnitSystemId('custom:T%2FM:t:unknown')).toBe(false);
    expect(foundationUnits.isUnitSystemId('custom::t:m')).toBe(false);
    expect(foundationUnits.isUnitSystemId('custom:%E0%A4%A:t:m')).toBe(false);
    expect(foundationUnits.isUnitSystemId('custom:line%00break:t:m')).toBe(false);
    expect(foundationUnits.isUnitSystemId('custom:line%7Fbreak:t:m')).toBe(false);
    expect(foundationUnits.isUnitSystemId(`custom:${'a'.repeat(65)}:t:m`)).toBe(false);
  });

  it('uses the historical kN-m fallback and preserves special profile factors', () => {
    expect(foundationUnits.unitSystemIdentity('custom:T%20%2F%20M:t:m')).toEqual({ force: 't', length: 'm' });
    expect(foundationUnits.unitSystemIdentity('not-a-system' as never)).toEqual({ force: 'kN', length: 'm' });
    expect(foundationUnits.toDisplay(2, 'not-a-system' as never, 'elasticModulus')).toBeCloseTo(0.002);
    expect(foundationUnits.toDisplay(1, 'N-mm', 'density')).toBe(1);
    expect(foundationUnits.toDisplay(1, 'kgf-m', 'area')).toBe(10_000);
    expect(foundationUnits.toDisplay(1, 'kip-ft', 'inertia')).toBeCloseTo(2_402_509.60999038);
    expect(foundationUnits.fromDisplay(3.25, 'custom:T%2FM:t:m', 'moment')).toBeCloseTo(31.87142857142857);
  });

  it('rejects unavailable force and length identities when creating a custom system', () => {
    expect(() => foundationUnits.createCustomUnitSystemId('invalid', 'bogus' as never, 'm')).toThrow('Unidad personalizada no disponible.');
    expect(() => foundationUnits.createCustomUnitSystemId('invalid', 'kN', 'bogus' as never)).toThrow('Unidad personalizada no disponible.');
  });

  it('rejects every dependency syntax in controlled Foundation source samples', () => {
    const samples: ReadonlyArray<readonly [string, readonly string[]]> = [
      ["import value from 'dependency';", ['static import: dependency']],
      ["import type { Value } from 'dependency';", ['static import: dependency']],
      ["type Value = import('dependency').Value;", ['type import: dependency']],
      ["void import('dependency');", ['dynamic import: dependency']],
      ["void require('dependency');", ['require call: dependency']],
      ["import value = require('dependency');", ['require import: dependency']],
      ["export { value } from 'dependency';", ['re-export: dependency']],
      ["const prose = \"import('not-a-dependency') require('not-a-dependency')\";", []],
    ];

    for (const [source, expected] of samples) {
      expect(foundationDependencyViolations(source), source).toEqual(expected);
    }
  });

  it('keeps Foundation free of all dependency syntax', () => {
    const sourcePath = new URL('./units.ts', import.meta.url);
    expect(existsSync(sourcePath)).toBe(true);
    if (!existsSync(sourcePath)) return;

    const source = readFileSync(sourcePath, 'utf8');

    expect(foundationDependencyViolations(source)).toEqual([]);
  });

  it('keeps internal consumers off deprecated engine compatibility reexports', () => {
    const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
    const neutralExports = [
      'BuiltInUnitSystemId', 'CustomUnitSystem', 'UnitFactors', 'UnitForceId',
      'UnitLengthId', 'UnitQuantity', 'UnitSystemId', 'UnitSystemIdentity',
      'createCustomUnitSystemId', 'fromDisplay', 'isBuiltInUnitSystemId',
      'isCustomUnitSystemId', 'isUnitSystemId', 'parseCustomUnitSystemId',
      'toDisplay', 'unitSystemIdentity', 'UNIT_FORCE_IDS', 'UNIT_LENGTH_IDS',
      'UNIT_QUANTITIES', 'UNIT_SYSTEM_IDS',
    ];
    const violations: string[] = [];

    for (const path of sourceFiles(sourceRoot)) {
      if (path.endsWith(join('engine', 'units.ts'))) continue;
      const imports = readFileSync(path, 'utf8').match(/^\s*import(?:[\s\S]*?);/gm) ?? [];
      for (const statement of imports) {
        if (!/from\s+['"][^'"]*engine\/units['"]/.test(statement)) continue;
        for (const name of neutralExports) {
          if (new RegExp(`\\b${name}\\b`).test(statement)) violations.push(`${path}: ${name}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
