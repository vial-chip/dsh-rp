import { defineConfig } from 'tsdown'

/** Build the data provider and its scoped and Host consumers. */
export default defineConfig({
  entry: ['lib/types/index.js', 'lib/types/runtime.js', 'lib/types/controller.js'],
  outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
  fixedExtension: false, dts: false, clean: false,
})
