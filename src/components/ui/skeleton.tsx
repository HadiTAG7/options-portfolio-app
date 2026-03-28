import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-sm bg-white/5",
        className
      )}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-surface-container p-6 rounded-sm h-32 flex flex-col justify-between">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-8 w-48" />
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
