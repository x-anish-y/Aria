"use client";

/**
 * components/ThemeProvider.js — Class-based dark/light theme switching
 *
 * How it works:
 * 1. On mount, reads localStorage("aria-theme") or defaults to "dark".
 * 2. Sets data-theme attribute on <html> so CSS vars switch.
 * 3. Provides context so any component can toggle the theme.
 * 4. A blocking <script> in layout.js prevents FOUC (flash of unstyled content).
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/** @typedef {"dark" | "light"} Theme */

const ThemeCtx = createContext(/** @type {{ theme: Theme, toggle: () => void }} */ ({}));

const STORAGE_KEY = "aria-theme";

/**
 * ThemeProvider — wraps the app to provide theme context.
 * @param {{ children: React.ReactNode }} props
 */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(/** @type {Theme} */ ("dark"));

  // Read persisted theme on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      document.documentElement.setAttribute("data-theme", stored);
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <ThemeCtx.Provider value={{ theme, toggle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

/**
 * useTheme — access current theme and toggle function.
 * @returns {{ theme: Theme, toggle: () => void }}
 */
export function useTheme() {
  return useContext(ThemeCtx);
}
