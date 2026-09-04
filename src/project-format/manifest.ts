import { canonicalizeProjectFormatJson, createProjectFormatSha256, inspectProjectFormatJson } from './canonical';
import {
  PROJECT_FORMAT_MEDIA_TYPE,
  PROJECT_FORMAT_SCHEMA_MEDIA_TYPE,
  PROJECT_FORMAT_SCHEMA_URI,
  PROJECT_FORMAT_VERSION,
  type ProjectFormatManifest,
  type ProjectFormatOperationResult,
  type ProjectFormatPackage,
  type ProjectFormatValidationCode,
  type ProjectFormatValidationIssue,
  type ProjectFormatValidationReport,
  type SerializedProjectFormatPackage,
} from './contract';

type JsonRecord = Record<string, unknown>;

interface IdentifierRegistry {
  readonly ids: Map<string, string>;
  readonly paths: Map<string, string>;
}

interface HashedFileReference {
  readonly path: string;
  readonly sha256: string;
}

const ROOT_FIELDS = new Set([
  'formatVersion', 'mediaType', 'project', 'defaultUnits', 'coordinateContexts', 'producer', 'schema', 'dependencies', 'revisions', 'payloads', 'assets', 'extensions',
]);
const EMBEDDED_DOMAIN_FIELDS = new Set(['model', 'models', 'projectModel', 'space2d', 'space3d', 'analysis']);
const SHA256_HEX = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MEDIA_TYPE = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;
const ISO_UTC_TIMESTAMP = /^(?:\d{4}-(?:(?:01|03|05|07|08|10|12)-(?:0[1-9]|[12]\d|3[01])|(?:04|06|09|11)-(?:0[1-9]|[12]\d|30)|02-(?:0[1-9]|1\d|2[0-8]))|(?:\d{2}(?:0[48]|[2468][048]|[13579][26])|(?:0[48]|[2468][048]|[13579][26])00|0000)-02-29)T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/;

const isRecord = (value: unknown): value is JsonRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasOwn = (value: JsonRecord, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

const createIssue = (code: ProjectFormatValidationCode, path: string, message: string): ProjectFormatValidationIssue => ({ code, path, message });

const createReport = (issues: readonly ProjectFormatValidationIssue[]): ProjectFormatValidationReport => ({
  ok: issues.length === 0,
  issues,
});

const failure = <Value>(issues: readonly ProjectFormatValidationIssue[]): ProjectFormatOperationResult<Value> => ({
  ok: false,
  report: createReport(issues),
});

const success = <Value>(value: Value): ProjectFormatOperationResult<Value> => ({
  ok: true,
  value,
  report: { ok: true, issues: [] },
});

const requireField = (value: JsonRecord, key: string, path: string, issues: ProjectFormatValidationIssue[]): unknown => {
  if (!hasOwn(value, key)) {
    issues.push(createIssue('missing-required-field', `${path}.${key}`, `${key} is required.`));
    return undefined;
  }
  return value[key];
};

const readNonEmptyString = (value: unknown, path: string, issues: ProjectFormatValidationIssue[]): string | undefined => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(createIssue('invalid-field', path, 'Expected a non-empty string.'));
    return undefined;
  }
  return value;
};

const readIdentifier = (value: unknown, path: string, issues: ProjectFormatValidationIssue[]): string | undefined => {
  const identifier = readNonEmptyString(value, path, issues);
  if (identifier !== undefined && !IDENTIFIER.test(identifier)) {
    issues.push(createIssue('invalid-field', path, 'Expected a stable identifier containing only letters, digits, dot, underscore, colon, or hyphen.'));
    return undefined;
  }
  return identifier;
};

const readMediaType = (value: unknown, path: string, issues: ProjectFormatValidationIssue[]): string | undefined => {
  const mediaType = readNonEmptyString(value, path, issues);
  if (mediaType !== undefined && !MEDIA_TYPE.test(mediaType)) {
    issues.push(createIssue('invalid-field', path, 'Expected an unparameterized media type.'));
    return undefined;
  }
  return mediaType;
};

