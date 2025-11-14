import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'src',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/frontend'),
      '@components': resolve(__dirname, 'src/frontend/components'),
      '@utils': resolve(__dirname, 'src/frontend/utils'),
      '@styles': resolve(__dirname, 'src/frontend/styles'),
      '@assets': resolve(__dirname, 'src/frontend/assets')
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      }
    }
  }
})
