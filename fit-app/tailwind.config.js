/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        fit: {
          bg: "#0c0d10",
          panel: "#12141a",
          card: "#15171e",
          border: "#242833",
          ink: "#0a0b0e",
          muted: "#8b929e",
          accent: "#a3ff33",
          accentDim: "#7bc819",
          highlight: "#1a2615",
          glow: "rgba(163, 255, 51, 0.35)",
        },
      },
      fontFamily: {
        sans: ["'Segoe UI'", "system-ui", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "Consolas", "monospace"],
      },
      boxShadow: {
        neon: "0 0 24px rgba(163, 255, 51, 0.12), inset 0 1px 0 rgba(163,255,51,0.08)",
        card: "0 4px 24px rgba(0, 0, 0, 0.35)",
      },
    },
  },
  plugins: [],
};
