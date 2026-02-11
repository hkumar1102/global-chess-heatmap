import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 0 0 1px rgba(148,163,184,0.22), 0 10px 30px rgba(0,0,0,0.45)',
      },
    },
  },
  plugins: [],
} satisfies Config

