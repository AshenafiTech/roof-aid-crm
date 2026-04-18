import { cn } from "@/lib/utils";
import {
  PROSPECT_STATUS_COLORS,
  PROSPECT_STATUS_LABELS,
  type ProspectStatus,
  isProspectStatus,
} from "@/lib/constants/prospect-status";

type Props = {
  status: ProspectStatus | string | null | undefined;
  className?: string;
};

export function StatusBadge({ status, className }: Props) {
  const resolved = isProspectStatus(status) ? status : null;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        resolved
          ? PROSPECT_STATUS_COLORS[resolved]
          : "border-gray-200 bg-gray-100 text-gray-800",
        className,
      )}
    >
      {resolved ? PROSPECT_STATUS_LABELS[resolved] : (status ?? "Unknown")}
    </span>
  );
}
