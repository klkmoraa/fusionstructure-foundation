import { readFileSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { cacheNameFor, createServiceWorkerSource } from './scripts/pwa-shell-source.mjs';

// Provenance stamped on exported documents must come from the package, never from a
// literal someone has to remember to bump.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

const collectBuildFiles = async (relative = ''): Promise<string[]> => {
  const directory = new URL(`./dist/${relative}`, import.meta.url);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    return entry.isDirectory() ? collectBuildFiles(child) : [child];
  }));
  return files.flat();
};

const pwaShellPlugin = () => ({
  name: 'fusionstructure-pwa-shell',
  async closeBundle() {
    const files = (await collectBuildFiles()).filter((file) => file !== 'sw.js' && !file.endsWith('.map')).sort();
    const digest = createHash('sha256');
    for (const file of files) {
      digest.update(file);
      digest.update(await readFile(new URL(`./dist/${file}`, import.meta.url)));
    }
    const release = digest.digest('hex').slice(0, 16);
    const assets = files.map((file) => `./${file}`);
    const source = createServiceWorkerSource({ cacheName: cacheNameFor(release), assets });
    await writeFile(new URL('./dist/sw.js', import.meta.url), source, 'utf8');
  },
});

export default defineConfig({
  plugins: [react(), pwaShellPlugin()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  test: {
    setupFiles: ['src/i18n/testCatalogSetup.ts'],
    // La puerta de calidad sólo observa el producto: nada de copias, respaldos
    // ni árboles de trabajo que puedan vivir junto a `src/`.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // El entorno por defecto es Node. Una prueba que necesite DOM lo pide en su
    // propia cabecera con `// @vitest-environment jsdom`, que es explícito y no
    // depende de que el nombre del archivo acierte con un glob.
    environment: 'node',
  },
});
