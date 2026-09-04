export type ProjectFormatJsonInspection =
  | { readonly ok: true }
  | { readonly ok: false; readonly path: string; readonly message: string };

export interface ProjectFormatJsonIssue {
  readonly code: 'non-serializable-json';
  readonly path: string;
  readonly message: string;
}

export type ProjectFormatCanonicalizationResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly issue: ProjectFormatJsonIssue };

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isArrayIndex = (key: string, length: number): boolean => {
  if (!/^(0|[1-9]\d*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
};

const invalid = (path: string, message: string): ProjectFormatJsonInspection => ({ ok: false, path, message });

const inspectJson = (value: unknown, path: string, ancestors: Set<object>): ProjectFormatJsonInspection => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return { ok: true };
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { ok: true } : invalid(path, 'Non-finite numbers are not JSON-serializable.');
  }
  if (typeof value !== 'object') return invalid(path, 'Only JSON primitive values, arrays, and plain objects are serializable.');
  if (ancestors.has(value)) return invalid(path, 'Circular values are not JSON-serializable.');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (const key of Reflect.ownKeys(value)) {
        if (key === 'length') continue;
        if (typeof key !== 'string' || !isArrayIndex(key, value.length)) {
          return invalid(path, 'Sparse arrays and arrays with non-index properties are not JSON-serializable.');
        }
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor) return invalid(`${path}[${index}]`, 'Sparse arrays are not JSON-serializable.');
        if (!descriptor.enumerable || !('value' in descriptor)) {
          return invalid(`${path}[${index}]`, 'Array accessors are not JSON-serializable.');
        }
        const child = inspectJson(descriptor.value, `${path}[${index}]`, ancestors);
        if (!child.ok) return child;
      }
      return { ok: true };
    }

    if (!isPlainObject(value)) return invalid(path, 'Only plain JSON objects are serializable.');
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return invalid(path, 'Symbol object keys are not JSON-serializable.');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        return invalid(`${path}.${key}`, 'Object accessors and non-enumerable fields are not JSON-serializable.');
      }
      const child = inspectJson(descriptor.value, `${path}.${key}`, ancestors);
      if (!child.ok) return child;
    }
    return { ok: true };
  } finally {
    ancestors.delete(value);
  }
};

/** Inspects JSON representability without invoking getters or silently dropping values. */
export const inspectProjectFormatJson = (value: unknown): ProjectFormatJsonInspection => {
  try {
    return inspectJson(value, '$', new Set());
  } catch {
    return invalid('$', 'Value cannot be safely inspected as JSON.');
  }
};

const canonicalizeValidated = (value: unknown, path: string): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => canonicalizeValidated(item, `${path}[${index}]`)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeValidated(record[key], `${path}.${key}`)}`).join(',')}}`;
};

const canonicalizationFailure = (path: string, message: string): ProjectFormatCanonicalizationResult => ({
  ok: false,
  issue: { code: 'non-serializable-json', path, message },
});

/** Stable JSON serialization with a structured result for manifests and reproducible SHA-256 inputs. */
export const canonicalizeProjectFormatJson = (value: unknown): ProjectFormatCanonicalizationResult => {
  const inspection = inspectProjectFormatJson(value);
  if (!inspection.ok) return canonicalizationFailure(inspection.path, inspection.message);
  try {
    return { ok: true, value: canonicalizeValidated(value, '$') };
  } catch {
    return canonicalizationFailure('$', 'Value cannot be safely canonicalized as JSON.');
  }
};

/** SHA-256 over exact bytes. Callers choose whether those bytes are raw files or canonical JSON. */
export const createProjectFormatSha256 = async (bytes: Uint8Array): Promise<string> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto SHA-256 support is required for project-format validation.');

  const stableBytes = new Uint8Array(bytes.byteLength);
  stableBytes.set(bytes);
  const digest = await subtle.digest('SHA-256', stableBytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