const readTimestamp = (value: unknown, path: string, issues: ProjectFormatValidationIssue[]): string | undefined => {
  const timestamp = readNonEmptyString(value, path, issues);
  const normalizedTimestamp = timestamp?.includes('.') ? timestamp : timestamp?.replace(/Z$/, '.000Z');
  if (
    timestamp !== undefined
    && (!ISO_UTC_TIMESTAMP.test(timestamp) || normalizedTimestamp === undefined || Number.isNaN(Date.parse(normalizedTimestamp)) || new Date(normalizedTimestamp).toISOString() !== normalizedTimestamp)
  ) {
    issues.push(createIssue('invalid-field', path, 'Expected an ISO-8601 UTC timestamp.'));
    return undefined;
  }
  return timestamp;
};

const isSafeProjectFormatPath = (value: string): boolean => {
  if (value.length === 0 || value !== value.trim()) return false;
  if (value.startsWith('/') || value.startsWith('\\') || value.includes('\\') || value.includes(':') || value.includes('//')) return false;
  if (/[\u0000-\u001F\u007F]/.test(value)) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
};

const readPath = (value: unknown, path: string, issues: ProjectFormatValidationIssue[]): string | undefined => {
  const candidate = readNonEmptyString(value, path, issues);
  if (candidate !== undefined && !isSafeProjectFormatPath(candidate)) {
    issues.push(createIssue('unsafe-path', path, 'Paths must be relative, slash-separated, and must not traverse or select a drive.'));
    return undefined;
  }
  return candidate;
};

const readSha256 = (value: unknown, path: string, issues: ProjectFormatValidationIssue[]): string | undefined => {
  if (typeof value !== 'string' || !SHA256_HEX.test(value)) {
    issues.push(createIssue('invalid-sha256', path, 'Expected a lowercase SHA-256 hexadecimal digest.'));
    return undefined;
  }
  return value;
};

const readArray = (value: JsonRecord, key: string, path: string, issues: ProjectFormatValidationIssue[]): readonly unknown[] | undefined => {
  const candidate = requireField(value, key, path, issues);
  if (!Array.isArray(candidate)) {
    if (candidate !== undefined) issues.push(createIssue('invalid-field', `${path}.${key}`, 'Expected an array.'));
    return undefined;
  }
  return candidate;
};

const readRecord = (value: JsonRecord, key: string, path: string, issues: ProjectFormatValidationIssue[]): JsonRecord | undefined => {
  const candidate = requireField(value, key, path, issues);
  if (!isRecord(candidate)) {
    if (candidate !== undefined) issues.push(createIssue('invalid-field', `${path}.${key}`, 'Expected an object.'));
    return undefined;
  }
  return candidate;
};

const rejectUnknownFields = (value: JsonRecord, allowed: ReadonlySet<string>, path: string, issues: ProjectFormatValidationIssue[]): void => {
  for (const key of Object.keys(value)) {
    if (allowed.has(key)) continue;
    const code = EMBEDDED_DOMAIN_FIELDS.has(key) ? 'embedded-domain-payload' : 'unknown-manifest-field';
    const message = code === 'embedded-domain-payload'
      ? 'Domain models must remain independent payload references, never embedded in the neutral manifest.'
      : 'This manifest version does not define the field.';
    issues.push(createIssue(code, `${path}.${key}`, message));
  }
};

const registerId = (id: string | undefined, path: string, registry: IdentifierRegistry, issues: ProjectFormatValidationIssue[]): void => {
  if (id === undefined) return;
  const existing = registry.ids.get(id);
  if (existing !== undefined) {
    issues.push(createIssue('duplicate-id', path, `Identifier ${id} is already declared at ${existing}.`));
    return;
  }
  registry.ids.set(id, path);
};

