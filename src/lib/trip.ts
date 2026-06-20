/**
 * The input contract (PROJECT_SPEC §3).
 *
 * This is the single structured request the form emits and the backend
 * pipeline will consume. Rule from the spec: only ask for an input when a
 * section consumes it. `travellingFrom` is deliberately deferred to the cost
 * layer, so it is absent here.
 */

import type { ResolvedPlace } from "@/lib/sections";

export interface DateRange {
  /** ISO yyyy-mm-dd */
  start: string;
  /** ISO yyyy-mm-dd */
  end: string;
}

export interface PartyValue {
  adults: number;
  /** children.length is the child count; ages drive event suitability + admin */
  childrenAges: number[];
}

export interface TripRequest {
  /** The typed/selected destination text (always present, for display + fallback). */
  destination: string;
  /**
   * The disambiguated place chosen from autocomplete, when the user picked one.
   * Present → the backend uses it directly and skips geocoding the free text.
   */
  place?: ResolvedPlace;
  /** Travel dates; weather mode (forecast vs. seasonal) is derived from proximity. */
  when: DateRange;
  party: PartyValue;
  /** Allow multiple for mixed-nationality groups. Drives the admin card. */
  nationalities: string[];
  /** Optional "anything else?" — drives the interests card + re-weights events. */
  notes: string;
}

/** Short, human summary for the post-submit summary bar (PROJECT_SPEC §2). */
export function summarizeTrip(req: TripRequest): string {
  const parts: string[] = [req.destination.trim() || "Somewhere"];

  if (req.when.start && req.when.end) {
    parts.push(`${fmtDay(req.when.start)}–${fmtDay(req.when.end)}`);
  }

  const adults = `${req.party.adults} adult${req.party.adults === 1 ? "" : "s"}`;
  const kids = req.party.childrenAges.length;
  if (kids > 0) {
    const ages = req.party.childrenAges.join(", ");
    parts.push(`${adults}, ${kids} child${kids === 1 ? "" : "ren"} (ages ${ages})`);
  } else {
    parts.push(adults);
  }

  return parts.join(" · ");
}

function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
