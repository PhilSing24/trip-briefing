/**
 * Events × access-chain matching (PROJECT_SPEC §5c).
 *
 * The match is deliberately DETERMINISTIC: `blastSurface` and a link's
 * `vulnerabilityProfile` are near-mirror vocabularies, so "does this event hit
 * the chain?" is a set intersection, not model reasoning. The LLM judges only
 * the *degree* (severityHint); this code decides *existence*, *timing*, and the
 * *drop* rule. That split keeps the novel logic auditable and hallucination-free.
 *
 * The Claude call that produces candidate events + the access chain lands in the
 * next sub-step; this module is pure and unit-tested on its own.
 */

import type {
  AccessChainLink,
  CandidateEvent,
  EventSeverity,
  EventTiming,
  MatchedEvent,
} from "@/lib/sections";
import type { DateRange } from "@/lib/trip";

/** Days outside the trip still worth noting as `adjacent` / context_only. */
const ADJACENT_DAYS = 3;

/** Chain links whose vulnerability profile intersects the event's blast surface. */
export function linksTouched(
  event: CandidateEvent,
  chain: AccessChainLink[],
): string[] {
  const blast = new Set(event.blastSurface);
  return chain
    .filter((link) => link.vulnerabilityProfile.some((v) => blast.has(v)))
    .map((link) => link.name);
}

/**
 * Where the event lands relative to the trip. `"out"` means beyond the adjacent
 * window — not worth surfacing at all. Travel days are arrival + departure; a hit
 * on either is the strongest timing signal (§5c).
 */
export function computeTiming(
  event: DateRange,
  trip: DateRange,
): EventTiming | "out" {
  if (covers(event, trip.start) || covers(event, trip.end)) return "travel_day";
  if (rangesOverlap(event, trip)) return "leisure_day";

  const window: DateRange = {
    start: addDays(trip.start, -ADJACENT_DAYS),
    end: addDays(trip.end, ADJACENT_DAYS),
  };
  if (rangesOverlap(event, window)) return "adjacent";
  return "out";
}

/**
 * Inclusion gate: an event earns a place only if it has a CLEAR IMPACT on this
 * trip — positive or negative. That means a stated consequence (non-empty
 * blastSurface) that actually lands somewhere: on a chain link, or in the
 * destination itself. A pleasant-but-inconsequential event (no footprint on the
 * trip) is discovery, not a briefing item — drop it, even if it is in-destination.
 */
export function shouldDrop(
  event: CandidateEvent,
  touched: string[],
): boolean {
  if (event.blastSurface.length === 0) return true; // no impact → not for us
  return touched.length === 0 && !event.inDestination;
}

/**
 * Severity = (how hard it hits — the LLM's degree) × (whether it lands on a
 * travel day). Code only forces `context_only` for adjacent (out-of-window)
 * events; otherwise it trusts the LLM's degree hint.
 */
export function resolveSeverity(
  event: CandidateEvent,
  timing: EventTiming,
): EventSeverity {
  if (timing === "adjacent") return "context_only";
  return event.severityHint ?? "neutral";
}

/**
 * Match candidate events to the access chain, dropping the irrelevant and
 * ordering the rest by decision-relevance (severity, then timing).
 */
export function matchEvents(
  candidates: CandidateEvent[],
  chain: AccessChainLink[],
  trip: DateRange,
): MatchedEvent[] {
  const matched: MatchedEvent[] = [];

  for (const event of candidates) {
    const timing = computeTiming(event.dates, trip);
    if (timing === "out") continue; // beyond the window — not worth noting

    const touched = linksTouched(event, chain);
    if (shouldDrop(event, touched)) continue;

    matched.push({
      ...event,
      chainLinksTouched: touched,
      timing,
      severity: resolveSeverity(event, timing),
    });
  }

  return matched.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      TIMING_RANK[a.timing] - TIMING_RANK[b.timing],
  );
}

const SEVERITY_RANK: Record<EventSeverity, number> = {
  disruptive: 0,
  enhancing: 1,
  neutral: 2,
  context_only: 3,
};

const TIMING_RANK: Record<EventTiming, number> = {
  travel_day: 0,
  leisure_day: 1,
  adjacent: 2,
};

// ── date helpers (ISO yyyy-mm-dd compares lexicographically) ────────────────

function covers(range: DateRange, day: string): boolean {
  return range.start <= day && day <= range.end;
}

function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