const registerPath = (filePath: string | undefined, path: string, registry: IdentifierRegistry, issues: ProjectFormatValidationIssue[]): void => {
  if (filePath === undefined) return;
  const existing = registry.paths.get(filePath);
  if (existing !== undefined) {
    issues.push(createIssue('duplicate-path', path, `Path ${filePath} is already declared at ${existing}.`));
    return;
  }
  registry.paths.set(filePath, path);
};

const validateProjectIdentity = (value: JsonRecord, issues: ProjectFormatValidationIssue[], registry: IdentifierRegistry): void => {
  const path = '$.project';
  rejectUnknownFields(value, new Set(['id', 'createdAt', 'updatedAt']), path, issues);
  const id = readIdentifier(requireField(value, 'id', path, issues), `${path}.id`, issues);
  registerId(id, `${path}.id`, registry, issues);
  readTimestamp(requireField(value, 'createdAt', path, issues), `${path}.createdAt`, issues);
  readTimestamp(requireField(value, 'updatedAt', path, issues), `${path}.updatedAt`, issues);
};

const validateDefaultUnits = (value: JsonRecord, issues: ProjectFormatValidationIssue[]): void => {
  const path = '$.defaultUnits';
  rejectUnknownFields(value, new Set(['length', 'force']), path, issues);
  readNonEmptyString(requireField(value, 'length', path, issues), `${path}.length`, issues);
  readNonEmptyString(requireField(value, 'force', path, issues), `${path}.force`, issues);
};

const validateCoordinateContexts = (values: readonly unknown[] | undefined, issues: ProjectFormatValidationIssue[], registry: IdentifierRegistry): ReadonlySet<string> => {
  const contextIds = new Set<string>();
  if (values === undefined) return contextIds;
  if (values.length === 0) {
    issues.push(createIssue('invalid-field', '$.coordinateContexts', 'At least one coordinate context is required.'));
    return contextIds;
  }
  values.forEach((candidate, index) => {
    const path = `$.coordinateContexts[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(createIssue('invalid-field', path, 'Expected a coordinate context object.'));
      return;
    }
    rejectUnknownFields(candidate, new Set(['id', 'handedness', 'lengthUnit']), path, issues);
    const id = readIdentifier(requireField(candidate, 'id', path, issues), `${path}.id`, issues);
    registerId(id, `${path}.id`, registry, issues);
    if (id !== undefined) contextIds.add(id);
    const handedness = requireField(candidate, 'handedness', path, issues);
    if (handedness !== 'right-handed' && handedness !== 'left-handed') {
      issues.push(createIssue('invalid-field', `${path}.handedness`, 'Expected right-handed or left-handed.'));
    }
    readNonEmptyString(requireField(candidate, 'lengthUnit', path, issues), `${path}.lengthUnit`, issues);
  });
  return contextIds;
};

const validateProducer = (value: JsonRecord, issues: ProjectFormatValidationIssue[], registry: IdentifierRegistry): void => {
  const path = '$.producer';
  rejectUnknownFields(value, new Set(['id', 'version']), path, issues);
  const id = readIdentifier(requireField(value, 'id', path, issues), `${path}.id`, issues);
  registerId(id, `${path}.id`, registry, issues);
  readNonEmptyString(requireField(value, 'version', path, issues), `${path}.version`, issues);
};

const validateSchema = (value: JsonRecord, issues: ProjectFormatValidationIssue[]): void => {
  const path = '$.schema';
  rejectUnknownFields(value, new Set(['mediaType', 'uri']), path, issues);
  const mediaType = readMediaType(requireField(value, 'mediaType', path, issues), `${path}.mediaType`, issues);
  if (mediaType !== undefined && mediaType !== PROJECT_FORMAT_SCHEMA_MEDIA_TYPE) {
    issues.push(createIssue('invalid-field', `${path}.mediaType`, `Expected ${PROJECT_FORMAT_SCHEMA_MEDIA_TYPE}.`));
  }
  const uri = readNonEmptyString(requireField(value, 'uri', path, issues), `${path}.uri`, issues);
  if (uri !== undefined && uri !== PROJECT_FORMAT_SCHEMA_URI) {
    issues.push(createIssue('invalid-field', `${path}.uri`, `Expected ${PROJECT_FORMAT_SCHEMA_URI}.`));
  }
};

const validateDependencies = (values: readonly unknown[] | undefined, issues: ProjectFormatValidationIssue[], registry: IdentifierRegistry): void => {
  if (values === undefined) return;
  values.forEach((candidate, index) => {
    const path = `$.dependencies[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(createIssue('invalid-field', path, 'Expected a dependency descriptor object.'));
      return;
    }
    rejectUnknownFields(candidate, new Set(['id', 'mediaType', 'version', 'sha256', 'uri', 'path']), path, issues);
    const id = readIdentifier(requireField(candidate, 'id', path, issues), `${path}.id`, issues);
    registerId(id, `${path}.id`, registry, issues);
    readMediaType(requireField(candidate, 'mediaType', path, issues), `${path}.mediaType`, issues);
    readNonEmptyString(requireField(candidate, 'version', path, issues), `${path}.version`, issues);
    readSha256(requireField(candidate, 'sha256', path, issues), `${path}.sha256`, issues);

    const hasPath = hasOwn(candidate, 'path');
    if (!hasPath) {
      issues.push(createIssue('unverifiable-dependency', `${path}.path`, 'A dependency needs local package bytes at path; a URI is not fetched for SHA-256 verification.'));
    } else {
      const dependencyPath = readPath(candidate.path, `${path}.path`, issues);
      registerPath(dependencyPath, `${path}.path`, registry, issues);
    }
    if (hasOwn(candidate, 'uri')) readNonEmptyString(candidate.uri, `${path}.uri`, issues);
  });
};

