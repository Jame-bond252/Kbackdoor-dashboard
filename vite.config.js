import { defineConfig } from 'vite';

export default defineConfig({
  // ใช้ relative path เพื่อให้ deploy ที่ subpath หรือเปิดจาก static host ได้
  base: './',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
});
