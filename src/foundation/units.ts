/**
 * Neutral unit identities and conversions.
 *
 * Foundation intentionally has no imports: it is shared by persistence and
 * domain code without depending on either engine presentation or UI policy.
 * Stored model values remain canonical (m, kN, kN·m, kN/m², m² and m⁴).
 */

export const UNIT_QUANTITIES = [
  'length',
  'force',
  'moment',
  'distributedForce',
  'elasticModulus',
  'area',
  'inertia',
  'sectionModulus',
  'sectionDimension',
  'translationalStiffness',
  'rotationalStiffness',
  'density',
] as const;

export type UnitQuantity = (typeof UNIT_QUANTITIES)[number];
export type UnitForceId = 'N' | 'kN' | 'MN' | 'gf' | 'kgf' | 't' | 'lb' | 'kip';
export type UnitLengthId = 'mm' | 'cm' | 'm' | 'km' | 'in' | 'ft' | 'yd';

export type BuiltInUnitSystemId =
  | 'kN-m' | 'N-mm' | 'kgf-m' | 'kip-ft'
  | 'N-m' | 'kN-cm' | 'kN-mm' | 'kgf-cm'
  | 't-m' | 't-cm' | 'lb-ft' | 'lb-in' | 'kip-in' | 'MN-m';

export type UnitSystemId = BuiltInUnitSystemId | `custom:${string}`;

export const UNIT_FORCE_IDS: readonly UnitForceId[] = [
  'N', 'kN', 'MN', 'gf', 'kgf', 't', 'lb', 'kip',
];

export const UNIT_LENGTH_IDS: readonly UnitLengthId[] = [
  'mm', 'cm', 'm', 'km', 'in', 'ft', 'yd',
];

/** Persisted order. Do not reorder: existing selectors and serialized projects rely on it. */
export const UNIT_SYSTEM_IDS: readonly BuiltInUnitSystemId[] = [
  'kN-m', 'N-mm', 'kgf-m', 'kip-ft',
  'N-m', 'kN-cm', 'kN-mm', 'kgf-cm',
  't-m', 't-cm', 'lb-ft', 'lb-in', 'kip-in', 'MN-m',
];

export interface CustomUnitSystem {
  readonly name: string;
  readonly force: UnitForceId;
  readonly length: UnitLengthId;
}

/** Canonical force and length identities behind a supported system. */
export interface UnitSystemIdentity {
  readonly force: UnitForceId;
  readonly length: UnitLengthId;
}

export type UnitFactors = Readonly<Record<UnitQuantity, number>>;

interface ForceDefinition {
  readonly factor: number;
  /** Number of display mass units represented by one kilogram. */
  readonly massFactor: number;
}

interface LengthDefinition {
  /** Number of display length units represented by one metre. */
  readonly factor: number;
}

const forceDefinitions: Record<UnitForceId, ForceDefinition> = {
  N: { factor: 1_000, massFactor: 1 },
  kN: { factor: 1, massFactor: 1 },
  MN: { factor: 0.001, massFactor: 1 },
  gf: { factor: 101_971.6212978, massFactor: 1_000 },
  kgf: { factor: 101.9716212978, massFactor: 1 },
  t: { factor: 0.1019716212978, massFactor: 0.001 },
  lb: { factor: 224.80894387096, massFactor: 2.20462262185 },
  kip: { factor: 0.22480894387096, massFactor: 2.20462262185 },
};

const lengthDefinitions: Record<UnitLengthId, LengthDefinition> = {
  mm: { factor: 1_000 },
  cm: { factor: 100 },
  m: { factor: 1 },
  km: { factor: 0.001 },
  in: { factor: 39.37007874015748 },
  ft: { factor: 3.280839895013123 },
  yd: { factor: 1.0936132983377078 },
};

const makeFactors = (forceId: UnitForceId, lengthId: UnitLengthId): UnitFactors => {
  const force = forceDefinitions[forceId];
  const length = lengthDefinitions[lengthId];
  const lengthFactor = length.factor;
  const forceFactor = force.factor;
  return {
    length: lengthFactor,
    force: forceFactor,
    moment: forceFactor * lengthFactor,
    distributedForce: forceFactor / lengthFactor,
    elasticModulus: forceFactor / lengthFactor ** 2,
    area: lengthFactor ** 2,
    inertia: lengthFactor ** 4,
    sectionModulus: lengthFactor ** 3,
    sectionDimension: lengthFactor,
    translationalStiffness: forceFactor / lengthFactor,
    rotationalStiffness: forceFactor * lengthFactor,
    density: force.massFactor / lengthFactor ** 3,
  };
};

