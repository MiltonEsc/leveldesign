import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev we proxy OpenAI calls through Vite to avoid browser CORS issues.
// The Authorization header (Bearer key) is sent from the client and forwarded as-is.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/openai/, ''),
      },
    },
  },
})
