"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, MessageCircle, X } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import { isManagerPartner } from "@/lib/partner-profit";
import {
  arabicMonthLabel,
  buildWhatsAppMessage,
  normalizeWhatsAppPhone,
  whatsAppLink,
} from "@/lib/whatsapp";
import type { MonthlyReportData } from "@/lib/report-pdf";
import type { Partner } from "@/types";

interface Props {
  open: boolean;
  month: string; // YYYY-MM
  // Built by the same buildMonthlyReports the email and PDF use, so the
  // message can't disagree with the report the partner also receives.
  reports: { partner: Partner; data: MonthlyReportData }[];
  onClose: () => void;
  onSavePhone: (partnerId: string, phone: string) => Promise<void>;
}

// One row per partner: the ready message, a button that opens WhatsApp
// with it prefilled (straight into the partner's chat when a number is
// saved, the contact picker otherwise), and a copy button. The GP still
// presses send in WhatsApp — nothing is sent from here.
export function WhatsAppReportsDialog({
  open,
  month,
  reports,
  onClose,
  onSavePhone,
}: Props) {
  // Re-render on the currency toggle: the message follows the currency
  // the app is showing.
  const currency = useCurrency();
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState<Record<string, string>>({});
  const [phoneError, setPhoneError] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // A fresh month is a fresh round — forget which chats were opened.
  const [roundKey, setRoundKey] = useState(month);
  if (roundKey !== month) {
    setRoundKey(month);
    setOpened(new Set());
  }

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // LPs first, the GP last — the GP rarely messages themself.
  const rows = useMemo(
    () =>
      [...reports]
        .sort(
          (a, b) =>
            Number(isManagerPartner(a.partner)) -
            Number(isManagerPartner(b.partner))
        )
        .map(({ partner, data }) => {
          const text = buildWhatsAppMessage(data, isManagerPartner(partner));
          const phone = normalizeWhatsAppPhone(partner.phone);
          return { partner, text, phone, link: whatsAppLink(phone, text) };
        }),
    // currency is a real dependency: buildWhatsAppMessage formats money
    // in the display currency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reports, currency]
  );

  if (!open) return null;

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
    } catch {
      setCopied(null);
    }
  }

  async function savePhone(partnerId: string) {
    const raw = phoneDraft[partnerId] ?? "";
    if (!normalizeWhatsAppPhone(raw)) {
      setPhoneError((e) => ({
        ...e,
        [partnerId]: "رقم غير صحيح — مثال: 0551234567",
      }));
      return;
    }
    setSavingId(partnerId);
    setPhoneError((e) => ({ ...e, [partnerId]: "" }));
    try {
      await onSavePhone(partnerId, raw);
    } catch (err) {
      setPhoneError((e) => ({
        ...e,
        [partnerId]:
          err instanceof Error ? err.message : "تعذّر حفظ الرقم",
      }));
    } finally {
      setSavingId(null);
    }
  }

  const doneCount = rows.filter((r) => opened.has(r.partner.id)).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative mx-4 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-800/70 bg-gradient-to-br from-zinc-900/95 via-zinc-950/95 to-black shadow-[0_0_60px_-12px_rgba(16,185,129,0.3)]"
      >
        <div className="flex items-center justify-between border-b border-zinc-800/70 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
              <MessageCircle size={16} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="font-headline text-sm font-bold text-white">
                رسائل واتساب · {arabicMonthLabel(month)}
              </h3>
              <p className="text-[10px] text-zinc-500">
                {doneCount} من {rows.length} — اضغط «واتساب» لكل شريك ثم
                «إرسال» داخل واتساب
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {rows.length === 0 && (
            <p className="py-10 text-center text-sm text-zinc-500">
              لا توجد بيانات لهذا الشهر
            </p>
          )}

          {rows.map(({ partner, text, phone, link }) => {
            const isOpened = opened.has(partner.id);
            return (
              <div
                key={partner.id}
                className={`rounded-lg border p-4 transition-colors ${
                  isOpened
                    ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                    : "border-zinc-800/70 bg-zinc-950/50"
                }`}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-bold text-white">
                      {partner.name}
                      {isOpened && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                          <Check size={11} /> تم الفتح
                        </span>
                      )}
                    </p>
                    <p
                      dir="ltr"
                      className="text-right font-mono text-[11px] text-zinc-500"
                    >
                      {phone ? `+${phone}` : "بدون رقم — سيطلب واتساب اختيار جهة الاتصال"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copy(partner.id, text)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800/70 px-3 py-2 text-[10px] font-bold text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                    >
                      {copied === partner.id ? (
                        <>
                          <Check size={12} className="text-emerald-400" /> نُسخ
                        </>
                      ) : (
                        <>
                          <Copy size={12} /> نسخ
                        </>
                      )}
                    </button>
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        setOpened((s) => new Set(s).add(partner.id))
                      }
                      className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-4 py-2 text-[10px] font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
                    >
                      <MessageCircle size={12} /> واتساب
                    </a>
                  </div>
                </div>

                {!phone && (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <input
                      type="tel"
                      inputMode="tel"
                      dir="ltr"
                      placeholder="05XXXXXXXX"
                      value={phoneDraft[partner.id] ?? ""}
                      onChange={(e) =>
                        setPhoneDraft((d) => ({
                          ...d,
                          [partner.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void savePhone(partner.id);
                      }}
                      className="w-40 rounded-md border border-zinc-800/70 bg-black/60 px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={() => void savePhone(partner.id)}
                      disabled={savingId === partner.id}
                      className="rounded-md border border-emerald-500/30 px-3 py-1.5 text-[10px] font-bold text-emerald-300 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      {savingId === partner.id ? "جارٍ الحفظ…" : "حفظ الرقم"}
                    </button>
                    {phoneError[partner.id] && (
                      <span className="text-[10px] text-rose-400">
                        {phoneError[partner.id]}
                      </span>
                    )}
                  </div>
                )}

                <pre
                  dir="rtl"
                  className="whitespace-pre-wrap rounded-md border border-zinc-800/50 bg-black/40 p-3 font-sans text-[12px] leading-6 text-zinc-300"
                >
                  {text}
                </pre>
              </div>
            );
          })}
        </div>

        <p className="border-t border-zinc-800/70 px-6 py-3 text-[10px] leading-relaxed text-zinc-500">
          النص بين النجمتين *هكذا* يظهر بخط عريض في واتساب. الأرقام بنفس
          عملة العرض الحالية في التطبيق، ومن نفس بيانات التقرير المرسل
          بالإيميل.
        </p>
      </div>
    </div>
  );
}
