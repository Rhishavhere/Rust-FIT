/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        fit: {
          bg: "rgb(var(--color-fit-bg) / <alpha-value>)",
          fg: "rgb(var(--color-fit-fg) / <alpha-value>)",
          fgSoft: "rgb(var(--color-fit-fg-soft) / <alpha-value>)",
          panel: "rgb(var(--color-fit-panel) / <alpha-value>)",
          card: "rgb(var(--color-fit-card) / <alpha-value>)",
          border: "rgb(var(--color-fit-border) / <alpha-value>)",
          ink: "rgb(var(--color-fit-ink) / <alpha-value>)",
          muted: "rgb(var(--color-fit-muted) / <alpha-value>)",
          accent: "rgb(var(--color-fit-accent) / <alpha-value>)",
          accentDim: "rgb(var(--color-fit-accent-dim) / <alpha-value>)",
          highlight: "rgb(var(--color-fit-highlight) / <alpha-value>)",
          onAccent: "rgb(var(--color-fit-on-accent) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["'Segoe UI'", "system-ui", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "Consolas", "monospace"],
      },
      boxShadow: {
        neon: "0 0 24px rgba(255, 255, 255, 0.06), inset 0 1px 0 rgba(255,255,255,0.1)",
        card: "0 4px 24px rgba(0, 0, 0, 0.35)",
      },
    },
  },
  plugins: [],
};
