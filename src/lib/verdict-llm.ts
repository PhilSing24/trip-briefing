/**
 * Verdict synthesis (PROJECT_SPEC §4). Server-only.
 *
 * A final, cheap pass over the OTHER sections' already-computed signals (not raw
 * data) → one or two plain sentences a rushed traveller reads instead of the
 * whole briefing. Sonnet 4.6, no web search, runs after the parallel section
 * calls. Falls back to a deterministic line if the call fails.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  AdminSection,
  EventsSection,
  InterestsSection,
  SafetySection,
  VerdictSection,
  WeatherSection,
} from "@/lib/sections";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You write the VERDICT line for a pre-trip briefing: 1 to 2 plain sentences a rushed traveller reads INSTEAD of the whole briefing. You are given short summaries of each section.

- Lead with what is most decision-relevant. A disruption on a travel day, an elevated safety advisory, or a visa/authorisation that must be arranged outranks the weather. When nothing is pressing, a calm one-liner about the trip is right.
- Mention only what matters — do NOT list every section. Be specific but brief (name the strike or festival, the advisory level, the key to-do).
- Do not repeat the destination or the dates (already shown to the user). No preamble ("Here is…", "Overall…"), no bullet points, no markdown. Just the sentence(s).`;

interface Sections {
  events: EventsSection;
  weather: WeatherSection;
  safety: SafetySection;
  admin: AdminSection;
  interests: InterestsSection;
}

/** Synthesise the verdict from the assembled sections. */
export async function buildVerdict(s: Sections): Promise<VerdictSection> {
  const summary = composeSummary(s);

  try {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: summary }],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join(" ")
      .trim();
    if (!text) throw new Error("empty verdict");
    return { kind: "verdict", status: "ok", text };
  } catch {
    return { kind: "verdict", status: "ok", text: deterministicVerdict(s) };
  }
}

export function verdictUnavailable(): VerdictSection {
  return { kind: "verdict", status: "unavailable", text: "" };
}

/** Compact, signal-only summary of each section for the verdict prompt. */
function composeSummary(s: Sections): string {
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

  if (s.safety.status === "ok") {
    lines.push(`Safety: level=${s.safety.level} — ${s.safety.headline}`);
  }

  if (s.admin.status === "ok") {
    const visas = s.admin.perNationality
      .map((p) => `${p.nationality}: ${p.visaStatus}`)
      .join(", ");
    lines.push(`Entry: ${s.admin.headline}${visas ? ` (${visas})` : ""}`);
  }

  if (s.interests.status === "ok" && s.interests.interests.length > 0) {
    lines.push(
      `Interests: ${s.interests.interests.map((b) => b.interest).join(", ")}`,
    );
  }

  return lines.join("\n");
}

/** Robust fallback when the verdict call fails — pick the strongest signal. */
function deterministicVerdict(s: Sections): string {
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

  if (s.admin.status === "ok" && s.admin.perNationality.some((p) => p.toDos.length > 0)) {
    return `${s.admin.headline} Otherwise nothing major flagged for your dates.`;
  }

  if (s.weather.status === "ok") {
    return `Nothing major flagged — ${s.weather.headline.toLowerCase()}`;
  }

  return "Nothing major flagged for your trip.";
}