const validateRevisions = (value: JsonRecord, issues: ProjectFormatValidationIssue[], registry: IdentifierRegistry): void => {
  const path = '$.revisions';
  rejectUnknownFields(value, new Set(['currentRevisionId', 'entries']), path, issues);
  const currentRevisionId = readIdentifier(requireField(value, 'currentRevisionId', path, issues), `${path}.currentRevisionId`, issues);
  const entries = readArray(value, 'entries', path, issues);
  const revisionIds = new Set<string>();
  if (entries === undefined || entries.length === 0) {
    if (entries !== undefined) issues.push(createIssue('invalid-field', `${path}.entries`, 'At least one revision entry is required.'));
    return;
  }
  entries.forEach((candidate, index) => {
    const entryPath = `${path}.entries[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(createIssue('invalid-field', entryPath, 'Expected a revision entry object.'));
      return;
    }
    rejectUnknownFields(candidate, new Set(['id', 'createdAt', 'summary', 'parentId']), entryPath, issues);
    const id = readIdentifier(requireField(candidate, 'id', entryPath, issues), `${entryPath}.id`, issues);
    registerId(id, `${entryPath}.id`, registry, issues);
    if (id !== undefined) revisionIds.add(id);
    readTimestamp(requireField(candidate, 'createdAt', entryPath, issues), `${entryPath}.createdAt`, issues);
    readNonEmptyString(requireField(candidate, 'summary', entryPath, issues), `${entryPath}.summary`, issues);
    if (hasOwn(candidate, 'parentId')) readIdentifier(candidate.parentId, `${entryPath}.parentId`, issues);
  });
  if (currentRevisionId !== undefined && !revisionIds.has(currentRevisionId)) {
    issues.push(createIssue('invalid-field', `${path}.currentRevisionId`, 'The current revision must name an entry in revisions.entries.'));
  }
  entries.forEach((candidate, index) => {
    if (!isRecord(candidate) || !hasOwn(candidate, 'parentId') || typeof candidate.parentId !== 'string') return;
    if (!revisionIds.has(candidate.parentId)) {
      issues.push(createIssue('invalid-field', `${path}.entries[${index}].parentId`, 'The parent revision must name an entry in revisions.entries.'));
    }
  });
};

const validatePayloads = (
  values: readonly unknown[] | undefined,
  coordinateContextIds: ReadonlySet<string>,
  issues: ProjectFormatValidationIssue[],
  registry: IdentifierRegistry,
): void => {
  if (values === undefined) return;
  values.forEach((candidate, index) => {
    const path = `$.payloads[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(createIssue('invalid-field', path, 'Expected a payload reference object.'));
      return;
    }
    rejectUnknownFields(candidate, new Set(['id', 'path', 'mediaType', 'sha256', 'coordinateContextId']), path, issues);
    const id = readIdentifier(requireField(candidate, 'id', path, issues), `${path}.id`, issues);
    registerId(id, `${path}.id`, registry, issues);
    const filePath = readPath(requireField(candidate, 'path', path, issues), `${path}.path`, issues);
    registerPath(filePath, `${path}.path`, registry, issues);
    readMediaType(requireField(candidate, 'mediaType', path, issues), `${path}.mediaType`, issues);
    readSha256(requireField(candidate, 'sha256', path, issues), `${path}.sha256`, issues);
    if (hasOwn(candidate, 'coordinateContextId')) {
      const contextId = readIdentifier(candidate.coordinateContextId, `${path}.coordinateContextId`, issues);
      if (contextId !== undefined && !coordinateContextIds.has(contextId)) {
        issues.push(createIssue('invalid-field', `${path}.coordinateContextId`, 'Payload coordinateContextId must name a declared coordinate context.'));
      }
    }
  });
};

