/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        fit: {
          bg: "#12141c",
          card: "#1a1d28",
          border: "#2a3040",
          accent: "#22c55e",
          muted: "#8b929e",
          highlight: "#0d4a2b",
        },
      },
      fontFamily: {
        sans: ["system-ui", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "Cascadia Code", "monospace"],
      },
    },
  },
  plugins: [],
};
