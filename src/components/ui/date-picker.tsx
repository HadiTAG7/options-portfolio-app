"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync the calendar view when value changes externally.
  useEffect(() => {
    if (parsed) {
      setViewYear(parsed.y);
      setViewMonth(parsed.m);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => setOpen(false), []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        close();
      }
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
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`w-full flex items-center justify-between bg-surface-container-low border rounded-sm px-4 py-3 text-sm font-mono outline-none transition-all disabled:opacity-50 ${
          open
            ? "border-emerald-500/50 ring-1 ring-emerald-500"
            : "border-white/10 hover:border-white/20"
        } ${displayText ? "text-white" : "text-on-surface-variant/40"}`}
      >
        <span>{displayText || placeholder}</span>
        <Icon
          name="calendar_month"
          className={`!text-lg transition-colors ${
            open ? "text-emerald-400" : "text-on-surface-variant/60"
          }`}
        />
      </button>

      {/* Calendar dropdown */}
      {open && (
        <div className="absolute z-50 mt-1.5 w-72 rounded-sm border border-white/10 bg-zinc-900 shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
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
                      ? "bg-emerald-500 text-zinc-950 font-bold shadow-[0_0_12px_rgba(52,211,153,0.4)]"
                      : isToday
                        ? "bg-emerald-500/10 text-emerald-400 font-bold ring-1 ring-inset ring-emerald-500/30"
                        : "text-zinc-300 hover:bg-white/5 hover:text-white"
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
        </div>
      )}
    </div>
  );
}
