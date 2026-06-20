import { NextResponse } from "next/server";
import type { TripRequest } from "@/lib/trip";
import type { Briefing } from "@/lib/sections";
import { geocode, getWeather, weatherUnavailable } from "@/lib/weather";
import { buildEventsSection, eventsUnavailable } from "@/lib/events-llm";
import {
  buildEntryAndSafety,
  adminUnavailable,
  safetyUnavailable,
} from "@/lib/entry-safety-llm";
import { buildInterestsSection, interestsUnavailable } from "@/lib/interests-llm";
import { buildSummary, summaryUnavailable } from "@/lib/summary-llm";

/**
 * The single backend entry point (PROJECT_SPEC §8). For this slice it runs one
 * tool — weather. Future slices add events / safety / admin as parallel calls
 * plus the LLM synthesis pass, all returning into this same Briefing payload.
 */
export async function POST(req: Request) {
  let body: TripRequest;
  try {
    body = (await req.json()) as TripRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.destination?.trim() || !body?.when?.start || !body?.when?.end) {
    return NextResponse.json(
      { error: "destination and a start/end date are required" },
      { status: 422 },
    );
  }

  // The form passes a resolved place when the user picked one from autocomplete;
  // otherwise fall back to geocoding the typed text.
  const place =
    body.place ?? (await geocode(body.destination).catch(() => null));

  if (!place) {
    const notFound = `Couldn't find "${body.destination}". Try a more specific place name.`;
    const briefing: Briefing = {
      place: null,
      summary: summaryUnavailable(),
      events: eventsUnavailable(notFound),
      weather: weatherUnavailable(notFound),
      safety: safetyUnavailable(notFound),
      admin: adminUnavailable(notFound),
      interests: interestsUnavailable(notFound),
    };
    return NextResponse.json({ briefing });
  }

  // Dev shortcut: BRIEFING_WEATHER_ONLY skips the (slow, paid) LLM sections so
  // the weather card can be iterated on quickly and cheaply. The other sections
  // get placeholders; the UI hides them when `weatherOnly` is set.
  if (process.env.BRIEFING_WEATHER_ONLY) {
    const weather = await getWeather(place, body.when).catch((e) =>
      weatherUnavailable(
        e instanceof Error ? e.message : "Weather service is unavailable.",
      ),
    );
    const disabled = "Disabled while iterating on the weather card.";
    const briefing: Briefing = {
      place,
      weatherOnly: true,
      summary: summaryUnavailable(),
      events: eventsUnavailable(disabled),
      weather,
      safety: safetyUnavailable(disabled),
      admin: adminUnavailable(disabled),
      interests: interestsUnavailable(disabled),
    };
    return NextResponse.json({ briefing });
  }

  // Run the tools in parallel; each degrades gracefully on its own.
  const [events, weather, entry, interests] = await Promise.all([
    buildEventsSection({
      place,
      when: body.when,
      party: body.party,
      notes: body.notes ?? "",
    }).catch((e) =>
      eventsUnavailable(
        e instanceof Error ? e.message : "Events service is unavailable.",
      ),
    ),
    getWeather(place, body.when).catch((e) =>
      weatherUnavailable(
        e instanceof Error ? e.message : "Weather service is unavailable.",
      ),
    ),
    buildEntryAndSafety({
      place,
      when: body.when,
      nationalities: body.nationalities ?? [],
    }).catch((e) => {
      const reason =
        e instanceof Error ? e.message : "Entry/safety service is unavailable.";
      return { admin: adminUnavailable(reason), safety: safetyUnavailable(reason) };
    }),
    buildInterestsSection({ place, notes: body.notes ?? "" }).catch((e) =>
      interestsUnavailable(
        e instanceof Error ? e.message : "Interests service is unavailable.",
      ),
    ),
  ]);

  // Summary synthesises the sections, so it runs last (a few seconds on Sonnet).
  const summary = await buildSummary({
    events,
    weather,
    safety: entry.safety,
    admin: entry.admin,
    interests,
  });

  const briefing: Briefing = {
    place,
    summary,
    events,
    weather,
    safety: entry.safety,
    admin: entry.admin,
    interests,
  };
  return NextResponse.json({ briefing });
}
