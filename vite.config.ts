import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'example',
  resolve: {
    alias: {
      // 让 example 中的 import '../src' 直接解析到源码
      '../src': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3001,
    open: true,
  },
});
