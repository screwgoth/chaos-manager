/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Allocation state palette. Over-allocation is deliberately distinct from
        // "full" so the two never read the same at a glance (U1-NFR-U-05).
        allocation: {
          free: '#4CAF50',
          partial: '#42A5F5',
          full: '#FB8C00',
          over: '#C62828',
        },
      },
    },
  },
  plugins: [],
};
