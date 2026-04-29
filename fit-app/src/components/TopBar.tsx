export function TopBar({
  breadcrumbRight,
  onReset,
  busy,
  relayHint,
}: {
  breadcrumbRight?: string;
  onReset?: () => void;
  busy?: string | null;
  /** Short relay / WebSocket status for hackathon demos. */
  relayHint?: string;
}) {
  return (
    <header className="flex min-h-[64px] shrink-0 flex-col gap-2 border-b border-fit-border/90 bg-fit-panel/60 px-6 py-3 backdrop-blur-md lg:flex-row lg:items-center lg:justify-between lg:gap-4">
      <div className="min-w-0 flex-1">        <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-fit-muted opacity-85">
          Dashboards / Overview
        </p>
        <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-white">
          Financial Identity <span className="text-fit-accent">&nbsp;· FIT token cockpit</span>
        </h1>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
        {relayHint ? (
          <span className="max-w-[280px] truncate rounded-lg border border-fit-accent/25 bg-fit-accent/10 px-3 py-2 font-mono text-[10px] leading-snug text-fit-accent lg:max-w-md">
            {relayHint}
          </span>
        ) : null}
        {busy ? (
          <span className="animate-pulse text-[11px] font-medium uppercase tracking-wider text-fit-accent">{busy}…</span>
        ) : null}
        {breadcrumbRight ? (
          <span className="hidden rounded-full border border-fit-border/70 px-3 py-1 text-[10px] text-fit-muted sm:inline-block">
            {breadcrumbRight}
          </span>
        ) : null}
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-fit-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-fit-muted hover:border-fit-accent hover:text-fit-accent"
          >
            Reset
          </button>
        ) : null}
      </div>
    </header>
  );
}
