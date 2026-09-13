/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        myaos: {
          bg: '#f8fafc',
          surface: '#ffffff',
          border: '#e2e8f0',
          accent: '#5e5ce6',
        },
        mac: {
          base: '#f5f5f7',
          panel: '#ffffff',
          accent: '#007aff',
          purple: '#5e5ce6',
          peach: '#ff5e5e',
          text: '#1d1d1f',
          muted: '#86868b',
        }
      },
      boxShadow: {
        'mac-soft': '0 8px 30px rgba(0, 0, 0, 0.04)',
        'mac-deep': '0 20px 40px rgba(0, 0, 0, 0.08)',
        'mac-glow': '0 0 20px rgba(94, 92, 230, 0.15)',
        'mac-bevel': 'inset 0 1px 1px rgba(255, 255, 255, 0.9), 0 2px 8px rgba(0, 0, 0, 0.04)',
      }
    },
  },
  plugins: [],
};
