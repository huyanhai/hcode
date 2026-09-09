import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'
import packageJson from './package.json' with { type: 'json' }

export default defineConfig(({ command, mode }) => ({
  base: './',
  plugins: [
    vue(),
    tailwindcss(),
    mode !== 'web' && electron({
      main: {
        async onstart({ startup }) {
          await startup(['.'])
        },
        vite: {
          build: {
            outDir: 'dist/main',
            emptyOutDir: true,
            target: 'node22',
            sourcemap: command === 'serve',
            rolldownOptions: {
              input: 'electron/main.ts',
              output: { format: 'cjs', entryFileNames: '[name].cjs' },
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        async onstart({ startup }) {
          await startup(['.'])
        },
        vite: {
          build: {
            outDir: 'dist/preload',
            emptyOutDir: true,
            target: 'node22',
            sourcemap: command === 'serve',
            rolldownOptions: {
              output: { entryFileNames: '[name].cjs' },
            },
          },
        },
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
}))
