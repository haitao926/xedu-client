import { defineConfig } from 'vite'
import { resolve } from 'path'

const rendererPort = Number.parseInt(process.env.XEDU_RENDERER_PORT || '3002', 10) || 3002

export default defineConfig({
  root: 'renderer',
  base: './',
  build: {
    outDir: '../build',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'renderer/index.html'),
        'blockly-workspace': resolve(__dirname, 'renderer/js/blockly-workspace.js')
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        manualChunks(id) {
          if (id.includes('/node_modules/blockly/')) {
            return 'blockly-vendor'
          }
          if (id.includes('/renderer/js/blockly/xeduhub-blocks.js')) {
            return 'blockly-xeduhub'
          }
          if (
            id.includes('/renderer/js/blockly/runtime-helpers.js') ||
            id.includes('/renderer/js/blockly/toolbox-utils.js') ||
            id.includes('/renderer/js/blockly/python-highlighter.js')
          ) {
            return 'blockly-runtime-core'
          }
          if (
            id.includes('/renderer/js/blockly/runtime-toolbox-ui.js') ||
            id.includes('/renderer/js/blockly/runtime-results.js') ||
            id.includes('/renderer/js/blockly/runtime-execution.js') ||
            id.includes('/renderer/js/blockly/runtime-toolbox-import.js') ||
            id.includes('/renderer/js/blockly/runtime-callbacks.js') ||
            id.includes('/renderer/js/blockly/runtime-bindings.js') ||
            id.includes('/renderer/js/blockly/sample-assets.js') ||
            id.includes('/renderer/js/blockly/runtime-appearance.js')
          ) {
            return 'blockly-runtime-ui'
          }
        }
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
})
