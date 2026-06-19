/**
 * Entry-requirements + safety pass (PROJECT_SPEC §6). Server-only.
 *
 * Both sections come from official government sources and are cited, so one
 * Claude (Opus 4.8 + web search) call produces both — entry rules per
 * nationality AND the destination's travel-advisory level — rather than two
 * separate slow calls. The route splits the result into two cards.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type {
  AdminSection,
  Confidence,
  NationalityAdmin,
  ResolvedPlace,
  SafetySection,
} from "@/lib/sections";
import type { DateRange } from "@/lib/trip";

const MODEL = "claude-opus-4-8";

const ResultSchema = z.object({
  perNationality: z.array(
    z.object({
      nationality: z.string(),
      visaStatus: z.enum([
        "visa_free",
        "visa_on_arrival",
        "evisa",
        "visa_required",
        "eta_required",
      ]),
      maxStay: z.string(),
      toDos: z.array(z.string()),
      passportValidity: z.string(),
    }),
  ),
  adminSource: z.object({ name: z.string(), url: z.string().nullable() }),
  adminConfidence: z.enum(["high", "moderate", "low"]),
  safety: z.object({
    level: z.enum(["normal", "caution", "reconsider", "do_not_travel"]),
    headline: z.string(),
    detail: z.string().nullable(),
    source: z.object({ name: z.string(), url: z.string().nullable() }),
    confidence: z.enum(["high", "moderate", "low"]),
  }),
});

const SYSTEM_PROMPT = `You are the OFFICIAL-SOURCES analyst for a pre-trip briefing tool. Given a destination and the travellers' nationalities, you produce two things, both from OFFICIAL government sources and both cited. These are high-stakes (mistakes can mean denied boarding or an unsafe trip), so be accurate. USE THE web_search TOOL to confirm CURRENT information for both parts.

PART A — ENTRY REQUIREMENTS. For EACH nationality, determine the rules for a tourism / short stay. Prefer the destination's immigration / foreign-ministry site or the traveller's own government travel-advice page.
- nationality
- visaStatus: visa_free | visa_on_arrival | evisa | visa_required | eta_required
- maxStay: permitted length of stay, e.g. "90 days within any 180-day period"
- toDos: concrete steps to take BEFORE or ON arrival — e.g. "Apply for ETIAS online before travel", "Ensure passport is valid 3+ months beyond departure", "Carry proof of onward travel". Empty array if nothing is required.
- passportValidity: e.g. "Valid for 3 months beyond your departure date"
Then: adminSource { name, url } — an OFFICIAL source you used (required); and adminConfidence (lower it if you could not confirm against an official source).

PART B — SAFETY / GEOPOLITICAL RISK. Determine the destination's current overall travel-safety level from OFFICIAL government travel advisories (US State Department, UK FCDO, Australia Smartraveller, Canada). Choose the advisory most relevant to these travellers' nationalities (UK FCDO for British, US State Dept for Americans, etc.); for mixed groups pick the most relevant primary issuer and note in the detail if governments differ materially.
- level: normal (State Dept Level 1 / FCDO no specific warning) | caution (Level 2 / increased caution) | reconsider (Level 3) | do_not_travel (Level 4)
- headline: one line; tone calm when normal, serious when high
- detail: ONLY when level is above normal — the concern and any regions to avoid; null when level is normal
- source: { name, url } — the official advisory; name is the issuing authority (e.g. "UK FCDO"); required

Do not invent requirements or inflate risk. If genuinely unsure on entry rules, add a to-do to check the official source and lower confidence. Return only the structured object.`;

function placeLabel(place: ResolvedPlace): string {
  return [place.name, place.admin1, place.country].filter(Boolean).join(", ");
}

/** One call → both the admin (entry) section and the safety section. */
export async function buildEntryAndSafety(args: {
  place: ResolvedPlace;
  when: DateRange;
  nationalities: string[];
}): Promise<{ admin: AdminSection; safety: SafetySection }> {
  const nationalities = args.nationalities.map((n) => n.trim()).filter(Boolean);

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  const userText = [
    `Destination: ${placeLabel(args.place)} (country: ${args.place.country ?? "unknown"})`,
    `Travel dates: ${args.when.start} to ${args.when.end}`,
    `Traveller nationalities: ${nationalities.length ? nationalities.join(", ") : "none given"}`,
    `Purpose: tourism / short stay.`,
  ].join("\n");

  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(ResultSchema) },
    tools: [{ type: "web_search_20260209", name: "web_search" }],
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userText }],
  });

  const out = res.parsed_output;
  if (!out) throw new Error("Structured entry/safety output was empty");

  const perNationality: NationalityAdmin[] = out.perNationality;
  const admin: AdminSection = {
    kind: "admin",
    status: "ok",
    headline: summariseAdmin(perNationality),
    perNationality,
    source: { name: out.adminSource.name, url: out.adminSource.url ?? undefined },
    confidence: out.adminConfidence as Confidence,
  };

  const safety: SafetySection = {
    kind: "safety",
    status: "ok",
    level: out.safety.level,
    headline: out.safety.headline,
    detail: out.safety.detail ?? undefined,
    source: {
      name: out.safety.source.name,
      url: out.safety.source.url ?? undefined,
    },
    confidence: out.safety.confidence as Confidence,
  };

  return { admin, safety };
}

/** Graceful-degradation cards when the call fails (§9 item 2). */
export function adminUnavailable(reason: string): AdminSection {
  return {
    kind: "admin",
    status: "unavailable",
    headline: "Couldn't check entry requirements",
    detail: reason,
    perNationality: [],
    source: { name: "—" },
    confidence: "low",
  };
}

export function safetyUnavailable(reason: string): SafetySection {
  return {
    kind: "safety",
    status: "unavailable",
    level: "normal",
    headline: "Couldn't check the travel advisory",
    detail: reason,
    source: { name: "—" },
    confidence: "low",
  };
}

function summariseAdmin(per: NationalityAdmin[]): string {
  if (per.length === 0) return "Add a nationality to see entry requirements.";

  const totalToDos = per.reduce((n, p) => n + p.toDos.length, 0);
  const allVisaFree = per.every((p) => p.visaStatus === "visa_free");

  if (allVisaFree && totalToDos === 0) {
    return per.length === 1
      ? "Visa-free entry — nothing to arrange."
      : "Visa-free for everyone — nothing to arrange.";
  }
  if (totalToDos > 0) {
    return `${totalToDos} thing${totalToDos === 1 ? "" : "s"} to sort before you travel.`;
  }
  return "Check the per-nationality entry rules below.";
}
