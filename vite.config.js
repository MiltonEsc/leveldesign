import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev we proxy AI calls through Vite to avoid browser CORS issues.
// The auth headers (x-goog-api-key / Authorization) are forwarded as-is.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Isolate pixi.js (the bulk of the bundle) into its own chunk so it can
        // be loaded lazily with the Levels view instead of at app startup.
        manualChunks: {
          pixi: ['pixi.js', '@pixi/react', '@pixi/tilemap'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/gemini': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/gemini/, ''),
      },
      '/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/openai/, ''),
      },
    },
  },
})
