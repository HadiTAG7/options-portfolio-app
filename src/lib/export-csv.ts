// CSV export helpers. Excel needs a UTF-8 BOM to render Arabic
// correctly, and fields containing commas/quotes/newlines must be
// quoted per RFC 4180.

function escapeCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((r) => r.map(escapeCell).join(",")),
  ];
  // BOM so Excel opens Arabic text as UTF-8 instead of mojibake.
  return "﻿" + lines.join("\r\n");
}

// Trigger a client-side download of the CSV. Browser-only — callers
// are all inside "use client" components.
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
