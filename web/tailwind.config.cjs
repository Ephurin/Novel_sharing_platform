// Same theme as the former browser CDN configuration.
const config = {
        darkMode: 'class',
        theme: {
          extend: {
            fontFamily: {
  "serif": [
    "\"Be Vietnam Pro\"",
    "system-ui",
    "sans-serif"
  ],
  "sans": [
    "\"Be Vietnam Pro\"",
    "system-ui",
    "sans-serif"
  ],
  "headline-lg": [
    "\"Be Vietnam Pro\"",
    "system-ui",
    "sans-serif"
  ],
  "headline-md": [
    "\"Be Vietnam Pro\"",
    "system-ui",
    "sans-serif"
  ],
  "headline-sm": [
    "\"Be Vietnam Pro\"",
    "system-ui",
    "sans-serif"
  ],
  "body-reading": [
    "\"Be Vietnam Pro\"",
    "system-ui",
    "sans-serif"
  ],
  "body-lg": [
    "\"Be Vietnam Pro\"",
    "system-ui",
    "sans-serif"
  ],
  "body-md": [
    "\"Be Vietnam Pro\"",
    "system-ui",
    "sans-serif"
  ],
  "label-md": [
    "\"Be Vietnam Pro\"",
    "system-ui",
    "sans-serif"
  ],
  "label-sm": [
    "\"Be Vietnam Pro\"",
    "system-ui",
    "sans-serif"
  ]
},
            colors: {
  'cover-fallback': 'var(--sc-cover-fallback)',
  ...Object.fromEntries([
    ['emerald', 'success'], ['green', 'success'], ['teal', 'success'],
    ['amber', 'warning'], ['yellow', 'warning'], ['red', 'danger'], ['rose', 'danger']
  ].map(([name, token]) => [name, Object.fromEntries([50,100,200,300,400,500,600,700,800,900,950].map(shade => [shade, 'var(--sc-' + token + (shade < 300 ? '-bg' : '') + ')']))])),
  "primary": {
    "50": "rgb(var(--sc-primary-soft-rgb) / <alpha-value>)",
    "100": "rgb(var(--sc-primary-soft-rgb) / <alpha-value>)",
    "200": "rgb(var(--sc-border-rgb) / <alpha-value>)",
    "300": "rgb(var(--sc-primary-rgb) / <alpha-value>)",
    "400": "rgb(var(--sc-primary-rgb) / <alpha-value>)",
    "500": "rgb(var(--sc-primary-rgb) / <alpha-value>)",
    "600": "rgb(var(--sc-primary-rgb) / <alpha-value>)",
    "700": "rgb(var(--sc-primary-hover-rgb) / <alpha-value>)",
    "800": "rgb(var(--sc-primary-text-rgb) / <alpha-value>)",
    "900": "rgb(var(--sc-text-rgb) / <alpha-value>)",
    "950": "rgb(var(--sc-text-rgb) / <alpha-value>)",
    "DEFAULT": "rgb(var(--sc-primary-rgb) / <alpha-value>)"
  },
  "primary-container": "rgb(var(--sc-primary-hover-rgb) / <alpha-value>)",
  "on-primary": "rgb(var(--sc-on-primary-rgb) / <alpha-value>)",
  "primary-fixed": "rgb(var(--sc-primary-soft-rgb) / <alpha-value>)",
  "primary-fixed-dim": "rgb(var(--sc-primary-soft-rgb) / <alpha-value>)",
  "on-primary-container": "rgb(var(--sc-primary-text-rgb) / <alpha-value>)",
  "secondary": "rgb(var(--sc-primary-text-rgb) / <alpha-value>)",
  "secondary-container": "rgb(var(--sc-border-rgb) / <alpha-value>)",
  "on-secondary": "rgb(var(--sc-surface-rgb) / <alpha-value>)",
  "on-secondary-container": "rgb(var(--sc-text-rgb) / <alpha-value>)",
  "tertiary": "rgb(var(--sc-muted-rgb) / <alpha-value>)",
  "tertiary-fixed": "rgb(var(--sc-bg-rgb) / <alpha-value>)",
  "on-tertiary": "rgb(var(--sc-surface-rgb) / <alpha-value>)",
  "surface": "rgb(var(--sc-bg-rgb) / <alpha-value>)",
  "surface-subtle": "rgb(var(--sc-subtle-rgb) / <alpha-value>)",
  "background": "rgb(var(--sc-bg-rgb) / <alpha-value>)",
  "surface-dim": "rgb(var(--sc-border-rgb) / <alpha-value>)",
  "surface-bright": "rgb(var(--sc-surface-rgb) / <alpha-value>)",
  "on-surface": "rgb(var(--sc-text-rgb) / <alpha-value>)",
  "on-surface-variant": "rgb(var(--sc-muted-rgb) / <alpha-value>)",
  "surface-container-lowest": "rgb(var(--sc-surface-rgb) / <alpha-value>)",
  "surface-container-low": "rgb(var(--sc-subtle-rgb) / <alpha-value>)",
  "surface-container": "rgb(var(--sc-bg-rgb) / <alpha-value>)",
  "surface-container-high": "rgb(var(--sc-border-rgb) / <alpha-value>)",
  "surface-container-highest": "rgb(var(--sc-border-rgb) / <alpha-value>)",
  "inverse-surface": "rgb(var(--sc-text-rgb) / <alpha-value>)",
  "inverse-on-surface": "rgb(var(--sc-surface-rgb) / <alpha-value>)",
  "outline": "rgb(var(--sc-muted-rgb) / <alpha-value>)",
  "outline-variant": "rgb(var(--sc-border-rgb) / <alpha-value>)",
  "success": "var(--sc-success)",
  "success-bg": "var(--sc-success-bg)",
  "warning": "var(--sc-warning)",
  "warning-bg": "var(--sc-warning-bg)",
  "danger": "var(--sc-danger)",
  "danger-bg": "var(--sc-danger-bg)",
  "error": "var(--sc-danger)",
  "error-container": "var(--sc-danger-bg)",
  "paper": "rgb(var(--sc-subtle-rgb) / <alpha-value>)",
  "cream": "rgb(var(--sc-bg-rgb) / <alpha-value>)",
  "stone": {
    "50": "rgb(var(--sc-subtle-rgb) / <alpha-value>)",
    "100": "rgb(var(--sc-bg-rgb) / <alpha-value>)",
    "200": "rgb(var(--sc-border-rgb) / <alpha-value>)",
    "300": "rgb(var(--sc-border-rgb) / <alpha-value>)",
    "400": "rgb(var(--sc-muted-rgb) / <alpha-value>)",
    "500": "rgb(var(--sc-muted-rgb) / <alpha-value>)",
    "600": "rgb(var(--sc-muted-rgb) / <alpha-value>)",
    "700": "rgb(var(--sc-text-rgb) / <alpha-value>)",
    "800": "rgb(var(--sc-text-rgb) / <alpha-value>)",
    "900": "rgb(var(--sc-text-rgb) / <alpha-value>)",
    "950": "rgb(var(--sc-text-rgb) / <alpha-value>)"
  }
},
            spacing: {
              'space-xs': '0.25rem',
              'space-sm': '0.5rem',
              'space-md': '1rem',
              'space-lg': '1.5rem',
              'space-xl': '2.5rem',
              'gutter': '1.5rem',
              'gutter-sm': '1rem',
              'gutter-lg': '2rem',
              'margin-sm': '1rem',
              'margin-lg': '3rem',
            }
          }
        }
      }
module.exports = { ...config, content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"], plugins: [require("@tailwindcss/forms"), require("@tailwindcss/container-queries")] };
