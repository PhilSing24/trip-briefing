import { NextResponse } from "next/server";
import type { TripRequest } from "@/lib/trip";
import type { Briefing } from "@/lib/sections";
import { geocode, getWeather, weatherUnavailable } from "@/lib/weather";
import { buildEventsSection, eventsUnavailable } from "@/lib/events-llm";
import { buildAdminSection, adminUnavailable } from "@/lib/admin-llm";

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

  const place = await geocode(body.destination).catch(() => null);

  if (!place) {
    const notFound = `Couldn't find "${body.destination}". Try a more specific place name.`;
    const briefing: Briefing = {
      place: null,
      events: eventsUnavailable(notFound),
      weather: weatherUnavailable(notFound),
      admin: adminUnavailable(notFound),
    };
    return NextResponse.json({ briefing });
  }

  // Run the tools in parallel; each degrades gracefully on its own.
  const [events, weather, admin] = await Promise.all([
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
    buildAdminSection({
      place,
      when: body.when,
      nationalities: body.nationalities ?? [],
    }).catch((e) =>
      adminUnavailable(
        e instanceof Error ? e.message : "Entry-requirements service is unavailable.",
      ),
    ),
  ]);

  const briefing: Briefing = { place, events, weather, admin };
  return NextResponse.json({ briefing });
}
