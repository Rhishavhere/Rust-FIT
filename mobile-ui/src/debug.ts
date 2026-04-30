export type DebugLevel = "info" | "warn" | "error";

export type DebugEntry = {
  id: string;
  ts: number;
  level: DebugLevel;
  scope: string;
  step: string;
  detail?: unknown;
};

const MAX_EVENTS = 500;
let events: DebugEntry[] = [];
const listeners = new Set<(entries: DebugEntry[]) => void>();

function now(): number {
  return Date.now();
}

function makeId(): string {
  return `dbg-${now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function notifyListeners(): void {
  const snapshot = [...events];
  listeners.forEach((listener) => {
    listener(snapshot);
  });
}

function write(level: DebugLevel, scope: string, step: string, detail?: unknown): void {
  const row: DebugEntry = {
    id: makeId(),
    ts: now(),
    level,
    scope,
    step,
    detail,
  };
  events = [row, ...events].slice(0, MAX_EVENTS);
  const head = `[FITDBG][${level.toUpperCase()}][${scope}] ${step}`;
  if (detail === undefined) {
    console.log(head);
  } else if (level === "error") {
    console.error(head, detail);
  } else if (level === "warn") {
    console.warn(head, detail);
  } else {
    console.log(head, detail);
  }
  notifyListeners();
}

export function debugInfo(scope: string, step: string, detail?: unknown): void {
  write("info", scope, step, detail);
}

export function debugWarn(scope: string, step: string, detail?: unknown): void {
  write("warn", scope, step, detail);
}

export function debugError(scope: string, step: string, detail?: unknown): void {
  write("error", scope, step, detail);
}

export function getDebugEntries(): DebugEntry[] {
  return [...events];
}

export function clearDebugEntries(): void {
  events = [];
  notifyListeners();
  console.log("[FITDBG] Cleared debug event history");
}

export function subscribeDebug(listener: (entries: DebugEntry[]) => void): () => void {
  listeners.add(listener);
  listener(getDebugEntries());
  return () => {
    listeners.delete(listener);
  };
}

