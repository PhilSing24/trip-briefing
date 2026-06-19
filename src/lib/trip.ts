/**
 * The input contract (PROJECT_SPEC §3).
 *
 * This is the single structured request the form emits and the backend
 * pipeline will consume. Rule from the spec: only ask for an input when a
 * section consumes it. `travellingFrom` is deliberately deferred to the cost
 * layer, so it is absent here.
 */

/** The load-bearing "When" toggle — selects the weather strategy + event window. */
export type WhenMode = "exact" | "month" | "flexible";

export interface DateRange {
  /** ISO yyyy-mm-dd */
  start: string;
  /** ISO yyyy-mm-dd */
  end: string;
}

export interface WhenValue {
  mode: WhenMode;
  /** present when mode === "exact" */
  exact?: DateRange;
  /** present when mode === "month"; ISO yyyy-mm */
  month?: string;
  /** mode === "flexible" carries no extra data */
}

export interface PartyValue {
  adults: number;
  /** children.length is the child count; ages drive event suitability + admin */
  childrenAges: number[];
}

export interface TripRequest {
  /** Free text for now; an autocomplete place-resolver lands in a later slice. */
  destination: string;
  when: WhenValue;
  party: PartyValue;
  /** Allow multiple for mixed-nationality groups. Drives the admin card. */
  nationalities: string[];
  /** Optional "anything else?" — drives the interests card + re-weights events. */
  notes: string;
}

/** Short, human summary for the post-submit summary bar (PROJECT_SPEC §2). */
export function summarizeTrip(req: TripRequest): string {
  const parts: string[] = [req.destination.trim() || "Somewhere"];

  parts.push(summarizeWhen(req.when));

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

function summarizeWhen(when: WhenValue): string {
  if (when.mode === "exact" && when.exact?.start && when.exact?.end) {
    return `${fmtDay(when.exact.start)}–${fmtDay(when.exact.end)}`;
  }
  if (when.mode === "month" && when.month) {
    return fmtMonth(when.month);
  }
  return "flexible dates";
}

function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function fmtMonth(iso: string): string {
  return new Date(`${iso}-01T00:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}
