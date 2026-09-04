import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LEGACY_FSTRUCTURE_PORTABLE_FORMAT_VERSION,
  LEGACY_FSTRUCTURE_PORTABLE_PAYLOAD_MIME,
  PROJECT_FORMAT_MEDIA_TYPE,
  PROJECT_FORMAT_SCHEMA_MEDIA_TYPE,
  PROJECT_FORMAT_VERSION,
  canonicalizeProjectFormatJson,
  createProjectFormatSha256,
  inspectLegacyFStructurePortable,
  migrateProjectFormatManifest,
  readProjectFormatPackage,
  validateProjectFormatManifest,
  writeProjectFormatPackage,
  type ProjectFormatManifest,
} from './index';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const makeFixture = async () => {
  const payloadBytes = encoder.encode('{"domain":"kept outside the manifest"}');
  const assetBytes = new Uint8Array([0, 1, 2, 3, 255]);
  const unknownExtensionBytes = new Uint8Array([0, 255, 10, 13, 10, 42]);
  const files = new Map<string, Uint8Array>([
    ['payloads/analysis-reference.json', payloadBytes],
    ['assets/thumbnail.bin', assetBytes],
    ['extensions/vendor.opaque', unknownExtensionBytes],
  ]);

  const manifest: ProjectFormatManifest = {
    formatVersion: PROJECT_FORMAT_VERSION,
    mediaType: PROJECT_FORMAT_MEDIA_TYPE,
    project: {
      id: 'project-demo-001',
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    },
    defaultUnits: {
      length: 'm',
      force: 'kN',
    },
    coordinateContexts: [{
      id: 'global',
      handedness: 'right-handed',
      lengthUnit: 'm',
    }],
    producer: {
      id: 'example.neutral-producer',
      version: '0.1.0',
    },
    schema: {
      mediaType: PROJECT_FORMAT_SCHEMA_MEDIA_TYPE,
      uri: 'urn:fusionstructure:project-format:0.1',
    },
    dependencies: [{
      id: 'neutral-contract',
      mediaType: 'application/json',
      version: '0.1.0',
      sha256: await createProjectFormatSha256(encoder.encode('{"contract":"neutral"}')),
      uri: 'urn:example:neutral-contract:0.1',
    }],
    revisions: {
      currentRevisionId: 'revision-001',
      entries: [{
        id: 'revision-001',
        createdAt: '2026-09-03T00:00:00.000Z',
        summary: 'Initial neutral project envelope.',
      }],
    },
    payloads: [{
      id: 'analysis-reference',
      path: 'payloads/analysis-reference.json',
      mediaType: 'application/json',
      sha256: await createProjectFormatSha256(payloadBytes),
    }],
    assets: [{
      id: 'thumbnail',
      path: 'assets/thumbnail.bin',
      mediaType: 'application/octet-stream',
      sha256: await createProjectFormatSha256(assetBytes),
    }],
    extensions: [{
      id: 'vendor-opaque',
      path: 'extensions/vendor.opaque',
      mediaType: 'application/octet-stream',
      sha256: await createProjectFormatSha256(unknownExtensionBytes),
      required: false,
    }],
  };

  return { assetBytes, files, manifest, payloadBytes, unknownExtensionBytes };
};

