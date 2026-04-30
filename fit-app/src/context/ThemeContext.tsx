import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { FitTheme } from "../lib/fitTheme";

export type { FitTheme } from "../lib/fitTheme";

const STORAGE_KEY = "fit-ui-theme";

export function readStoredTheme(): FitTheme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function applyFitTheme(theme: FitTheme) {
  document.documentElement.dataset.theme = theme;
}

const ThemeCtx = createContext<{
  theme: FitTheme;
  setTheme: (t: FitTheme) => void;
  toggleTheme: () => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<FitTheme>(() => readStoredTheme());

  useEffect(() => {
    applyFitTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = (t: FitTheme) => setThemeState(t);
  const toggleTheme = () => setThemeState((prev) => (prev === "dark" ? "light" : "dark"));

  return <ThemeCtx.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("useTheme must be used within ThemeProvider");
  return v;
}
