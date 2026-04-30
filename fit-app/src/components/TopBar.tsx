import { useTheme } from "../context/ThemeContext";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-fit-border/80 text-fit-muted transition hover:border-fit-accent/45 hover:text-fit-accent"
      title={isLight ? "Switch to dark theme" : "Switch to light theme"}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
    >
      {isLight ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M21 14.5A7.5 7.5 0 0 1 9.5 7a9.46 9.46 0 0 1 3-5 9.5 9.5 0 0 0 8.5 12.5Z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0-16a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 18a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM4.22 4.22l.71.71a1 1 0 1 0 1.41-1.41l-.71-.71a1 1 0 0 0-1.41 1.41Zm14.14 14.14.71.71a1 1 0 1 0 1.41-1.41l-.71-.71a1 1 0 0 0-1.41 1.41ZM21 13h-1a1 1 0 1 1 0-2h1a1 1 0 1 1 0 2ZM4 13H3a1 1 0 1 1 0-2h1a1 1 0 1 1 0 2Zm2.05-7.29.71-.71a1 1 0 1 0-1.42 1.42l.71-.71a1 1 0 0 0 1.42-1.42l-.71.71a1 1 0 0 0-1.42 1.42ZM16.24 18.36l.71-.71a1 1 0 1 0-1.41-1.41l-.71.71a1 1 0 0 0 1.41 1.41ZM4.22 19.78l.71-.71a1 1 0 1 0-1.41-1.41l-.71.71a1 1 0 0 0 1.41 1.41Z" />
        </svg>
      )}
    </button>
  );
}

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
        <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-fit-fg">
          Financial Identity <span className="text-fit-accent">&nbsp;· FIT token cockpit</span>
        </h1>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
        <ThemeToggle />
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
