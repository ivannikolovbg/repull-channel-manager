import type { Config } from 'tailwindcss';

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './core/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        repull: {
          DEFAULT: '#ff7a2b',
          50: '#fff4ed',
          100: '#ffe6d4',
          500: '#ff7a2b',
          600: '#f25f0a',
          700: '#c8470a',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
