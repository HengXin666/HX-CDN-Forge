import { defineConfig } from 'tsup';

export default defineConfig([
  // 浏览器端库 (主入口)
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: false,
    clean: true,
    external: ['react', 'react-dom'],
    treeshake: true,
    splitting: false,
    minify: false,
    // CSS 提取为 dist/index.css
    injectStyle: false,
  },
  // CLI 工具 (Node.js)
  {
    entry: ['src/cli/split.ts'],
    format: ['cjs'],
    dts: false,
    sourcemap: false,
    clean: false,
    platform: 'node',
    target: 'node16',
    banner: {
      js: '#!/usr/bin/env node',
    },
    external: ['fs', 'path', 'crypto'],
    treeshake: true,
    splitting: false,
    minify: false,
  },
]);
