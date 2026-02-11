import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    chunkSizeWarningLimit: 950,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          motion: ['framer-motion'],
          query: ['@tanstack/react-query'],
          three: ['three'],
        },
      },
    },
  },
})
