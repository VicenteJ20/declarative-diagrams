import { useCallback, useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";

const KEY = "dgm-theme";
const EVENT = "dgm-theme-change";

const canUseDOM = () => typeof window !== "undefined" && typeof document !== "undefined";

export function readThemePref(): ThemePref {
  if (!canUseDOM()) return "system";
  const attr = document.documentElement.dataset.themePref;
  if (attr === "light" || attr === "dark" || attr === "system") return attr;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
    const legacy = localStorage.getItem("dgm-ui");
    if (legacy === "light" || legacy === "dark") return legacy;
  } catch {
    /* private mode */
  }
  return "system";
}

export function systemMode(): "light" | "dark" {
  return canUseDOM() && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  return pref === "system" ? systemMode() : pref;
}

/** Set `<html data-theme>` and remember the choice. Does not notify the caller's own event listener twice. */
export function applyTheme(pref: ThemePref, persist = true) {
  if (!canUseDOM()) return;
  const mode = resolveTheme(pref);
  document.documentElement.dataset.themePref = pref;
  document.documentElement.dataset.theme = mode;
  if (persist) {
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* private mode */
    }
  }
  window.dispatchEvent(new CustomEvent<ThemePref>(EVENT, { detail: pref }));
}

/** Reads the preference and keeps “system” in sync with the OS while it is selected. */
export function useThemePref(): readonly [ThemePref, (pref: ThemePref) => void] {
  const [pref, setPrefState] = useState<ThemePref>("system");

  useEffect(() => {
    setPrefState(readThemePref());
    const onPref = (event: Event) => setPrefState((event as CustomEvent<ThemePref>).detail);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      if (readThemePref() !== "system") return;
      document.documentElement.dataset.theme = systemMode();
      window.dispatchEvent(new CustomEvent<ThemePref>(EVENT, { detail: "system" }));
    };
    window.addEventListener(EVENT, onPref);
    media.addEventListener("change", onSystem);
    return () => {
      window.removeEventListener(EVENT, onPref);
      media.removeEventListener("change", onSystem);
    };
  }, []);

  const setPref = useCallback((next: ThemePref) => {
    applyTheme(next);
    setPrefState(next);
  }, []);

  return [pref, setPref] as const;
}
