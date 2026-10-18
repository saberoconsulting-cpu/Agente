import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sabero: {
          navy: '#071A33',
          ink: '#0A1222',
          panel: '#0D2445',
          electric: '#1087FF',
          cyan: '#38D5FF',
          crimson: '#E11D35',
          line: '#D7E3F5',
          mist: '#F4F8FC',
        },
      },
      boxShadow: {
        enterprise: '0 22px 70px rgba(7, 26, 51, 0.18)',
        neon: '0 0 0 1px rgba(16, 135, 255, 0.25), 0 18px 44px rgba(16, 135, 255, 0.18)',
      },
    },
  },
  plugins: [],
};

export default config;
