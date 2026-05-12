import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const serverPort = Number(process.env.COOLDEV_SERVER_PORT ?? 3001)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
  },
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${serverPort}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
