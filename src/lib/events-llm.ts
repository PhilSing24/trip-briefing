/**
 * The events synthesis pass (PROJECT_SPEC §5, §8). Server-only.
 *
 * One Claude call (Opus 4.8 + web search) produces the access chain AND the
 * candidate events with their human layer. It deliberately does NOT compute the
 * match — `chain_links_touched`, timing, and final severity are decided
 * deterministically by matchEvents() in events.ts. The model supplies knowledge,
 * writing, and the severity *degree* only (§5c).
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type {
  AccessChainLink,
  CandidateEvent,
  Confidence,
  EventsSection,
  ResolvedPlace,
} from "@/lib/sections";
import type { DateRange, PartyValue } from "@/lib/trip";
import { matchEvents } from "@/lib/events";

const MODEL = "claude-opus-4-8";

const VULN = z.enum([
  "strikes",
  "crowd_surge",
  "road_closure",
  "sea_traffic",
  "weather_sensitive",
  "capacity_peak",
  "security_ops",
  "price_surge",
]);

const ResultSchema = z.object({
  accessChain: z.array(
    z.object({
      name: z.string(),
      type: z.enum([
        "airport",
        "sea_port",
        "ground_transfer",
        "ferry_crossing",
        "local_transport",
        "the_destination_itself",
      ]),
      vulnerabilityProfile: z.array(VULN),
      confidence: z.enum(["high", "moderate", "low"]),
    }),
  ),
  events: z.array(
    z.object({
      name: z.string(),
      dates: z.object({ start: z.string(), end: z.string() }),
      location: z.string(),
      eventType: z.enum([
        "sport",
        "festival",
        "religious",
        "cultural",
        "political",
        "disruption",
        "weather",
      ]),
      blastSurface: z.array(VULN),
      inDestination: z.boolean(),
      severityHint: z.enum(["disruptive", "enhancing", "neutral"]).nullable(),
      headline: z.string(),
      why: z.string(),
      whatToDo: z.string().nullable(),
      confidence: z.enum(["confirmed", "likely", "rumoured"]),
      source: z.object({ name: z.string(), url: z.string().nullable() }).nullable(),
    }),
  ),
});

const SYSTEM_PROMPT = `You are the EVENTS analyst for a pre-trip briefing tool. The traveller has already chosen their destination — you never recommend or rank destinations. Your job has two parts.

PART 1 — ACCESS CHAIN. Describe how a traveller physically reaches and moves around the destination, as an ordered list of links (this is structural geography you can reason about reliably). For each link give:
- name (e.g. "Naples airport", "Ferry crossing")
- type: one of airport | sea_port | ground_transfer | ferry_crossing | local_transport | the_destination_itself
- vulnerabilityProfile: which kinds of disruption the link is exposed to, drawn from: strikes, crowd_surge, road_closure, sea_traffic, weather_sensitive, capacity_peak, security_ops, price_surge
- confidence: high | moderate | low
Always include "the_destination_itself" as the final link. Cover the realistic chain (airports, transfers, ports, ferries, local transport) a typical traveller uses.

PART 2 — EVENTS. Surface events that could affect THIS trip during or just around the dates, of two kinds:
- cultural: festivals, sport, concerts, religious occasions, political (summits/elections)
- disruption: strikes, planned closures, major works — usually news-sourced
USE THE web_search TOOL to find dated, current information — especially announced or threatened strikes and this year's event calendar. Surface rumoured/threatened disruptions too, tagged honestly as confidence: rumoured — early warning is the whole point.

For each event provide:
- name; dates {start,end} as ISO yyyy-mm-dd (events can span days); location (may be a transport hub, not the destination); eventType
- blastSurface: which disruption surfaces it creates, from the SAME vocabulary as vulnerabilityProfile (strikes, crowd_surge, road_closure, sea_traffic, weather_sensitive, capacity_peak, security_ops, price_surge). The system matches events to the access chain by SET INTERSECTION of blastSurface against each link's vulnerabilityProfile, so choose tags that mirror what the event actually disrupts (regatta → sea_traffic; air-traffic-control strike → strikes; marathon → road_closure, crowd_surge; heatwave → weather_sensitive).
- inDestination: true if it physically happens in the destination itself
- severityHint: your judgement of DEGREE only — disruptive (impedes travel/plans), enhancing (a plus worth catching), or neutral. Never use context_only; the system assigns that for out-of-window events.
- headline (one line); why (why it matters for THIS trip specifically)
- whatToDo: brief mitigation, ONLY for disruptive/enhancing events (else null)
- confidence: confirmed | likely | rumoured
- source: {name, url} from your search when available (else null)

Re-weight by the traveller's stated interests: an interest that matches an event pushes it toward "enhancing".

Do NOT compute which chain links are touched, the timing, or the final severity LEVEL — the system derives those deterministically from your blastSurface + dates. You only supply blastSurface, dates, and your severityHint.

Return only the structured object { accessChain, events }. If you genuinely find no relevant events, return an empty events array (still provide the access chain).`;

function placeLabel(place: ResolvedPlace): string {
  return [place.name, place.admin1, place.country].filter(Boolean).join(", ");
}

function partyLabel(party: PartyValue): string {
  const adults = `${party.adults} adult${party.adults === 1 ? "" : "s"}`;
  if (party.childrenAges.length === 0) return adults;
  return `${adults}, children aged ${party.childrenAges.join(", ")}`;
}

/** Call Claude for the access chain + candidate events. */
export async function generateEventsAndChain(args: {
  place: ResolvedPlace;
  when: DateRange;
  party: PartyValue;
  notes: string;
}): Promise<{ chain: AccessChainLink[]; candidates: CandidateEvent[] }> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  const userText = [
    `Destination: ${placeLabel(args.place)} (lat ${args.place.latitude}, lon ${args.place.longitude})`,
    `Travel dates: ${args.when.start} to ${args.when.end}`,
    `Party: ${partyLabel(args.party)}`,
    `Interests / notes: ${args.notes.trim() || "none given"}`,
  ].join("\n");

  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
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
  if (!out) throw new Error("Structured events output was empty");

  const chain: AccessChainLink[] = out.accessChain;
  const candidates: CandidateEvent[] = out.events.map((e) => ({
    name: e.name,
    dates: e.dates,
    location: e.location,
    eventType: e.eventType,
    blastSurface: e.blastSurface,
    inDestination: e.inDestination,
    severityHint: e.severityHint ?? undefined,
    headline: e.headline,
    why: e.why,
    whatToDo: e.whatToDo ?? undefined,
    confidence: e.confidence,
    source: e.source ? { name: e.source.name, url: e.source.url ?? undefined } : undefined,
  }));

  return { chain, candidates };
}

