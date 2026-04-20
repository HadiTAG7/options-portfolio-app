import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-zinc-800/50",
        className
      )}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/80 via-zinc-900/60 to-zinc-950/90 p-5 backdrop-blur-sm h-32 flex flex-col justify-between">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-9 w-44" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 6 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <Skeleton className="h-4 w-24" />
        </td>
      ))}
    </tr>
  );
}