describe('neutral project-format v0.1', () => {
  it('canonicalizes the same JSON value deterministically before hashing', async () => {
    const unordered = { z: ['two', { b: false, a: true }], a: 1 };
    const ordered = { a: 1, z: ['two', { a: true, b: false }] };

    expect(canonicalizeProjectFormatJson(unordered)).toBe('{"a":1,"z":["two",{"a":true,"b":false}]}');
    expect(await createProjectFormatSha256(encoder.encode('abc')))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await createProjectFormatSha256(encoder.encode(canonicalizeProjectFormatJson(unordered))))
      .toBe(await createProjectFormatSha256(encoder.encode(canonicalizeProjectFormatJson(ordered))));
  });

  it('preserves opaque extension bytes through validated read/write without embedding domain models', async () => {
    const { files, manifest, unknownExtensionBytes } = await makeFixture();
    const expectedExtensionBytes = new Uint8Array(unknownExtensionBytes);
    const report = validateProjectFormatManifest(manifest);
    expect(report).toEqual({ ok: true, issues: [] });

    const writtenInput = await writeProjectFormatPackage({ manifest, files });
    expect(writtenInput.ok).toBe(true);
    if (!writtenInput.ok) return;

    files.get('extensions/vendor.opaque')![0] = 99;
    expect(writtenInput.value.files.get('extensions/vendor.opaque')).toEqual(expectedExtensionBytes);

    const read = await readProjectFormatPackage(writtenInput.value.manifestBytes, writtenInput.value.files);
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    writtenInput.value.files.get('extensions/vendor.opaque')![1] = 99;
    expect(read.value.files.get('extensions/vendor.opaque')).toEqual(expectedExtensionBytes);

    const writtenOutput = await writeProjectFormatPackage(read.value);
    expect(writtenOutput.ok).toBe(true);
    if (!writtenOutput.ok) return;

    expect(writtenOutput.value.files.get('extensions/vendor.opaque')).toEqual(expectedExtensionBytes);
    expect(writtenOutput.value.files.get('extensions/vendor.opaque')).not.toBe(unknownExtensionBytes);
    expect(JSON.parse(decoder.decode(writtenOutput.value.manifestBytes))).not.toHaveProperty('model');
  });

  it('rejects malformed, embedded, unsafe, duplicate, and tampered input with structured findings', async () => {
    const { files, manifest } = await makeFixture();
    const malformed = {
      ...manifest,
      model: { nodes: [] },
      payloads: [
        ...manifest.payloads,
        { ...manifest.payloads[0], id: manifest.payloads[0].id, path: '../escape.json', sha256: 'not-a-hash' },
        { ...manifest.payloads[0], id: 'second-reference' },
      ],
    };
    const report = validateProjectFormatManifest(malformed);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'embedded-domain-payload',
      'duplicate-id',
      'duplicate-path',
      'unsafe-path',
      'invalid-sha256',
    ]));

    const tamperedFiles = new Map(files);
    tamperedFiles.set('assets/thumbnail.bin', new Uint8Array([9, 9, 9]));
    const serialized = await writeProjectFormatPackage({ manifest, files: tamperedFiles });
    expect(serialized.ok).toBe(false);
    expect(serialized.report.issues.map((issue) => issue.code)).toContain('sha256-mismatch');

    const parseFailure = await readProjectFormatPackage(encoder.encode('{'), files);
    expect(parseFailure.ok).toBe(false);
    expect(parseFailure.report.issues.map((issue) => issue.code)).toContain('malformed-manifest');
  });

  it('does not silently downgrade or rename the legacy 2D portable format', async () => {
    const { manifest } = await makeFixture();
    const downgrade = migrateProjectFormatManifest(manifest, '0.0');
    expect(downgrade.ok).toBe(false);
    expect(downgrade.report.issues.map((issue) => issue.code)).toContain('unsupported-destructive-downgrade');

    expect(LEGACY_FSTRUCTURE_PORTABLE_PAYLOAD_MIME).toBe('application/vnd.fusionstructure.project+json');
    expect(LEGACY_FSTRUCTURE_PORTABLE_FORMAT_VERSION).toBe(1);
    expect(LEGACY_FSTRUCTURE_PORTABLE_PAYLOAD_MIME).not.toBe(PROJECT_FORMAT_MEDIA_TYPE);
    expect(inspectLegacyFStructurePortable({
      mediaType: LEGACY_FSTRUCTURE_PORTABLE_PAYLOAD_MIME,
      formatVersion: LEGACY_FSTRUCTURE_PORTABLE_FORMAT_VERSION,
    })).toEqual({
      kind: 'legacy-2d-portable',
      migration: 'external-adapter-required',
    });
  });

  it('ships a Draft 2020-12 schema artifact matching the executable envelope', () => {
    const schemaPath = resolve(import.meta.dirname, '..', '..', 'schemas', 'project-format-0.1.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as {
      $schema: string;
      properties: Record<string, unknown>;
      required: string[];
    };

    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.properties.formatVersion).toBeDefined();
    expect(schema.required).toEqual(expect.arrayContaining([
      'project', 'defaultUnits', 'coordinateContexts', 'producer', 'schema', 'dependencies', 'revisions', 'payloads', 'assets', 'extensions',
    ]));
  });
});
