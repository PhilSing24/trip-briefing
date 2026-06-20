/**
 * Summary synthesis (PROJECT_SPEC §4). Server-only.
 *
 * A final, cheap pass over the OTHER sections' already-computed signals (not raw
 * data) → a few plain sentences a rushed traveller reads instead of the whole
 * briefing. Unlike a one-line verdict it COVERS every section that has something
 * to say — but in ONE coherent tone: the most serious signal sets the register,
 * and an upbeat phrase never stands unqualified next to a warning. Sonnet 4.6,
 * no web search, runs after the parallel section calls. Falls back to a
 * deterministic line if the call fails.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  AdminSection,
  EventsSection,
  InterestsSection,
  SafetySection,
  SummarySection,
  VisaStatus,
  WeatherSection,
} from "@/lib/sections";

const MODEL = "claude-sonnet-4-6";

/** Entry statuses that must be sorted before travel — the only ones the summary flags. */
function needsAdvanceEntry(status: VisaStatus): boolean {
  return status === "evisa" || status === "visa_required" || status === "eta_required";
}

const SYSTEM_PROMPT = `You write the SUMMARY for a pre-trip briefing: 2 to 4 plain sentences a rushed traveller reads INSTEAD of the whole briefing. You are given short summaries of each section (weather, events, safety, entry/admin, interests).

GOAL — an at-a-glance read of the WHOLE trip: touch the things that matter across the sections, in order of decision-relevance, in ONE coherent voice.

TONE CONSISTENCY (this is the most important rule). First find the most serious signal: an elevated safety advisory, a disruptive event on a travel day, a blocking entry requirement, or a specific extreme-weather alert. Let it set the tone for the WHOLE summary.
- If there is a real concern, LEAD with it and stay in that register. You may still note the good parts, but a positive must never stand on its own next to a warning — subordinate it ("the coast and weather are great once you're settled, but…"). NEVER write a breezy line like "great weather, perfect for the beach" beside a safety warning or a serious disruption.
- If nothing is pressing, it is correct to be genuinely positive — do not manufacture caveats.

COVER, DON'T LIST. Weave the relevant points into flowing prose; do not enumerate every section, and skip any section with nothing to say. Be specific (name the strike or festival, the advisory level, the key to-do), but brief.

WHAT TO LEAVE OUT. People are going on holiday — do not pad the summary with non-issues. Only mention SAFETY when there is an elevated advisory (caution / reconsider / do-not-travel); for a normal, safe destination, say nothing about safety. Only mention ENTRY/ADMIN when there is a real barrier that must be arranged before travel (an eVisa, visa, or ETA); for visa-free entry or routine to-dos, say nothing. A clean bill on safety or admin is simply omitted, never stated as reassurance. (You will usually only be handed these lines when they ARE notable — if a section is absent below, it had nothing worth surfacing.)

Do not repeat the destination or the dates (already shown to the user). No preamble ("Here is…", "Overall…"), no bullet points, no markdown. Just the sentence(s).`;

interface Sections {
  events: EventsSection;
  weather: WeatherSection;
  safety: SafetySection;
  admin: AdminSection;
  interests: InterestsSection;
}

/** Synthesise the summary from the assembled sections. */
export async function buildSummary(s: Sections): Promise<SummarySection> {
  const input = composeSignals(s);

  try {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: input }],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join(" ")
      .trim();
    if (!text) throw new Error("empty summary");
    return { kind: "summary", status: "ok", text };
  } catch {
    return { kind: "summary", status: "ok", text: deterministicSummary(s) };
  }
}

export function summaryUnavailable(): SummarySection {
  return { kind: "summary", status: "unavailable", text: "" };
}

/** Compact, signal-only summary of each section for the synthesis prompt. */
function composeSignals(s: Sections): string {
  const lines: string[] = [];

  if (s.events.status === "ok" && s.events.events.length > 0) {
    const items = s.events.events
      .map((e) => `${e.name} (${e.severity}, ${e.timing}, ${e.confidence})`)
      .join("; ");
    lines.push(`Events: ${items}`);
  } else {
    lines.push("Events: none notable for these dates");
  }

  if (s.weather.status === "ok") {
    lines.push(`Weather: ${s.weather.headline} [${s.weather.mode}]`);
  }

  // Safety only matters to the summary when it is NOT normal — a safe place is
  // the default a holidaymaker assumes; don't restate it.
  if (s.safety.status === "ok" && s.safety.level !== "normal") {
    lines.push(`Safety: level=${s.safety.level} — ${s.safety.headline}`);
  }

  // Admin only matters when entry must be ARRANGED ahead (eVisa/visa/ETA).
  // Visa-free entry and routine to-dos live in the card, not the summary.
  if (s.admin.status === "ok") {
    const barriers = s.admin.perNationality.filter((p) =>
      needsAdvanceEntry(p.visaStatus),
    );
    if (barriers.length > 0) {
      const visas = barriers
        .map((p) => `${p.nationality}: ${p.visaStatus}`)
        .join(", ");
      lines.push(`Entry: must be arranged before travel — ${visas}`);
    }
  }

  if (s.interests.status === "ok" && s.interests.interests.length > 0) {
    lines.push(
      `Interests: ${s.interests.interests.map((b) => b.interest).join(", ")}`,
    );
  }

  return lines.join("\n");
}

/** Robust fallback when the synthesis call fails — pick the strongest signal. */
function deterministicSummary(s: Sections): string {
  if (s.safety.status === "ok" && s.safety.level !== "normal") {
    const label =
      s.safety.level === "do_not_travel"
        ? "a Do-Not-Travel advisory"
        : s.safety.level === "reconsider"
          ? "a Reconsider-Travel advisory"
          : "an increased-caution advisory";
    return `Heads-up: ${label} is in effect — review the safety section before you commit.`;
  }

  const disruptive = s.events.status === "ok"
    ? s.events.events.find(
        (e) => e.severity === "disruptive" && e.timing === "travel_day",
      )
    : undefined;
  if (disruptive) {
    return `Watch out for ${disruptive.name} on a travel day — plan around it. See the events section.`;
  }

  if (
    s.admin.status === "ok" &&
    s.admin.perNationality.some((p) => needsAdvanceEntry(p.visaStatus))
  ) {
    return `${s.admin.headline} Otherwise nothing major flagged for your dates.`;
  }

  if (s.weather.status === "ok") {
    return `Nothing major flagged — ${s.weather.headline.toLowerCase()}`;
  }

  return "Nothing major flagged for your trip.";
}
