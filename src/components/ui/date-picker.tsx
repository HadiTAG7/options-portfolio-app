"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";

const DAY_LABELS_AR = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];
const MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toIso(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

interface DatePickerProps {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  id?: string;
}

export function DatePicker({
  value,
  onChange,
  disabled = false,
  placeholder = "اختر تاريخ",
  label,
  id,
}: DatePickerProps) {
  const parsed = value ? parseIso(value) : null;
  const today = new Date();

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsed?.y ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.m ?? today.getMonth());
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const recomputeCoords = useCallback(() => {
    const trig = triggerRef.current;
    if (!trig) return;
    const rect = trig.getBoundingClientRect();
    const popoverWidth = 288; // w-72
    const viewportPadding = 8;

    // Try placing below. If it would overflow vertically, place above.
    const popoverHeight = 320; // approximate; real height clipped by our max
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove =
      spaceBelow < popoverHeight + viewportPadding &&
      rect.top > popoverHeight + viewportPadding;

    const top = placeAbove
      ? Math.max(viewportPadding, rect.top - popoverHeight - 6)
      : rect.bottom + 6;

    // Align the popover's right edge with the trigger's right edge (RTL-friendly),
    // but keep it inside the viewport.
    let left = rect.right - popoverWidth;
    if (left < viewportPadding) left = viewportPadding;
    if (left + popoverWidth > window.innerWidth - viewportPadding) {
      left = window.innerWidth - viewportPadding - popoverWidth;
    }

    setCoords({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    recomputeCoords();
    function handleResize() {
      recomputeCoords();
    }
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [open, recomputeCoords]);

  // Sync the calendar view when value changes externally.
  useEffect(() => {
    if (parsed) {
      setViewYear(parsed.y);
      setViewMonth(parsed.m);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => setOpen(false), []);

  // Close on outside click. The popover is portalled, so check both refs.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const inTrigger = containerRef.current?.contains(target);
      const inPopover = popoverRef.current?.contains(target);
      if (!inTrigger && !inPopover) close();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, close]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, close]);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function selectDay(day: number) {
    onChange(toIso(viewYear, viewMonth, day));
    close();
  }

  function goToday() {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
    selectDay(t.getDate());
  }

  // Build the grid cells. Leading blanks for the first week offset.
  const totalDays = daysInMonth(viewYear, viewMonth);
  const startDay = firstDayOfWeek(viewYear, viewMonth);
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  const todayIso = toIso(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const selectedIso = value || "";

  const displayText = parsed
    ? `${parsed.d} ${MONTHS_AR[parsed.m]} ${parsed.y}`
    : "";

  return (
    <div ref={containerRef} className="relative" id={id}>
      {/* Trigger input */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`w-full flex items-center justify-between bg-surface-container-low border rounded-sm px-4 py-3 text-sm font-mono outline-none transition-all disabled:opacity-50 ${
          open
            ? "border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
            : "border-white/10 hover:border-emerald-500/40"
        } ${displayText ? "text-white" : "text-on-surface-variant/40"}`}
      >
        <span>{displayText || placeholder}</span>
        <Icon
          name="calendar_month"
          className={`!text-lg transition-colors ${
            open ? "text-emerald-400" : "text-emerald-500/80"
          }`}
        />
      </button>

      {/* Calendar dropdown — portalled to escape modal overflow */}
      {open && mounted && coords &&
        createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
          }}
          className="z-[200] w-72 rounded-md border border-emerald-500/20 bg-zinc-900 shadow-2xl shadow-black/70 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {/* Month / Year header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 bg-zinc-950/80">
            <button
              type="button"
              onClick={prevMonth}
              className="rounded-sm p-1 text-on-surface-variant hover:bg-white/5 hover:text-white transition-colors"
            >
              <Icon name="chevron_right" className="!text-lg" />
            </button>
            <span className="text-xs font-bold text-white tracking-wider uppercase">
              {MONTHS_AR[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="rounded-sm p-1 text-on-surface-variant hover:bg-white/5 hover:text-white transition-colors"
            >
              <Icon name="chevron_left" className="!text-lg" />
            </button>
          </div>

          {/* Day-of-week header */}
          <div className="grid grid-cols-7 px-2 pt-2">
            {DAY_LABELS_AR.map((d) => (
              <div
                key={d}
                className="text-center text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/50 py-1"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={`blank-${idx}`} />;
              }
              const iso = toIso(viewYear, viewMonth, day);
              const isSelected = iso === selectedIso;
              const isToday = iso === todayIso;

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`relative h-8 w-full rounded-sm text-xs font-mono transition-all duration-100 ${
                    isSelected
                      ? "bg-emerald-500 text-black font-bold shadow-[0_0_12px_rgba(52,211,153,0.4)]"
                      : isToday
                        ? "bg-emerald-500/10 text-emerald-400 font-bold ring-1 ring-inset ring-emerald-500/30"
                        : "text-gray-200 hover:bg-zinc-800 hover:text-white"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-white/5 bg-zinc-950/60">
            <button
              type="button"
              onClick={goToday}
              className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              اليوم · Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  close();
                }}
                className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 hover:text-rose-400 transition-colors"
              >
                مسح
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
