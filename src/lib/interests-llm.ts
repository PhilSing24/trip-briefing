/**
 * Interests pass (PROJECT_SPEC §6). Server-only.
 *
 * Driven by the free-text box. Knowledge-sourced and EVERGREEN — local
 * specialities, cultural context, things a place is known for — never ranked
 * picks (the guiding principle: "what you should know about a place you've
 * chosen", not "help me choose"). No web search needed, so this uses Sonnet 4.6
 * (routine knowledge work per CLAUDE.md). Skipped entirely when no cue is given.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type {
  InterestBlock,
  InterestsSection,
  ResolvedPlace,
} from "@/lib/sections";

const MODEL = "claude-sonnet-4-6";

const ResultSchema = z.object({
  interests: z.array(
    z.object({
      interest: z.string(),
      headline: z.string().nullable(),
      items: z.array(z.object({ name: z.string(), note: z.string() })),
      logistics: z.string().nullable(),
    }),
  ),
});

const SYSTEM_PROMPT = `You are the INTERESTS analyst for a pre-trip briefing tool. The traveller has already chosen their destination. From their free-text note, detect the interests they express (food, sport, art, history, nightlife, diving, architecture…) and give them EVERGREEN local CONTEXT for the destination.

HARD RULE — you are NOT a recommender. Never rank or pick options for the traveller. Do not output "the best restaurant", "top 5 things to do", or specific venues to choose between. Provide KNOWLEDGE about the place: local specialities, what the area is known for, cultural notes, the shape of the scene. The line: in scope = "what you should know about food/sport/art here"; out of scope = "here's where you should go".

For each detected interest:
- interest: a short label, e.g. "food", "hiking"
- headline: one-line framing of that interest here (or null)
- items: a few { name, note } — a local speciality, a notable feature, a cultural point. name is the thing; note explains what it is / why it's notable (knowledge, not a directive to visit).
- logistics: OPTIONAL briefing-safe practical note only — e.g. "popular places book up weeks ahead in summer", "diving is best arranged in advance". Null if none. This is the one place you may touch logistics; never turn it into a recommendation.

Only include interests the traveller actually expressed. If the note contains no genuine interest cue (e.g. it only states a constraint like "travelling with grandparents"), return an empty interests array. Do NOT list dated events or happenings — those belong to a separate events section; keep strictly to evergreen context. Return only the structured object.`;

function placeLabel(place: ResolvedPlace): string {
  return [place.name, place.admin1, place.country].filter(Boolean).join(", ");
}

/** Build the interests section from the free-text note. Skips the LLM if empty. */
export async function buildInterestsSection(args: {
  place: ResolvedPlace;
  notes: string;
}): Promise<InterestsSection> {
  const notes = args.notes.trim();
  if (!notes) {
    return {
      kind: "interests",
      status: "ok",
      headline:
        "Tell us your interests in “Anything else?” for tailored local context.",
      interests: [],
    };
  }

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(ResultSchema) },
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: `Destination: ${placeLabel(args.place)}\nTraveller note: ${notes}`,
      },
    ],
  });

  const out = res.parsed_output;
  if (!out) throw new Error("Structured interests output was empty");

  const interests: InterestBlock[] = out.interests.map((b) => ({
    interest: b.interest,
    headline: b.headline ?? undefined,
    items: b.items,
    logistics: b.logistics ?? undefined,
  }));

  return {
    kind: "interests",
    status: "ok",
    headline: summarise(interests),
    interests,
  };
}

/** Graceful-degradation card when the interests pass fails (§9 item 2). */
export function interestsUnavailable(reason: string): InterestsSection {
  return {
    kind: "interests",
    status: "unavailable",
    headline: "Couldn't pull interest context",
    detail: reason,
    interests: [],
  };
}

function summarise(interests: InterestBlock[]): string {
  if (interests.length === 0) {
    return "Nothing specific to tailor from your note.";
  }
  const labels = interests.map((b) => b.interest).join(", ");
  return `Local context for ${labels}.`;
}