const validateAssets = (values: readonly unknown[] | undefined, issues: ProjectFormatValidationIssue[], registry: IdentifierRegistry): void => {
  if (values === undefined) return;
  values.forEach((candidate, index) => {
    const path = `$.assets[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(createIssue('invalid-field', path, 'Expected an asset descriptor object.'));
      return;
    }
    rejectUnknownFields(candidate, new Set(['id', 'path', 'mediaType', 'sha256']), path, issues);
    const id = readIdentifier(requireField(candidate, 'id', path, issues), `${path}.id`, issues);
    registerId(id, `${path}.id`, registry, issues);
    const filePath = readPath(requireField(candidate, 'path', path, issues), `${path}.path`, issues);
    registerPath(filePath, `${path}.path`, registry, issues);
    readMediaType(requireField(candidate, 'mediaType', path, issues), `${path}.mediaType`, issues);
    readSha256(requireField(candidate, 'sha256', path, issues), `${path}.sha256`, issues);
  });
};

const validateExtensions = (values: readonly unknown[] | undefined, issues: ProjectFormatValidationIssue[], registry: IdentifierRegistry): void => {
  if (values === undefined) return;
  values.forEach((candidate, index) => {
    const path = `$.extensions[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(createIssue('invalid-field', path, 'Expected an extension descriptor object.'));
      return;
    }
    rejectUnknownFields(candidate, new Set(['id', 'path', 'mediaType', 'sha256', 'required']), path, issues);
    const id = readIdentifier(requireField(candidate, 'id', path, issues), `${path}.id`, issues);
    registerId(id, `${path}.id`, registry, issues);
    const filePath = readPath(requireField(candidate, 'path', path, issues), `${path}.path`, issues);
    registerPath(filePath, `${path}.path`, registry, issues);
    readMediaType(requireField(candidate, 'mediaType', path, issues), `${path}.mediaType`, issues);
    readSha256(requireField(candidate, 'sha256', path, issues), `${path}.sha256`, issues);
    if (typeof requireField(candidate, 'required', path, issues) !== 'boolean') {
      issues.push(createIssue('invalid-field', `${path}.required`, 'Expected a boolean.'));
    }
  });
};

