import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const toneMap: Record<string, string> = {
  live: "bg-emerald-100 text-emerald-900 border-emerald-200",
  warming: "bg-amber-100 text-amber-950 border-amber-200",
  setup: "bg-slate-100 text-slate-700 border-slate-200",
  sending: "bg-sky-100 text-sky-950 border-sky-200",
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  completed: "bg-emerald-100 text-emerald-900 border-emerald-200",
  paused: "bg-orange-100 text-orange-950 border-orange-200",
  scheduled: "bg-indigo-100 text-indigo-950 border-indigo-200",
  available: "bg-emerald-50 text-emerald-900 border-emerald-200",
  contacted: "bg-sky-50 text-sky-900 border-sky-200",
  replied: "bg-teal-100 text-teal-950 border-teal-200",
  opted_out: "bg-rose-100 text-rose-950 border-rose-200",
  converted: "bg-lime-100 text-lime-950 border-lime-200",
  queued: "bg-violet-50 text-violet-950 border-violet-200",
  approved: "bg-emerald-100 text-emerald-900 border-emerald-200",
  pending: "bg-amber-100 text-amber-950 border-amber-200",
  not_started: "bg-slate-100 text-slate-700 border-slate-200",
  verified: "bg-emerald-100 text-emerald-900 border-emerald-200",
  partial: "bg-amber-100 text-amber-950 border-amber-200",
  missing: "bg-rose-100 text-rose-950 border-rose-200",
  interested: "bg-emerald-100 text-emerald-900 border-emerald-200",
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  not_interested: "bg-orange-100 text-orange-950 border-orange-200",
  opt_out: "bg-rose-100 text-rose-950 border-rose-200",
  other: "bg-slate-100 text-slate-700 border-slate-200",
  valid: "bg-emerald-100 text-emerald-900 border-emerald-200",
  invalid: "bg-rose-100 text-rose-950 border-rose-200",
  risky: "bg-amber-100 text-amber-950 border-amber-200",
  unverified: "bg-slate-100 text-slate-700 border-slate-200",
  scale_up: "bg-emerald-100 text-emerald-900 border-emerald-200",
  hold: "bg-slate-100 text-slate-700 border-slate-200",
  cut: "bg-rose-100 text-rose-950 border-rose-200",
  active: "bg-emerald-100 text-emerald-900 border-emerald-200",
  archived: "bg-slate-100 text-slate-700 border-slate-200",
  connected: "bg-emerald-100 text-emerald-900 border-emerald-200",
  not_connected: "bg-slate-100 text-slate-700 border-slate-200",
  needs_setup: "bg-amber-100 text-amber-950 border-amber-200",
};

export function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-md font-medium",
        toneMap[status] || "bg-slate-100 text-slate-700",
        className,
      )}
    >
      {statusLabel(status)}
    </Badge>
  );
}
