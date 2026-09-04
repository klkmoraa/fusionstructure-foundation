/**
 * Explicit adapter seam only. The established portable 2D format remains
 * owned by its existing implementation and is not renamed as this neutral
 * project envelope.
 */
export const LEGACY_FSTRUCTURE_PORTABLE_FORMAT_VERSION = 1 as const;
const LEGACY_FSTRUCTURE_PORTABLE_FORMATS = new Set(['fusionstructure-portable', 'structureco-portable']);

export interface LegacyFStructurePortableInspection {
  readonly kind: 'legacy-2d-portable';
  readonly migration: 'external-adapter-required';
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Recognizes, but deliberately does not transform, the legacy 2D portable contract. */
export const inspectLegacyFStructurePortable = (value: unknown): LegacyFStructurePortableInspection | undefined => {
  if (!isRecord(value)) return undefined;
  if (typeof value.format !== 'string' || !LEGACY_FSTRUCTURE_PORTABLE_FORMATS.has(value.format)) return undefined;
  if (value.formatVersion !== LEGACY_FSTRUCTURE_PORTABLE_FORMAT_VERSION) return undefined;
  return { kind: 'legacy-2d-portable', migration: 'external-adapter-required' };
};
