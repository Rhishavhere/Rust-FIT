export function Sidebar({
  personaName,
  mode,
}: {
  personaName: string;
  mode: "idle" | "owner" | "recipient";
}) {
  const initials = (personaName || "FIT user")
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-fit-border bg-fit-panel/98">
      <div className="flex items-center gap-3 px-5 py-7">
        <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-fit-ink shadow-neon ring-2 ring-fit-accent/30">
          <span className="text-lg font-black tracking-tight text-fit-accent">FIT</span>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-[0.2em] text-fit-muted opacity-70">Dwison-ish</p>
          <p className="text-sm font-bold text-white">FIT OS · v1</p>
        </div>
      </div>

      <nav className="flex-1 space-y-8 px-3 pt-4">
        <div>
          <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-fit-muted">
            Dashboards
          </p>
          <SidebarLink active labels={["Overview"]} subtitle="Portfolio command" glow />
          <SidebarLink
            active={false}
            variant="muted"
            labels={mode === "idle" ? ["Share manager"] : ["Share & access grants"]}
            subtitle="Exports .fitshare"
          />
          <SidebarLink labels={["Layer explorer"]} subtitle="Planes 1–6" muted />
          <SidebarLink labels={["Connections"]} subtitle="AA · GST · CIBIL" muted />
          <SidebarLink labels={["Agent console"]} subtitle="Coming soon" muted />
        </div>
      </nav>

      <div className="border-t border-fit-border/80 px-5 py-6">
        <div className="flex items-center gap-3 rounded-xl border border-fit-border/60 bg-fit-ink/50 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-800/70 to-fit-ink text-sm font-semibold uppercase text-fit-accent shadow-neon">
            {initials || "?"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {personaName || "Guy Hawkins archetype"}
            </p>
            <p className="truncate text-[11px] text-fit-muted capitalize">
              {mode === "owner"
                ? "Owner · decrypted master"
                : mode === "recipient"
                  ? "Investor envelope"
                  : "Landing"}
            </p>
          </div>
        </div>
        <p className="mt-4 px-2 text-[10px] leading-relaxed text-fit-muted opacity-80">
          Reference UI inspired neon grid — Dwison dashboards remixed for cryptographic FIT truth.
        </p>
      </div>
    </aside>
  );
}

function SidebarLink({
  labels,
  subtitle,
  active,
  muted,
  glow,
  variant,
}: {
  labels: string[];
  subtitle?: string;
  active?: boolean;
  muted?: boolean;
  glow?: boolean;
  variant?: "muted";
}) {
  const dim = muted || variant === "muted";
  const label = labels[0];
  return (
    <button
      type="button"
      disabled={dim && !active}
      className={`mb-2 flex w-full flex-col rounded-xl px-3 py-3 text-left transition ${
        active
          ? glow
            ? "bg-fit-accent/15 ring-2 ring-fit-accent shadow-neon"
            : "bg-fit-accent/18 ring-2 ring-fit-accent/55"
          : dim
            ? "cursor-not-allowed opacity-45 hover:bg-transparent"
            : "hover:bg-fit-highlight/55"
      }`}
    >
      <span
        className={`text-sm ${active ? "font-semibold text-white" : "font-medium text-fit-muted hover:text-white"}`}
      >
        {label}
      </span>
      {subtitle ? <span className="mt-1 text-[11px] text-fit-muted/90">{subtitle}</span> : null}
    </button>
  );
}
