/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        wood: {
          50: '#faf7f2',
          100: '#f5efe6',
          200: '#eaddc9',
          300: '#dcc2a3',
          400: '#cba378',
          500: '#bf8b5a',
          600: '#a67349',
          700: '#8b5f3d',
          800: '#735036',
          900: '#5e422f',
        }
      },
    },
  },
  plugins: [],
}