/** Validates only the neutral envelope; referenced domain files are not parsed or interpreted. */
const validateProjectFormatManifestContents = (value: unknown): ProjectFormatValidationReport => {
  const issues: ProjectFormatValidationIssue[] = [];
  if (!isRecord(value)) return createReport([createIssue('malformed-manifest', '$', 'Expected a JSON object manifest.')]);

  rejectUnknownFields(value, ROOT_FIELDS, '$', issues);
  const formatVersion = requireField(value, 'formatVersion', '$', issues);
  if (formatVersion !== PROJECT_FORMAT_VERSION) {
    issues.push(createIssue('unsupported-format-version', '$.formatVersion', `Expected formatVersion ${PROJECT_FORMAT_VERSION}.`));
  }
  const mediaType = readMediaType(requireField(value, 'mediaType', '$', issues), '$.mediaType', issues);
  if (mediaType !== undefined && mediaType !== PROJECT_FORMAT_MEDIA_TYPE) {
    issues.push(createIssue('invalid-field', '$.mediaType', `Expected ${PROJECT_FORMAT_MEDIA_TYPE}.`));
  }

  const registry: IdentifierRegistry = { ids: new Map(), paths: new Map() };
  const project = readRecord(value, 'project', '$', issues);
  if (project !== undefined) validateProjectIdentity(project, issues, registry);
  const defaultUnits = readRecord(value, 'defaultUnits', '$', issues);
  if (defaultUnits !== undefined) validateDefaultUnits(defaultUnits, issues);
  const coordinateContexts = validateCoordinateContexts(readArray(value, 'coordinateContexts', '$', issues), issues, registry);
  const producer = readRecord(value, 'producer', '$', issues);
  if (producer !== undefined) validateProducer(producer, issues, registry);
  const schema = readRecord(value, 'schema', '$', issues);
  if (schema !== undefined) validateSchema(schema, issues);
  validateDependencies(readArray(value, 'dependencies', '$', issues), issues, registry);
  const revisions = readRecord(value, 'revisions', '$', issues);
  if (revisions !== undefined) validateRevisions(revisions, issues, registry);
  validatePayloads(readArray(value, 'payloads', '$', issues), coordinateContexts, issues, registry);
  validateAssets(readArray(value, 'assets', '$', issues), issues, registry);
  validateExtensions(readArray(value, 'extensions', '$', issues), issues, registry);

  return createReport(issues);
};

export const validateProjectFormatManifest = (value: unknown): ProjectFormatValidationReport => {
  try {
    const inspection = inspectProjectFormatJson(value);
    if (!inspection.ok) {
      return createReport([createIssue('non-serializable-json', inspection.path, inspection.message)]);
    }
    return validateProjectFormatManifestContents(value);
  } catch {
    return createReport([createIssue('malformed-manifest', '$', 'Manifest could not be safely inspected.')]);
  }
};

const getHashedFileReferences = (manifest: ProjectFormatManifest): readonly HashedFileReference[] => [
  ...manifest.payloads,
  ...manifest.assets,
  ...manifest.extensions,
  ...manifest.dependencies,
].map((descriptor) => ({ path: descriptor.path, sha256: descriptor.sha256 }));

const isNativeFileMap = (value: unknown): value is ReadonlyMap<string, Uint8Array> => value instanceof Map;

const cloneFiles = (files: ReadonlyMap<string, Uint8Array>): Map<string, Uint8Array> => {
  const clone = new Map<string, Uint8Array>();
  for (const [path, bytes] of files) clone.set(path, new Uint8Array(bytes));
  return clone;
};

/** Takes the byte snapshot used by read/write before any asynchronous hash work. */
const snapshotFiles = (value: unknown): ProjectFormatOperationResult<Map<string, Uint8Array>> => {
  try {
    if (!isNativeFileMap(value)) {
      return failure([createIssue('malformed-package', '$.files', 'Expected a Map of package paths to Uint8Array bytes.')]);
    }
    const issues: ProjectFormatValidationIssue[] = [];
    for (const [path, bytes] of value) {
      if (typeof path !== 'string') issues.push(createIssue('malformed-package', '$.files', 'Package file paths must be strings.'));
      if (!(bytes instanceof Uint8Array)) issues.push(createIssue('malformed-package', '$.files', 'Package file content must be Uint8Array bytes.'));
    }
    if (issues.length > 0) return failure(issues);
    return success(cloneFiles(value));
  } catch {
    return failure([createIssue('malformed-package', '$.files', 'Package files could not be safely copied.')]);
  }
};

