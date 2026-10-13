import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-paper p-1.5", className)}>
      <Image src="/brand/hadi-capital-mark.svg" alt="" aria-hidden="true" loading="eager" width={40} height={40} />
    </span>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="whitespace-nowrap text-base font-bold text-on-surface">هادي كابيتال</p>
          <p dir="ltr" className="mt-1 whitespace-nowrap text-[10px] font-medium tracking-[0.18em] text-on-surface-variant">HADI CAPITAL</p>
          <p className="mt-1.5 text-[10px] text-zinc-400">إدارة الاستثمار</p>
        </div>
      )}
    </div>
  );
}