/** Full events section: generate → deterministically match → summarise. */
export async function buildEventsSection(args: {
  place: ResolvedPlace;
  when: DateRange;
  party: PartyValue;
  notes: string;
}): Promise<EventsSection> {
  const { chain, candidates } = await generateEventsAndChain(args);
  const events = matchEvents(candidates, chain, args.when);

  const chainConfidence: Confidence = chain.some((l) => l.confidence === "low")
    ? "low"
    : chain.some((l) => l.confidence === "moderate")
      ? "moderate"
      : "high";

  return {
    kind: "events",
    status: "ok",
    headline: summarise(events),
    chain,
    events,
    confidence: chainConfidence,
  };
}

/** Graceful-degradation card when the events pass fails (§9 item 2). */
export function eventsUnavailable(reason: string): EventsSection {
  return {
    kind: "events",
    status: "unavailable",
    headline: "Couldn't check events",
    chain: [],
    events: [],
    confidence: "low",
    detail: reason,
  };
}

function summarise(events: EventsSection["events"]): string {
  const disruptive = events.filter((e) => e.severity === "disruptive").length;
  const enhancing = events.filter((e) => e.severity === "enhancing").length;

  if (disruptive > 0) {
    return `${disruptive} possible disruption${disruptive === 1 ? "" : "s"} on your access route${
      enhancing > 0 ? `, plus ${enhancing} worth catching` : ""
    }.`;
  }
  if (enhancing > 0) {
    return `${enhancing} event${enhancing === 1 ? "" : "s"} worth catching during your trip.`;
  }
  if (events.length > 0) return "Some events noted, none expected to disrupt travel.";
  return "No notable events found for your dates.";
}
