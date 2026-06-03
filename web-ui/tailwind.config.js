/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg0: "#0d0f11",
        bg1: "#141618",
        bg2: "#1c1e21",
        bg3: "#242628",
        bg4: "#2c2e32",
        dim: "#2e3035", // Mapping border to dim so we don't conflict with core tailwind border utilities, but I will just name it "border-dim" in classes by using "dim"
        accent: "#3b82f6",
        "accent-dim": "#1d3a6e",
        green: "#22c55e",
        yellow: "#eab308",
        red: "#ef4444",
        purple: "#a855f7",
        "text-bright": "#e2e4e8",
        "text-mid": "#9ca3af",
        "text-dim": "#6b7280",
        // Fallbacks mapping to old names just in case
        void: "#0d0f11",
        panel: "#141618",
        surface: "#1c1e21",
        primary: "#3b82f6",
      },
      fontFamily: {
        sans: ["'Inter'", "system-ui", "sans-serif"],
        serif: ["Lora", "serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        }
      },
      animation: {
        blink: 'blink 1s step-end infinite',
      }
    },
  },
  plugins: [],
}
