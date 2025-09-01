import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  format: ['esm'],
  external: [
    'dotenv', 
    '@elizaos/core',
    '@elizaos/plugin-safe',
    'fs',
    'path',
    'crypto',
    'http',
    'https',
    'url',
    'buffer',
    'events',
    'util',
    'stream'
  ],
  platform: 'node',
  target: 'node18',
  splitting: false,
  treeshake: true,
  dts: false, // Disable DTS generation to avoid TypeScript strict errors
  skipNodeModulesBundle: true,
});