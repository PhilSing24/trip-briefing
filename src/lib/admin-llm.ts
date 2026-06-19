/**
 * Admin / entry-requirements pass (PROJECT_SPEC §6). Server-only.
 *
 * One Claude (Opus 4.8 + web search) call determines entry requirements per
 * nationality and cites an official government source. Entry rules are
 * high-stakes and change, so the source is always required and the UI shows a
 * verify-before-travel caveat.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type {
  AdminSection,
  Confidence,
  NationalityAdmin,
  ResolvedPlace,
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
  source: z.object({ name: z.string(), url: z.string().nullable() }),
  confidence: z.enum(["high", "moderate", "low"]),
});

const SYSTEM_PROMPT = `You are the ENTRY-REQUIREMENTS analyst for a pre-trip briefing tool. Given a destination and the travellers' nationalities, determine the entry rules for EACH nationality. These rules are high-stakes (a mistake can mean denied boarding), so be accurate and cite an OFFICIAL source.

USE THE web_search TOOL to confirm CURRENT rules — visa regimes, electronic travel authorisations (e.g. ETIAS, ESTA, UK ETA, K-ETA), and passport-validity requirements change. Prefer official government sources: the destination's immigration / foreign-ministry site, or the traveller's own government travel-advice page.

For EACH nationality provide:
- nationality
- visaStatus: one of visa_free | visa_on_arrival | evisa | visa_required | eta_required
- maxStay: the permitted length of stay for this trip's purpose (tourism), e.g. "90 days within any 180-day period"
- toDos: concrete, actionable steps the traveller must take BEFORE or ON arrival — e.g. "Apply for ETIAS online before travel", "Ensure passport is valid for at least 3 months beyond your departure date", "Carry proof of onward travel". Empty array if nothing is required.
- passportValidity: the passport-validity rule, e.g. "Valid for 3 months beyond your departure date"

Also provide:
- source: { name, url } — an OFFICIAL government source you used. This is required; never leave it empty.
- confidence: high | moderate | low — lower it if rules are ambiguous or you could not confirm against an official source.

Be specific to the destination and the trip dates (note if a new requirement like ETIAS becomes active around then). Do not invent requirements; if genuinely unsure, set a to-do to check the official source and lower confidence. Return only the structured object.`;

function placeLabel(place: ResolvedPlace): string {
  return [place.name, place.admin1, place.country].filter(Boolean).join(", ");
}

/** Build the admin section for a place + the travellers' nationalities. */
export async function buildAdminSection(args: {
  place: ResolvedPlace;
  when: DateRange;
  nationalities: string[];
}): Promise<AdminSection> {
  const nationalities = args.nationalities.map((n) => n.trim()).filter(Boolean);
  if (nationalities.length === 0) {
    return adminUnavailable("Add a nationality to see entry requirements.");
  }

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  const userText = [
    `Destination: ${placeLabel(args.place)} (country: ${args.place.country ?? "unknown"})`,
    `Travel dates: ${args.when.start} to ${args.when.end}`,
    `Traveller nationalities: ${nationalities.join(", ")}`,
    `Purpose: tourism / short stay.`,
  ].join("\n");

  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: zodOutputFormat(ResultSchema),
    },
    tools: [{ type: "web_search_20260209", name: "web_search" }],
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userText }],
  });

  const out = res.parsed_output;
  if (!out) throw new Error("Structured admin output was empty");

  const perNationality: NationalityAdmin[] = out.perNationality;
  const confidence: Confidence = out.confidence;

  return {
    kind: "admin",
    status: "ok",
    headline: summarise(perNationality),
    perNationality,
    source: { name: out.source.name, url: out.source.url ?? undefined },
    confidence,
  };
}

/** Graceful-degradation card when the admin pass fails (§9 item 2). */
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

function summarise(per: NationalityAdmin[]): string {
  if (per.length === 0) return "No entry requirements to show.";

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