const validateFiles = async (manifest: ProjectFormatManifest, files: ReadonlyMap<string, Uint8Array>): Promise<ProjectFormatValidationReport> => {
  const issues = [...validateProjectFormatManifest(manifest).issues];
  if (issues.length > 0) return createReport(issues);

  const references = getHashedFileReferences(manifest);
  const referencedPaths = new Set(references.map((reference) => reference.path));
  for (const reference of references) {
    const bytes = files.get(reference.path);
    if (bytes === undefined) {
      issues.push(createIssue('missing-file', `$.files[${JSON.stringify(reference.path)}]`, 'A manifest descriptor references a file that is not present.'));
      continue;
    }
    if (!(bytes instanceof Uint8Array)) {
      issues.push(createIssue('malformed-package', `$.files[${JSON.stringify(reference.path)}]`, 'Package file content must be Uint8Array bytes.'));
      continue;
    }
    try {
      if (await createProjectFormatSha256(bytes) !== reference.sha256) {
        issues.push(createIssue('sha256-mismatch', `$.files[${JSON.stringify(reference.path)}]`, 'File bytes do not match the manifest SHA-256.'));
      }
    } catch {
      issues.push(createIssue('hash-verification-unavailable', `$.files[${JSON.stringify(reference.path)}]`, 'File SHA-256 could not be verified in this environment.'));
    }
  }

  for (const [path, bytes] of files) {
    if (typeof path !== 'string' || !isSafeProjectFormatPath(path)) {
      issues.push(createIssue('unsafe-path', '$.files', 'Package contains an unsafe file path.'));
    }
    if (!(bytes instanceof Uint8Array)) {
      issues.push(createIssue('malformed-package', '$.files', 'Package file content must be Uint8Array bytes.'));
    }
    if (!referencedPaths.has(path)) {
      issues.push(createIssue('unreferenced-file', '$.files', 'Package contains a file not declared by the manifest.'));
    }
  }
  return createReport(issues);
};

/** Validates a manifest plus its raw referenced files without parsing domain payload content. */
export const validateProjectFormatPackage = async (manifest: unknown, files: unknown): Promise<ProjectFormatValidationReport> => {
  try {
    const manifestReport = validateProjectFormatManifest(manifest);
    if (!manifestReport.ok) return manifestReport;
    if (!isNativeFileMap(files)) return createReport([createIssue('malformed-package', '$.files', 'Expected a Map of package paths to Uint8Array bytes.')]);
    return await validateFiles(manifest as ProjectFormatManifest, files);
  } catch {
    return createReport([createIssue('malformed-package', '$', 'Package could not be safely validated.')]);
  }
};

/**
 * Reads a manifest and raw files through a copy-on-read boundary. It neither
 * interprets opaque extensions nor opens ZIP archives.
 */
export const readProjectFormatPackage = async (manifestBytes: unknown, files: unknown): Promise<ProjectFormatOperationResult<ProjectFormatPackage>> => {
  try {
    if (!(manifestBytes instanceof Uint8Array)) {
      return failure([createIssue('malformed-manifest', '$', 'Manifest bytes must be Uint8Array.')]);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes));
    } catch {
      return failure([createIssue('malformed-manifest', '$', 'Manifest bytes must contain valid UTF-8 JSON.')]);
    }
    try {
      const canonicalization = canonicalizeProjectFormatJson(parsed);
      if (!canonicalization.ok) {
        return failure([createIssue(canonicalization.issue.code, canonicalization.issue.path, canonicalization.issue.message)]);
      }
      const canonicalManifest = JSON.parse(canonicalization.value) as ProjectFormatManifest;
      const fileSnapshot = snapshotFiles(files);
      if (!fileSnapshot.ok) return failure(fileSnapshot.report.issues);
      const report = await validateProjectFormatPackage(canonicalManifest, fileSnapshot.value);
      if (!report.ok) return failure(report.issues);
      return success({ manifest: canonicalManifest, files: fileSnapshot.value });
    } catch {
      return failure([createIssue('non-serializable-json', '$', 'Manifest cannot be canonicalized as JSON.')]);
    }
  } catch {
    return failure([createIssue('malformed-package', '$', 'Package could not be safely read.')]);
  }
};

