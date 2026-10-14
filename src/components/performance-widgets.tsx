import { money } from "@/lib/client-format";
import type { EntityPerformanceScores } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Circular ring score (0–100). */
export function RingScore({
  value,
  label,
  hint,
  tone = "ink",
  size = 96,
}: {
  value: number | null;
  label: string;
  hint?: string;
  tone?: "ink" | "teal" | "gold" | "muted";
  size?: number;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const strokeColor =
    tone === "teal"
      ? "var(--chart-2)"
      : tone === "gold"
        ? "var(--brand-accent)"
        : tone === "muted"
          ? "var(--chart-4)"
          : "var(--ink)";

  return (
    <div className="flex flex-col items-center rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4 text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--panel-hover)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[color:var(--ink)]">
            {value == null ? "—" : `${pct % 1 ? pct.toFixed(1) : pct}%`}
          </span>
        </div>
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--ink-muted)]">
        {label}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-[color:var(--ink-soft)]">{hint}</p>
      ) : null}
    </div>
  );
}

/** Horizontal bar meter. */
export function BarMeter({
  value,
  max = 100,
  label,
  right,
  tone = "ink",
}: {
  value: number;
  max?: number;
  label: string;
  right?: string;
  tone?: "ink" | "teal" | "gold" | "muted";
}) {
  const width =
    max <= 0 ? 0 : Math.max(4, Math.min(100, (value / max) * 100));
  const bg =
    tone === "teal"
      ? "bg-[color:var(--chart-2)]"
      : tone === "gold"
        ? "bg-[color:var(--brand-accent)]"
        : tone === "muted"
          ? "bg-[color:var(--chart-4)]"
          : "bg-[color:var(--ink)]";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-[color:var(--ink)]">{label}</span>
        {right ? (
          <span className="text-[color:var(--ink-muted)]">{right}</span>
        ) : null}
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[color:var(--panel-hover)]">
        <div
          className={cn("bar-fill h-full rounded-full", bg)}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

/** Four scorecards: reply, interested, conversions, cost efficiency. */
export function PerformanceScorecards({
  scores,
  className,
  title,
}: {
  scores: EntityPerformanceScores;
  className?: string;
  /** Optional channel heading above the rings. */
  title?: string;
}) {
  const channelHint =
    scores.channel === "sms"
      ? "SMS only"
      : scores.channel === "email"
        ? "Email only"
        : "All channels";

  return (
    <div className={className}>
      {title ? (
        <div className="mb-3">
          <h3 className="font-[family-name:var(--font-display)] text-xl">
            {title}
          </h3>
          <p className="text-xs text-[color:var(--ink-muted)]">{channelHint}</p>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <RingScore
          value={scores.replyRate}
          label="Reply rate"
          hint={
            scores.sent
              ? `${scores.replies} / ${scores.sent} sent`
              : `${scores.replies} replies`
          }
          tone="ink"
        />
        <RingScore
          value={scores.interestedRate}
          label="Interested"
          hint={`${scores.interested} interested`}
          tone="teal"
        />
        <RingScore
          value={scores.conversionRate}
          label="Conversions"
          hint={`${scores.conversions} converted`}
          tone="gold"
        />
        <RingScore
          value={scores.costEfficiencyScore}
          label="Cost efficiency"
          hint={
            scores.costPerInterested != null
              ? `${money(scores.costPerInterested)} / interested`
              : scores.spendCents
                ? `${money(scores.spendCents)} logged`
                : "Log costs to score"
          }
          tone="muted"
        />
      </div>
    </div>
  );
}

/** Compact entity row with mini bars for overview. */
export function EntityScoreRow({
  scores,
  onOpen,
}: {
  scores: EntityPerformanceScores;
  onOpen?: () => void;
}) {
  const reply = scores.replyRate ?? 0;
  const interested = scores.interestedRate ?? 0;
  const conversion = scores.conversionRate ?? 0;
  const efficiency = scores.costEfficiencyScore ?? 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-[color:var(--ink-border)] px-4 py-3",
        onOpen && "cursor-pointer transition-colors hover:bg-[color:var(--panel-hover)]",
      )}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onOpen();
            }
          : undefined
      }
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="font-medium">{scores.brandName}</div>
          <div className="text-xs text-[color:var(--ink-muted)]">
            {scores.channel === "sms"
              ? "SMS"
              : scores.channel === "email"
                ? "Email"
                : "All"}{" "}
            · {scores.replies} replies · {scores.interested} interested ·{" "}
            {scores.conversions} conversions
          </div>
        </div>
        {scores.costPerInterested != null ? (
          <div className="text-right text-xs text-[color:var(--ink-soft)]">
            {money(scores.costPerInterested)}
            <div className="text-[color:var(--ink-muted)]">/ interested</div>
          </div>
        ) : null}
      </div>
      <div className="space-y-2">
        <BarMeter
          label="Reply"
          value={reply}
          right={scores.replyRate != null ? `${scores.replyRate}%` : "—"}
          tone="ink"
        />
        <BarMeter
          label="Interested"
          value={interested}
          right={
            scores.interestedRate != null ? `${scores.interestedRate}%` : "—"
          }
          tone="teal"
        />
        <BarMeter
          label="Convert"
          value={conversion}
          right={
            scores.conversionRate != null ? `${scores.conversionRate}%` : "—"
          }
          tone="gold"
        />
        <BarMeter
          label="Efficiency"
          value={efficiency}
          right={
            scores.costEfficiencyScore != null
              ? `${scores.costEfficiencyScore}%`
              : "—"
          }
          tone="muted"
        />
      </div>
    </div>
  );
}
