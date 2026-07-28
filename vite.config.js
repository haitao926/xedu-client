import { defineConfig } from 'vite'
import { cpSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const rendererPort = Number.parseInt(process.env.XEDU_RENDERER_PORT || '3002', 10) || 3002
const rendererAssetDir = resolve(__dirname, 'renderer/assets')
const buildAssetDir = resolve(__dirname, 'build/assets')
const devApiCapability = process.env.XEDU_CLIENT_CAPABILITY || 'xedu-dev-capability'

export default defineConfig(({ command }) => ({
  root: 'renderer',
  base: './',
  define: command === 'serve'
    ? {
        'import.meta.env.VITE_XEDU_CLIENT_CAPABILITY': JSON.stringify(devApiCapability),
      }
    : undefined,
  plugins: [
    {
      name: 'copy-renderer-static-assets',
      closeBundle() {
        mkdirSync(buildAssetDir, { recursive: true })
        cpSync(rendererAssetDir, buildAssetDir, { recursive: true })
      }
    }
  ],
  build: {
    outDir: '../build',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'renderer/index.html')
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'renderer')
    }
  },
  server: {
    host: '127.0.0.1',
    port: rendererPort,
    strictPort: true,
    fs: {
      allow: [resolve(__dirname)],
    },
    cors: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5123',
        changeOrigin: true
      }
    }
  }
}))
