/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  theme: {
    extend: {
      // Colors will be aligned to Figma design tokens
      colors: {
        // Primary brand colors (to be updated from Figma)
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        // Neutral grays
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        },
      },
      // Spacing scale (to be aligned with Figma)
      spacing: {
        // Custom spacing tokens if needed
      },
      // Typography (to be aligned with Figma)
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Georgia', 'serif'],
        mono: ['Menlo', 'Monaco', 'monospace'],
      },
      fontSize: {
        // Custom font sizes if needed
      },
    },
  },
  plugins: [],
};
