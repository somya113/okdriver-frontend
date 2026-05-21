import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy all /api/* calls to the backend during development
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // Proxy okDriver API calls to avoid CORS in development
      '/api/playback': {
        target: 'http://smart.okdriver.in:5000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
})
