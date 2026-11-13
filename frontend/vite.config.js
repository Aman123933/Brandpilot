import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiProxy = {
  '/auth': 'http://127.0.0.1:8000',
  '/facts': 'http://127.0.0.1:8000',
  '/guidelines': 'http://127.0.0.1:8000',
  '/assets': 'http://127.0.0.1:8000',
  '/findings': 'http://127.0.0.1:8000',
  '/reviews': 'http://127.0.0.1:8000',
  '/passports': 'http://127.0.0.1:8000',
  '/notifications': 'http://127.0.0.1:8000',
  '/admin': 'http://127.0.0.1:8000',
  '/insights': 'http://127.0.0.1:8000',
  '/cron': 'http://127.0.0.1:8000',
  '/health': 'http://127.0.0.1:8000',
}

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
    proxy: apiProxy,
  },
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
