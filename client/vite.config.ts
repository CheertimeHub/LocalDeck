import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5199,
    proxy: {
      '/api': 'http://localhost:4600',
      '/ws': { target: 'ws://localhost:4600', ws: true },
    },
  },
})
