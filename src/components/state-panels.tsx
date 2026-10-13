import { Button } from "@/components/ui/button";

export function LoadingPanel({ label = "Loading workspace…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-dashed border-[color:var(--ink-border)] bg-[color:var(--panel)]/70">
      <div className="text-center">
        <div className="mx-auto mb-3 size-8 animate-pulse rounded-full bg-[color:var(--accent-soft)]" />
        <p className="text-sm text-[color:var(--ink-muted)]">{label}</p>
      </div>
    </div>
  );
}

export function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
      <h2 className="font-[family-name:var(--font-display)] text-xl text-rose-950">
        Couldn’t load this view
      </h2>
      <p className="mt-2 text-sm text-rose-900/80">{message}</p>
      {onRetry ? (
        <Button className="mt-4" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyPanel({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[color:var(--ink-border)] bg-[color:var(--panel)] p-8 text-center">
      <h2 className="font-[family-name:var(--font-display)] text-xl text-[color:var(--ink)]">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-[color:var(--ink-muted)]">
        {description}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
