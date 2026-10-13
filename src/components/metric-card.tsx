export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4 shadow-[0_1px_0_rgba(15,42,46,0.04)]">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--ink-muted)]">
        {label}
      </p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-3xl tracking-tight text-[color:var(--ink)]">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-xs leading-5 text-[color:var(--ink-soft)]">{hint}</p>
      ) : null}
    </div>
  );
}
