import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      // Incluir específicamente los módulos que simple-peer necesita
      include: ['stream', 'buffer', 'events', 'util', 'process'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  define: {
    global: 'window',
  },
  server: {
    watch: {
      usePolling: true,
    },
    hmr: {
      overlay: true,
    }
  }
})
