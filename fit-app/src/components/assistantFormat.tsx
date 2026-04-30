import type { ReactNode } from "react";

function splitCodeAndProse(text: string): { type: "code" | "prose"; lang?: string; body: string }[] {
  const segments: { type: "code" | "prose"; lang?: string; body: string }[] = [];
  let rest = text.replace(/\r\n/g, "\n");

  while (rest.length) {
    const fenceStart = rest.indexOf("```");
    if (fenceStart < 0) {
      if (rest.trim()) segments.push({ type: "prose", body: rest });
      break;
    }

    const before = rest.slice(0, fenceStart);
    if (before.trim()) segments.push({ type: "prose", body: before });

    const cursor = fenceStart + 3;
    const nl = rest.indexOf("\n", cursor);
    let lang: string | undefined;
    let codeStart: number;

    if (nl < 0) {
      if (rest.slice(fenceStart).trim()) segments.push({ type: "prose", body: rest.slice(fenceStart) });
      break;
    }

    const firstLine = rest.slice(cursor, nl).trim();
    if (/^[a-zA-Z][a-zA-Z0-9+#.-]*$/.test(firstLine) && firstLine.length < 48) {
      lang = firstLine;
      codeStart = nl + 1;
    } else {
      codeStart = cursor;
    }

    const fenceEnd = rest.indexOf("```", codeStart);
    if (fenceEnd < 0) {
      if (rest.slice(fenceStart).trim()) segments.push({ type: "prose", body: rest.slice(fenceStart) });
      break;
    }

    const body = rest.slice(codeStart, fenceEnd).replace(/\s+$/, "");
    segments.push({ type: "code", lang, body });
    rest = rest.slice(fenceEnd + 3);
  }

  return segments;
}

function formatInlineSegment(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-fit-fg/95">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={i}
          className="rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.85em] text-fit-accent/95"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-fit-accent underline decoration-fit-accent/40 underline-offset-2 hover:decoration-fit-accent"
        >
          {link[1]}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function formatParagraph(line: string): ReactNode {
  const trimmed = line.trim();
  if (!trimmed) return null;
  return <p className="mb-3 last:mb-0">{formatInlineSegment(trimmed)}</p>;
}

function renderProseChunk(chunk: string): ReactNode[] {
  const lines = chunk.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (!buf.length) return;
    const text = buf.join(" ").trim();
    if (text) out.push(<div key={`p-${out.length}`}>{formatParagraph(text)}</div>);
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (!line.trim()) {
      i++;
      continue;
    }

    const h = line.match(/^#{1,3}\s+(.+)$/);
    if (h) {
      out.push(
        <h3
          key={`h-${out.length}`}
          className="mb-2 mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-fit-accent/90 first:mt-0"
        >
          {formatInlineSegment(h[1])}
        </h3>
      );
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push(
        <ul
          key={`ul-${out.length}`}
          className="mb-3 ml-0 list-none space-y-1.5 border-l-2 border-fit-accent/25 pl-3 last:mb-0"
        >
          {items.map((item, j) => (
            <li key={j} className="text-[13px] leading-relaxed text-fit-fg/88">
              <span className="mr-1.5 text-fit-accent/70">·</span>
              {formatInlineSegment(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      out.push(
        <ol key={`ol-${out.length}`} className="mb-3 ml-4 list-decimal space-y-1.5 last:mb-0">
          {items.map((item, j) => (
            <li key={j} className="pl-1 text-[13px] leading-relaxed text-fit-fg/88 marker:text-fit-accent/80">
              {formatInlineSegment(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      if (!next.trim()) break;
      const t = next.trim();
      if (/^#{1,3}\s/.test(t) || /^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t)) break;
      para.push(next.trim());
      i++;
    }
    flushParagraph(para);
  }

  return out;
}

/** Renders assistant text with common markdown patterns (lists, headings, code fences, **bold**, `code`, links). */
export function FormattedAssistantBody({ text, isError }: { text: string; isError?: boolean }) {
  if (isError) {
    return (
      <p className="text-[13px] leading-relaxed text-amber-100/95">{text.replace(/^\(error\)\s*/i, "")}</p>
    );
  }

  const chunks = splitCodeAndProse(text.trim());
  return (
    <div className="assistant-md space-y-3 text-[13px] leading-relaxed text-fit-fg/88">
      {chunks.map((seg, k) =>
        seg.type === "code" ? (
          <div key={k} className="overflow-x-auto rounded-lg border border-fit-border/60 bg-fit-ink/80">
            {seg.lang ? (
              <p className="border-b border-fit-border/50 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-fit-muted">
                {seg.lang}
              </p>
            ) : null}
            <pre className="max-h-[280px] overflow-y-auto p-3 font-mono text-[11px] leading-relaxed text-fit-muted">
              <code>{seg.body}</code>
            </pre>
          </div>
        ) : (
          <div key={k}>{renderProseChunk(seg.body)}</div>
        )
      )}
    </div>
  );
}
