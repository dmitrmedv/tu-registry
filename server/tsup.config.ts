import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // The shared workspace package ships TypeScript sources, so it must be bundled in.
  noExternal: ['@tu-registry/shared'],
});
