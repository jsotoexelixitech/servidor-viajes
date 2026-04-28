/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta oficial — Manual de Identidad La Mundial de Seguros
        brand: {
          50:  '#eaf1fb',
          100: '#d2dff5',
          200: '#a6c0e9',
          300: '#7aa1de',
          400: '#4a8dd5', // Azul claro logo
          500: '#2e6dbf', // Azul brillante logo
          600: '#162a7f', // Pennsylvania claro
          700: '#0f1a5a', // Pennsylvania principal
          800: '#0b1547',
          900: '#091133', // Pennsylvania oscuro
          950: '#050a22',
        },
        accent: {
          50:  '#ffeded',
          100: '#ffd7d8',
          200: '#ffb1b3',
          300: '#ff8a8d',
          400: '#ff6675', // Imperial claro
          500: '#e84f51', // Imperial principal
          600: '#c63a3c',
          700: '#a02a2c',
          800: '#7a1f21',
          900: '#5a1517',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
