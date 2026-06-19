import type {
  AccessChainLink,
  EventsSection,
  EventSeverity,
  EventTiming,
  MatchedEvent,
} from "@/lib/sections";
import { SectionCard, type BadgeTone } from "@/components/cards/SectionCard";
import { cn } from "@/lib/utils";

const SEVERITY_TONE: Record<EventSeverity, BadgeTone> = {
  disruptive: "red",
  enhancing: "green",
  neutral: "grey",
  context_only: "grey",
};

const SEVERITY_LABEL: Record<EventSeverity, string> = {
  disruptive: "Disruptive",
  enhancing: "Worth catching",
  neutral: "Noted",
  context_only: "Context",
};

const TIMING_LABEL: Record<EventTiming, string> = {
  travel_day: "Travel day",
  leisure_day: "During your stay",
  adjacent: "Just outside your dates",
};

/** Renders the events section (PROJECT_SPEC §5) — the differentiator. */
export function EventsCard({ section }: { section: EventsSection }) {
  if (section.status === "unavailable") {
    return (
      <SectionCard
        title="Events"
        headline={section.headline}
        badge={{ label: "Unavailable", tone: "grey" }}
        muted
      >
        {section.detail && <p>{section.detail}</p>}
      </SectionCard>
    );
  }

  const badge = topBadge(section.events);

  return (
    <SectionCard title="Events" headline={section.headline} badge={badge}>
      {section.events.length > 0 ? (
        <ul className="mt-1 space-y-3">
          {section.events.map((event, i) => (
            <EventRow key={i} event={event} />
          ))}
        </ul>
      ) : (
        <p className="text-zinc-500">
          Nothing on your access route or in town for these dates.
        </p>
      )}

      {section.chain.length > 0 && <AccessChain chain={section.chain} />}
    </SectionCard>
  );
}

function topBadge(events: MatchedEvent[]): { label: string; tone: BadgeTone } {
  if (events.some((e) => e.severity === "disruptive")) {
    return { label: "Disruption likely", tone: "red" };
  }
  if (events.some((e) => e.severity === "enhancing")) {
    return { label: "Worth catching", tone: "green" };
  }
  return { label: "For info", tone: "grey" };
}

function EventRow({ event }: { event: MatchedEvent }) {
  return (
    <li className="rounded-lg border border-zinc-200 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={SEVERITY_TONE[event.severity]}>
          {SEVERITY_LABEL[event.severity]}
        </Pill>
        <Pill tone="grey">{TIMING_LABEL[event.timing]}</Pill>
        {event.confidence === "rumoured" && <Pill tone="amber">rumoured</Pill>}
      </div>

      <p className="mt-1.5 text-sm font-medium text-zinc-900">
        {event.headline}
      </p>
      <p className="mt-0.5 text-sm text-zinc-600">{event.why}</p>

      {event.whatToDo && (
        <p className="mt-1 text-sm text-zinc-600">
          <span className="font-medium text-zinc-700">What to do:</span>{" "}
          {event.whatToDo}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-400">
        {event.chainLinksTouched.length > 0 && (
          <span>
            Affects {event.chainLinksTouched.length} point
            {event.chainLinksTouched.length === 1 ? "" : "s"} on your route
          </span>
        )}
        {event.source && (
          <span>
            {event.source.url ? (
              <a
                href={event.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-zinc-600"
              >
                {event.source.name}
              </a>
            ) : (
              event.source.name
            )}
          </span>
        )}
      </div>
    </li>
  );
}

function AccessChain({ chain }: { chain: AccessChainLink[] }) {
  return (
    <details className="mt-3 text-xs text-zinc-500">
      <summary className="cursor-pointer text-zinc-400 hover:text-zinc-600">
        Access route ({chain.length} links)
      </summary>
      <ol className="mt-2 space-y-1">
        {chain.map((link, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-zinc-700">{link.name}</span>
            <span className="text-zinc-400">
              {link.vulnerabilityProfile.join(" · ")}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: React.ReactNode;
}) {
  const tones: Record<BadgeTone, string> = {
    red: "bg-red-50 text-red-700 ring-red-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    green: "bg-green-50 text-green-700 ring-green-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    grey: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
