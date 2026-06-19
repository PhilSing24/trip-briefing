import { NextResponse } from "next/server";
import type { TripRequest } from "@/lib/trip";
import type { Briefing } from "@/lib/sections";
import { geocode, getWeather, weatherUnavailable } from "@/lib/weather";

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

  const weather = place
    ? await getWeather(place, body.when).catch((e) =>
        weatherUnavailable(
          e instanceof Error ? e.message : "Weather service is unavailable.",
        ),
      )
    : weatherUnavailable(
        `Couldn't find "${body.destination}". Try a more specific place name.`,
      );

  const briefing: Briefing = { place, weather };
  return NextResponse.json({ briefing });
}