/**
 * Produces canonical manifest bytes and fresh byte copies. Persistence owns the
 * final temp-file/replace step so read-only targets can fall back safely.
 */
export const writeProjectFormatPackage = async (value: unknown): Promise<ProjectFormatOperationResult<SerializedProjectFormatPackage>> => {
  try {
    if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, 'manifest') || !Object.prototype.hasOwnProperty.call(value, 'files')) {
      return failure([createIssue('malformed-package', '$', 'Expected a manifest and a Map of package files.')]);
    }
    let manifestText: string;
    let manifestSnapshot: unknown;
    try {
      const canonicalization = canonicalizeProjectFormatJson(value.manifest);
      if (!canonicalization.ok) {
        return failure([createIssue(canonicalization.issue.code, canonicalization.issue.path, canonicalization.issue.message)]);
      }
      manifestText = canonicalization.value;
      manifestSnapshot = JSON.parse(manifestText);
    } catch {
      return failure([createIssue('non-serializable-json', '$', 'Manifest cannot be canonicalized as JSON.')]);
    }
    const fileSnapshot = snapshotFiles(value.files);
    if (!fileSnapshot.ok) return failure(fileSnapshot.report.issues);
    const report = await validateProjectFormatPackage(manifestSnapshot, fileSnapshot.value);
    if (!report.ok) return failure(report.issues);
    return success({
      manifestBytes: new TextEncoder().encode(manifestText),
      files: fileSnapshot.value,
    });
  } catch {
    return failure([createIssue('malformed-package', '$', 'Package could not be safely written.')]);
  }
};

const compareFormatVersions = (left: string, right: string): number | undefined => {
  const leftMatch = /^(\d+)\.(\d+)$/.exec(left);
  const rightMatch = /^(\d+)\.(\d+)$/.exec(right);
  if (!leftMatch || !rightMatch) return undefined;
  const [leftMajor, leftMinor] = [Number(leftMatch[1]), Number(leftMatch[2])];
  const [rightMajor, rightMinor] = [Number(rightMatch[1]), Number(rightMatch[2])];
  if (leftMajor !== rightMajor) return leftMajor - rightMajor;
  return leftMinor - rightMinor;
};

/** Current v0.1 has no destructive downgrade path; callers must use an explicit external adapter. */
export const migrateProjectFormatManifest = (manifest: unknown, targetVersion: string): ProjectFormatOperationResult<ProjectFormatManifest> => {
  try {
    const canonicalization = canonicalizeProjectFormatJson(manifest);
    if (!canonicalization.ok) {
      return failure([createIssue(canonicalization.issue.code, canonicalization.issue.path, canonicalization.issue.message)]);
    }
    const manifestSnapshot = JSON.parse(canonicalization.value) as ProjectFormatManifest;
    const report = validateProjectFormatManifest(manifestSnapshot);
    if (!report.ok) return failure(report.issues);
    if (targetVersion !== PROJECT_FORMAT_VERSION) {
      const comparison = compareFormatVersions(targetVersion, PROJECT_FORMAT_VERSION);
      const code = comparison !== undefined && comparison < 0 ? 'unsupported-destructive-downgrade' : 'unsupported-target-version';
      return failure([createIssue(code, '$.formatVersion', `Project format ${PROJECT_FORMAT_VERSION} cannot be migrated to ${targetVersion}.`)]);
    }
    return success(manifestSnapshot);
  } catch {
    return failure([createIssue('malformed-manifest', '$', 'Manifest could not be safely migrated.')]);
  }
};
