import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.TICKMARK_DEV_API ?? 'https://tickmark.peterlits.me',
        changeOrigin: true,
      },
    },
  },
})
