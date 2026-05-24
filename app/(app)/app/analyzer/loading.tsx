import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-64 rounded-2xl" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
