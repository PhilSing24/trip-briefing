import * as React from "react";
import { cn } from "@/lib/utils";
import type { SectionSource } from "@/lib/sections";

export type BadgeTone = "blue" | "amber" | "green" | "red" | "grey";

const toneClasses: Record<BadgeTone, string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  green: "bg-green-50 text-green-700 ring-green-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  grey: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

/**
 * The uniform card anatomy (PROJECT_SPEC §4): a section title, an always-on
 * headline, an optional styled badge (the "signal"), expandable detail, and a
 * cited source. Every briefing section renders through this shell.
 */
export function SectionCard({
  title,
  headline,
  badge,
  source,
  muted = false,
  children,
}: {
  title: string;
  headline: string;
  badge?: { label: string; tone: BadgeTone };
  source?: SectionSource;
  /** Collapsed / low-signal styling for "nothing to report" states. */
  muted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-zinc-200 bg-white p-5 shadow-sm",
        muted && "bg-zinc-50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          {title}
        </p>
        {badge && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
              toneClasses[badge.tone],
            )}
          >
            {badge.label}
          </span>
        )}
      </div>

      <p className="mt-1.5 text-sm font-medium text-zinc-900">{headline}</p>

      {children && <div className="mt-2 text-sm text-zinc-600">{children}</div>}

      {source && (
        <p className="mt-3 text-xs text-zinc-400">
          Source:{" "}
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-600"
            >
              {source.name}
            </a>
          ) : (
            source.name
          )}
        </p>
      )}
    </section>
  );
}
