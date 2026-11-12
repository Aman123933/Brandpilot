import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    assetsDir: 'static',
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:8000',
      '/facts': 'http://localhost:8000',
      '/guidelines': 'http://localhost:8000',
      '/assets': 'http://localhost:8000',
      '/findings': 'http://localhost:8000',
      '/reviews': 'http://localhost:8000',
      '/passports': 'http://localhost:8000',
      '/notifications': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
      '/insights': 'http://localhost:8000',
      '/cron': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    },
  },
})
