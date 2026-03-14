import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: false,
  clean: true,
  external: ['react', 'react-dom'],
  treeshake: true,
  splitting: false,
  minify: false,
  // CSS 会被提取为 dist/index.css
  injectStyle: false,
});