const builtInIdentities: Record<BuiltInUnitSystemId, UnitSystemIdentity> = {
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

const builtInFactors: Record<BuiltInUnitSystemId, UnitFactors> = {
  // These four profiles preserve the factors used by historical projects.
  'kN-m': {
    length: 1, force: 1, moment: 1, distributedForce: 1,
    elasticModulus: 1 / 1000, area: 1, inertia: 1, sectionModulus: 1,
    sectionDimension: 1000,
    translationalStiffness: 1, rotationalStiffness: 1, density: 1,
  },
  'N-mm': {
    length: 1000, force: 1000, moment: 1_000_000, distributedForce: 1,
    elasticModulus: 1 / 1000, area: 1_000_000, inertia: 1_000_000_000_000, sectionModulus: 1_000_000_000,
    sectionDimension: 1000,
    translationalStiffness: 1, rotationalStiffness: 1_000_000, density: 1,
  },
  'kgf-m': {
    length: 1, force: 101.9716212978, moment: 101.9716212978, distributedForce: 101.9716212978,
    elasticModulus: 0.01019716212978, area: 10_000, inertia: 100_000_000, sectionModulus: 1_000_000,
    sectionDimension: 100,
    translationalStiffness: 101.9716212978, rotationalStiffness: 101.9716212978, density: 1,
  },
  'kip-ft': {
    length: 3.28083989501312,
    force: 0.22480894387096,
    moment: 0.73756214927727,
    distributedForce: 0.06852176585679,
    elasticModulus: 1.45037737730209e-4,
    area: 1550.0031000062,
    inertia: 2_402_509.60999038,
    sectionModulus: 61_023.7440947323,
    sectionDimension: 39.3700787401575,
    translationalStiffness: 0.06852176585679,
    rotationalStiffness: 0.73756214927727,
    density: 0.0624279605761,
  },
  'N-m': makeFactors('N', 'm'),
  'kN-cm': makeFactors('kN', 'cm'),
  'kN-mm': makeFactors('kN', 'mm'),
  'kgf-cm': makeFactors('kgf', 'cm'),
  't-m': makeFactors('t', 'm'),
  't-cm': makeFactors('t', 'cm'),
  'lb-ft': makeFactors('lb', 'ft'),
  'lb-in': makeFactors('lb', 'in'),
  'kip-in': makeFactors('kip', 'in'),
  'MN-m': makeFactors('MN', 'm'),
};

const customUnitSystemPrefix = 'custom:';

const hasForce = (value: string): value is UnitForceId =>
  Object.prototype.hasOwnProperty.call(forceDefinitions, value);

const hasLength = (value: string): value is UnitLengthId =>
  Object.prototype.hasOwnProperty.call(lengthDefinitions, value);

const normalizeCustomName = (value: string): string =>
  value.trim().replace(/\s+/g, ' ');

export const parseCustomUnitSystemId = (value: unknown): CustomUnitSystem | null => {
  if (typeof value !== 'string' || !value.startsWith(customUnitSystemPrefix)) return null;
  const parts = value.slice(customUnitSystemPrefix.length).split(':');
  if (parts.length !== 3 || !parts[0] || !hasForce(parts[1]) || !hasLength(parts[2])) return null;
  let decodedName: string;
  try {
    decodedName = decodeURIComponent(parts[0]);
  } catch {
    return null;
  }
  const name = normalizeCustomName(decodedName);
  if (!name || name.length > 64 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return { name, force: parts[1], length: parts[2] };
};

export const createCustomUnitSystemId = (
  name: string,
  force: UnitForceId,
  length: UnitLengthId,
): UnitSystemId => {
  if (!hasForce(force) || !hasLength(length)) throw new Error('Unidad personalizada no disponible.');
  const normalizedName = normalizeCustomName(name) || `${force}/${length}`;
  if (normalizedName.length > 64 || /[\u0000-\u001f\u007f]/.test(normalizedName)) {
    throw new Error('El nombre de la unidad personalizada no es válido.');
  }
  return `${customUnitSystemPrefix}${encodeURIComponent(normalizedName)}:${force}:${length}` as UnitSystemId;
};

export const isBuiltInUnitSystemId = (value: unknown): value is BuiltInUnitSystemId =>
  typeof value === 'string' && UNIT_SYSTEM_IDS.includes(value as BuiltInUnitSystemId);

export const isCustomUnitSystemId = (value: unknown): value is UnitSystemId =>
  parseCustomUnitSystemId(value) !== null;

export const isUnitSystemId = (value: unknown): value is UnitSystemId =>
  isBuiltInUnitSystemId(value) || isCustomUnitSystemId(value);

/**
 * Resolves any runtime value to the physical identities used for conversion.
 * Invalid values intentionally retain the historical `kN-m` fallback.
 */
export const unitSystemIdentity = (system: UnitSystemId): UnitSystemIdentity => {
  if (isBuiltInUnitSystemId(system)) return builtInIdentities[system];
  const custom = parseCustomUnitSystemId(system);
  return custom
    ? { force: custom.force, length: custom.length }
    : builtInIdentities['kN-m'];
};

const factorsFor = (system: UnitSystemId): UnitFactors => {
  if (isBuiltInUnitSystemId(system)) return builtInFactors[system];
  const custom = parseCustomUnitSystemId(system);
  return custom ? makeFactors(custom.force, custom.length) : builtInFactors['kN-m'];
};

/** Converts a canonical stored value to the selected neutral unit identity. */
export const toDisplay = (value: number, system: UnitSystemId, quantity: UnitQuantity): number =>
  value * factorsFor(system)[quantity];

/** Converts a selected neutral unit identity back to the canonical stored value. */
export const fromDisplay = (value: number, system: UnitSystemId, quantity: UnitQuantity): number =>
  value / factorsFor(system)[quantity];
