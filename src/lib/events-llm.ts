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
import { getPublicHolidays, type PublicHoliday } from "@/lib/holidays";

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

INCLUSION GATE — the bar is a CLEAR, CONCRETE IMPACT on THIS trip, positive OR negative (it does not have to be a problem). Include an event only if it materially shapes the trip: it affects transport, crowds, prices, closures, sea conditions, or safety — OR it is a positive happening significant enough that the traveller would actively plan their day or route around it (e.g. a major festival or a waterfront parade that draws heavy boat traffic). Do NOT include an event merely because it is enjoyable or happening nearby. A pleasant but inconsequential event — e.g. a low-key free open-air concert that changes nothing about the traveller's logistics, time, or plans — is out of scope (that is discovery; evergreen "nice things to do" belong to a different section). If an event has no concrete impact, OMIT IT ENTIRELY — never invent a blastSurface to justify including it.

PUBLIC HOLIDAYS. You are also given the official public holidays that fall in or near the window. Treat a holiday as a candidate event ONLY when it materially shapes THIS trip — widespread shop/bank/pharmacy closures, holiday crowds at attractions or the coast, packed or reduced public transport, or surge prices. Choose blastSurface from what it actually disrupts (holiday crowds → crowd_surge; packed/reduced ferries or transport → capacity_peak; higher prices → price_surge) and put the closure detail in why/whatToDo (e.g. "most shops, banks and pharmacies shut — stock up the day before"). Use eventType religious or cultural. A NATIONWIDE holiday bites harder than a regional one — weight a regional holiday down and say so. How much actually closes varies a lot by country (near-total in much of central/northern Europe; lighter in the south except the biggest holidays such as Ferragosto) — judge realistically. A holiday that changes nothing for this traveller is out of scope — omit it; do not list a holiday just because it exists.

DISCRETE & DATED — an event must be a SPECIFIC, TIME-BOUNDED OCCURRENCE with real start/end dates that overlap or border the trip window: a named strike, an announced closure or major works, a specific festival / match / concert / parade, a summit, an election. It happens ON DATES — it is not a standing condition. DO NOT dress up ambient or perpetual conditions as events: general "regional tensions", ongoing economic or energy conditions, generically high prices, everyday traffic/congestion, baseline crime, or typical seasonal weather are NOT events. Standing safety risk belongs to the safety section; typical seasonal conditions belong to the weather section — do not duplicate them here. Only treat weather as an event when there is a SPECIFIC, DATED official warning (a named storm, or an issued heat/flood red-alert for those dates) — never "it is typically hot". If you cannot state concrete dates for a specific occurrence, it is not an event — omit it.

For each event provide:
- name; dates {start,end} as ISO yyyy-mm-dd (events can span days); location (may be a transport hub, not the destination); eventType
- blastSurface: which disruption surfaces it creates, from the SAME vocabulary as vulnerabilityProfile (strikes, crowd_surge, road_closure, sea_traffic, weather_sensitive, capacity_peak, security_ops, price_surge). The system matches events to the access chain by SET INTERSECTION of blastSurface against each link's vulnerabilityProfile, so choose tags that mirror what the event actually disrupts (regatta → sea_traffic; air-traffic-control strike → strikes; marathon → road_closure, crowd_surge; heatwave → weather_sensitive).
- inDestination: true if it physically happens in the destination itself
- severityHint: your judgement of the DEGREE of impact only — disruptive (impedes travel/plans), enhancing (a POSITIVE impact worth planning around — not merely enjoyable), or neutral. Never use context_only; the system assigns that for out-of-window events.
- headline (one line); why (why it matters for THIS trip specifically)
- whatToDo: brief mitigation, ONLY for disruptive/enhancing events (else null)
- confidence: confirmed | likely | rumoured
- source: {name, url} from your search when available (else null)

Re-weight by the traveller's stated interests: when an event that ALREADY clears the impact gate also matches a stated interest, lean its severityHint toward "enhancing". Interests never justify including a no-impact event.

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

/** Format the holiday facts handed to the model (empty → an explicit "none"). */
function holidayLines(holidays: PublicHoliday[]): string {
  if (holidays.length === 0) return "Public holidays in window: none";
  const items = holidays
    .map(
      (h) =>
        `${h.date} ${h.name}${h.localName && h.localName !== h.name ? ` (${h.localName})` : ""} — ${h.nationwide ? "nationwide" : "regional"}`,
    )
    .join("; ");
  return `Public holidays in window: ${items}`;
}

/** Call Claude for the access chain + candidate events. */
export async function generateEventsAndChain(args: {
  place: ResolvedPlace;
  when: DateRange;
  party: PartyValue;
  notes: string;
  holidays: PublicHoliday[];
}): Promise<{ chain: AccessChainLink[]; candidates: CandidateEvent[] }> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  const userText = [
    `Destination: ${placeLabel(args.place)} (lat ${args.place.latitude}, lon ${args.place.longitude})`,
    `Travel dates: ${args.when.start} to ${args.when.end}`,
    `Party: ${partyLabel(args.party)}`,
    `Interests / notes: ${args.notes.trim() || "none given"}`,
    holidayLines(args.holidays),
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
  // Public holidays are best-effort context for the synthesis — never block on them.
  const holidays = await getPublicHolidays(args.place, args.when).catch(() => []);
  const { chain, candidates } = await generateEventsAndChain({ ...args, holidays });
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
