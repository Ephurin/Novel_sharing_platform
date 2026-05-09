/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "#04050f",
        deep: "#070a1a",
        panel: "#0a0d1f",
        surface: "#0f1225",
        raised: "#141730",
        primary: "#38bdf8",
        sky: "#38bdf8",
        violet: "#818cf8",
        rose: "#fb7185",
        amber: "#fbbf24",
        "text-bright": "#f1f5f9",
        "text-mid": "#94a3b8",
        "text-dim": "#475569",
      },
      fontFamily: {
        sans: ['"DM Sans"', "sans-serif"],
        serif: ["Lora", "serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
    },
  },
  plugins: [],
}
