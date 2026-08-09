"use client";

import * as React from "react";

/** "system" follows the OS setting live; the other two are explicit user choices. */
export type ThemeMode = "light" | "dark" | "system";
export type Accent = "graphite" | "blue" | "emerald" | "violet" | "amber" | "rose";

export const ACCENTS: Accent[] = ["graphite", "blue", "emerald", "violet", "amber", "rose"];

/** Swatch shown in the picker — matches the light-mode --primary of each accent in globals.css. */
export const ACCENT_SWATCH: Record<Accent, string> = {
  graphite: "oklch(0.205 0 0)",
  blue: "oklch(0.54 0.2 260)",
  emerald: "oklch(0.55 0.14 162)",
  violet: "oklch(0.53 0.22 295)",
  amber: "oklch(0.72 0.16 70)",
  rose: "oklch(0.57 0.21 15)",
};

export const THEME_MODE_KEY = "stride_theme_mode";
export const THEME_ACCENT_KEY = "stride_theme_accent";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  accent: Accent;
  setAccent: (accent: Accent) => void;
  /** What's actually on screen once "system" is resolved. */
  resolvedMode: "light" | "dark";
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyToDocument(mode: ThemeMode, accent: Accent): "light" | "dark" {
  const resolved = mode === "system" ? (prefersDark() ? "dark" : "light") : mode;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.accent = accent;
  // Keeps native form controls, scrollbars and the browser chrome in step.
  root.style.colorScheme = resolved;
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialised to the defaults the no-flash script in layout.tsx also assumes, so
  // server and first client render produce identical markup. The effect below then
  // re-reads what that script already put on <html>.
  const [mode, setModeState] = React.useState<ThemeMode>("system");
  const [accent, setAccentState] = React.useState<Accent>("graphite");
  const [resolvedMode, setResolvedMode] = React.useState<"light" | "dark">("light");

  React.useEffect(() => {
    const storedMode = window.localStorage.getItem(THEME_MODE_KEY) as ThemeMode | null;
    const storedAccent = window.localStorage.getItem(THEME_ACCENT_KEY) as Accent | null;
    const nextMode: ThemeMode =
      storedMode === "light" || storedMode === "dark" || storedMode === "system"
        ? storedMode
        : "system";
    const nextAccent: Accent =
      storedAccent && ACCENTS.includes(storedAccent) ? storedAccent : "graphite";

    setModeState(nextMode);
    setAccentState(nextAccent);
    setResolvedMode(applyToDocument(nextMode, nextAccent));
  }, []);

  // Only meaningful while on "system" — follows the OS flipping at sunset etc.
  React.useEffect(() => {
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolvedMode(applyToDocument("system", accent));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode, accent]);

  const setMode = React.useCallback(
    (next: ThemeMode) => {
      window.localStorage.setItem(THEME_MODE_KEY, next);
      setModeState(next);
      setResolvedMode(applyToDocument(next, accent));
    },
    [accent],
  );

  const setAccent = React.useCallback(
    (next: Accent) => {
      window.localStorage.setItem(THEME_ACCENT_KEY, next);
      setAccentState(next);
      setResolvedMode(applyToDocument(mode, next));
    },
    [mode],
  );

  const value = React.useMemo(
    () => ({ mode, setMode, accent, setAccent, resolvedMode }),
    [mode, setMode, accent, setAccent, resolvedMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
