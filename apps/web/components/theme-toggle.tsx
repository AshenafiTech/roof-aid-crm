"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = mounted ? (theme === "system" ? resolvedTheme : theme) : undefined;
  const isDark = current === "dark";

  function toggle() {
    setTheme(isDark ? "light" : "dark");
  }

  if (collapsed) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-9 w-9", className)}
        onClick={toggle}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {mounted && (isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />)}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "w-full justify-start gap-3 px-3 font-medium text-muted-foreground hover:text-foreground",
        className,
      )}
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {mounted ? (
        isDark ? (
          <>
            <Sun className="h-4 w-4" />
            <span>Light mode</span>
          </>
        ) : (
          <>
            <Moon className="h-4 w-4" />
            <span>Dark mode</span>
          </>
        )
      ) : (
        <>
          <Moon className="h-4 w-4" />
          <span>Theme</span>
        </>
      )}
    </Button>
  );
}
