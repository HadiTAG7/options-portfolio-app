"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

// Light/Dark switch. The theme is a class ("light" | "dark") on <html>;
// a no-flash script in the root layout sets it before paint from
// localStorage. This button reads that class via useSyncExternalStore
// (SSR-safe, no setState-in-effect) and flips it. All colors are CSS
// variables (globals.css), so the flip is instant and app-wide.
type Theme = "dark" | "light";

let listeners: Array<() => void> = [];

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
function getSnapshot(): Theme {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}
function getServerSnapshot(): Theme {
  return "dark";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // storage unavailable (private mode) — theme still applies this session
    }
    listeners.forEach((l) => l());
  }

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
      aria-label="تبديل مظهر الواجهة"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-emerald-300 ${className}`}
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
