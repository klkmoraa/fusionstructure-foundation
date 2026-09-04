import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import * as foundationUnits from './units';

const sourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
});

describe('foundation unit contracts', () => {
  it('exposes the neutral unit API independently of engine presentation', () => {
    expect(foundationUnits).toEqual(expect.objectContaining({
      createCustomUnitSystemId: expect.any(Function),
      fromDisplay: expect.any(Function),
      isUnitSystemId: expect.any(Function),
      parseCustomUnitSystemId: expect.any(Function),
      toDisplay: expect.any(Function),
      unitSystemIdentity: expect.any(Function),
    }));
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

  it('keeps Foundation free of imports, including type-only imports', () => {
    const sourcePath = new URL('./units.ts', import.meta.url);
    expect(existsSync(sourcePath)).toBe(true);
    if (!existsSync(sourcePath)) return;

    const source = readFileSync(sourcePath, 'utf8');

    expect(source).not.toMatch(/^\s*import(?:\s|\(|['"])/m);
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
