import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/main.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  fixedExtension: false,
  dts: false,
  clean: true,
  deps: {
    neverBundle: ['electron'],
  },
})
