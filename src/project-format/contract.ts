/**
 * Neutral project envelope contract. Domain payloads are referenced by path and
 * are deliberately not represented here as 2D, 3D, UI, or solver data.
 */
export const PROJECT_FORMAT_VERSION = '0.1' as const;
export const PROJECT_FORMAT_MEDIA_TYPE = 'application/vnd.fusionstructure.project-format+json' as const;
export const PROJECT_FORMAT_SCHEMA_MEDIA_TYPE = 'application/schema+json' as const;
export const PROJECT_FORMAT_SCHEMA_URI = 'urn:fusionstructure:project-format:0.1' as const;

export interface ProjectFormatProjectIdentity {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectFormatDefaultUnits {
  readonly length: string;
  readonly force: string;
}

export interface ProjectFormatCoordinateContext {
  readonly id: string;
  readonly handedness: 'right-handed' | 'left-handed';
  readonly lengthUnit: string;
}

export interface ProjectFormatProducer {
  readonly id: string;
  readonly version: string;
}

export interface ProjectFormatSchemaReference {
  readonly mediaType: typeof PROJECT_FORMAT_SCHEMA_MEDIA_TYPE;
  readonly uri: string;
}

export interface ProjectFormatDependency {
  readonly id: string;
  readonly mediaType: string;
  readonly version: string;
  readonly sha256: string;
  /** Local bytes are mandatory so package verification never needs a network fetch. */
  readonly path: string;
  /** Optional locator retained for provenance or later resolution outside this boundary. */
  readonly uri?: string;
}

export interface ProjectFormatRevisionEntry {
  readonly id: string;
  readonly createdAt: string;
  readonly summary: string;
  readonly parentId?: string;
}

export interface ProjectFormatRevisions {
  readonly currentRevisionId: string;
  readonly entries: readonly ProjectFormatRevisionEntry[];
}

export interface ProjectFormatPayloadReference {
  readonly id: string;
  readonly path: string;
  readonly mediaType: string;
  readonly sha256: string;
  readonly coordinateContextId?: string;
}

export interface ProjectFormatAssetDescriptor {
  readonly id: string;
  readonly path: string;
  readonly mediaType: string;
  readonly sha256: string;
}

export interface ProjectFormatExtensionDescriptor {
  readonly id: string;
  readonly path: string;
  readonly mediaType: string;
  readonly sha256: string;
  readonly required: boolean;
}

export interface ProjectFormatManifest {
  readonly formatVersion: typeof PROJECT_FORMAT_VERSION;
  readonly mediaType: typeof PROJECT_FORMAT_MEDIA_TYPE;
  readonly project: ProjectFormatProjectIdentity;
  readonly defaultUnits: ProjectFormatDefaultUnits;
  readonly coordinateContexts: readonly ProjectFormatCoordinateContext[];
  readonly producer: ProjectFormatProducer;
  readonly schema: ProjectFormatSchemaReference;
  readonly dependencies: readonly ProjectFormatDependency[];
  readonly revisions: ProjectFormatRevisions;
  readonly payloads: readonly ProjectFormatPayloadReference[];
  readonly assets: readonly ProjectFormatAssetDescriptor[];
  readonly extensions: readonly ProjectFormatExtensionDescriptor[];
}

export type ProjectFormatValidationCode =
  | 'duplicate-id'
  | 'duplicate-path'
  | 'embedded-domain-payload'
  | 'hash-verification-unavailable'
  | 'invalid-field'
  | 'invalid-sha256'
  | 'malformed-manifest'
  | 'malformed-package'
  | 'missing-file'
  | 'missing-required-field'
  | 'non-serializable-json'
  | 'sha256-mismatch'
  | 'unsafe-path'
  | 'unknown-manifest-field'
  | 'unreferenced-file'
  | 'unverifiable-dependency'
  | 'unsupported-destructive-downgrade'
  | 'unsupported-format-version'
  | 'unsupported-target-version';

export interface ProjectFormatValidationIssue {
  readonly code: ProjectFormatValidationCode;
  readonly path: string;
  readonly message: string;
}

export interface ProjectFormatValidationReport {
  readonly ok: boolean;
  readonly issues: readonly ProjectFormatValidationIssue[];
}

export interface ProjectFormatPackage {
  readonly manifest: ProjectFormatManifest;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export interface SerializedProjectFormatPackage {
  readonly manifestBytes: Uint8Array;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export type ProjectFormatOperationResult<Value> =
  | { readonly ok: true; readonly value: Value; readonly report: ProjectFormatValidationReport }
  | { readonly ok: false; readonly report: ProjectFormatValidationReport; readonly value?: never };
