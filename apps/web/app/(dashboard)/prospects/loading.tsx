import { Skeleton } from "@/components/ui/skeleton";

export default function ProspectsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-44" />
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-10 w-72" />
      </div>
      <div className="rounded-lg border">
        <div className="border-b p-3">
          <Skeleton className="h-5 w-full" />
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="border-b p-4 last:border-0">
            <Skeleton className="h-5 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
