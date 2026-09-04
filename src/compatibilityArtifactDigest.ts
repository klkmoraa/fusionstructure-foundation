/**
 * Digest reproducible para los artefactos de corpus de compatibilidad.
 *
 * `sha256-eol-lf-normalized-bytes-v1` convierte CRLF y CR aislado a LF antes
 * de calcular SHA-256; deja todos los demás bytes intactos. Así el checksum
 * representa el contenido del artefacto y no la materialización que el Git
 * local elija para los finales de línea.
 */
import { createHash } from 'node:crypto';

export const COMPATIBILITY_ARTIFACT_DIGEST_ALGORITHM = 'sha256-eol-lf-normalized-bytes-v1' as const;

export const canonicalizeCompatibilityArtifactBytes = (bytes: Uint8Array): Uint8Array => {
  const canonical = new Uint8Array(bytes.length);
  let write = 0;
  for (let read = 0; read < bytes.length; read += 1) {
    if (bytes[read] === 0x0d) {
      canonical[write] = 0x0a;
      write += 1;
      if (bytes[read + 1] === 0x0a) read += 1;
      continue;
    }
    canonical[write] = bytes[read];
    write += 1;
  }
  return canonical.slice(0, write);
};

export const digestCompatibilityArtifact = (bytes: Uint8Array): string =>
  createHash('sha256').update(canonicalizeCompatibilityArtifactBytes(bytes)).digest('hex');
