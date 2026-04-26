"use client";

import { useEffect } from "react";

const STORAGE_KEY = "roofaid-last-viewed-prospect";
const HIGHLIGHT_CLASS = "prospect-row-flash";
const HIGHLIGHT_MS = 1600;

export function rememberLastViewedProspect(id: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // sessionStorage may be unavailable (private mode, quota); ignore.
  }
}

export function useRestoreLastViewedProspect(deps: ReadonlyArray<unknown> = []) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let id: string | null = null;
    try {
      id = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!id) return;

    const target = document.querySelector<HTMLElement>(
      `[data-prospect-id="${CSS.escape(id)}"]`,
    );
    if (!target) return;

    // Clear so we don't re-flash on subsequent re-renders within the same session.
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }

    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add(HIGHLIGHT_CLASS);
    const timer = window.setTimeout(() => {
      target.classList.remove(HIGHLIGHT_CLASS);
    }, HIGHLIGHT_MS);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
