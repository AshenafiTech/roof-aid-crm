"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const MIN_VISIBLE_MS = 400;
const HIDE_AFTER_DONE_MS = 250;
const SAFETY_MS = 8000;

function RouteProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const timers = useRef<{ tick?: number; hide?: number; safety?: number }>({});
  const startedAtRef = useRef<number | null>(null);
  const pendingDoneRef = useRef(false);
  const initialKey = useRef<string | null>(null);

  const clearTimers = () => {
    if (timers.current.tick !== undefined) {
      window.clearInterval(timers.current.tick);
      timers.current.tick = undefined;
    }
    if (timers.current.hide !== undefined) {
      window.clearTimeout(timers.current.hide);
      timers.current.hide = undefined;
    }
    if (timers.current.safety !== undefined) {
      window.clearTimeout(timers.current.safety);
      timers.current.safety = undefined;
    }
  };

  const finish = useCallback(() => {
    clearTimers();
    pendingDoneRef.current = false;
    startedAtRef.current = null;
    setProgress(100);
    timers.current.hide = window.setTimeout(() => {
      setActive(false);
      setProgress(0);
    }, HIDE_AFTER_DONE_MS);
  }, []);

  const requestDone = useCallback(() => {
    const startedAt = startedAtRef.current;
    if (startedAt == null) {
      // No active run; just flash a quick completion so the user
      // still gets feedback for programmatic / back-forward nav.
      setActive(true);
      setProgress(80);
      window.setTimeout(finish, 50);
      return;
    }
    const elapsed = Date.now() - startedAt;
    const remaining = MIN_VISIBLE_MS - elapsed;
    if (remaining > 0) {
      pendingDoneRef.current = true;
      window.setTimeout(() => {
        if (pendingDoneRef.current) finish();
      }, remaining);
      return;
    }
    finish();
  }, [finish]);

  const start = useCallback(() => {
    clearTimers();
    pendingDoneRef.current = false;
    startedAtRef.current = Date.now();
    setActive(true);
    setProgress(12);
    timers.current.tick = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        const inc = Math.max((90 - p) * 0.06, 0.4);
        return Math.min(p + inc, 90);
      });
    }, 200);
    timers.current.safety = window.setTimeout(finish, SAFETY_MS);
  }, [finish]);

  // Start the bar on internal link clicks.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const rawHref = anchor.getAttribute("href");
      if (!rawHref) return;
      if (
        rawHref.startsWith("#") ||
        rawHref.startsWith("mailto:") ||
        rawHref.startsWith("tel:") ||
        rawHref.startsWith("javascript:")
      ) {
        return;
      }
      if (anchor.hasAttribute("download")) return;
      const targetAttr = anchor.getAttribute("target");
      if (targetAttr && targetAttr !== "_self") return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }
      start();
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [start]);

  // Complete the bar when the URL settles.
  useEffect(() => {
    const key = `${pathname}?${searchParams?.toString() ?? ""}`;
    if (initialKey.current === null) {
      initialKey.current = key;
      return;
    }
    if (key === initialKey.current) return;
    initialKey.current = key;
    requestDone();
  }, [pathname, searchParams, requestDone]);

  useEffect(() => clearTimers, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0"
      style={{ height: 3, zIndex: 2147483647 }}
    >
      <div
        className="h-full bg-primary"
        style={{
          width: `${progress}%`,
          opacity: active ? 1 : 0,
          boxShadow:
            "0 0 10px var(--primary, currentColor), 0 0 6px var(--primary, currentColor)",
          transition: "width 220ms ease-out, opacity 250ms ease-out",
        }}
      />
    </div>
  );
}

export function RouteProgress() {
  // useSearchParams() requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <RouteProgressInner />
    </Suspense>
  );
}
