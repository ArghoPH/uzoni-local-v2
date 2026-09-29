/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        ink: {
          50:'#f6f7f9',100:'#eceef2',200:'#d5d9e2',300:'#b0b8c9',
          400:'#8590aa',500:'#65718f',600:'#505a76',700:'#424a60',
          800:'#3a4052',900:'#181b23',950:'#0e1016',
        },
        brand: {
          50:'#eef3ff',100:'#dbe5ff',200:'#bed0ff',300:'#95b1ff',
          400:'#6a88fb',500:'#4a64f3',600:'#3543e7',700:'#2b34cc',
          800:'#2830a5',900:'#283183',
        },
        pos: '#16a34a',
        neg: '#dc2626',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)',
        pop:  '0 10px 30px rgba(16,24,40,.12)',
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem' },
    },
  },
  plugins: [],
}
