import { NextResponse } from "next/server";
import { searchPlaces } from "@/lib/weather";

/**
 * Destination autocomplete (PROJECT_SPEC §3). Proxies Open-Meteo geocoding so the
 * client gets disambiguated place suggestions (Paris FR vs Paris TX) as the user
 * types. Thin and best-effort: a failure returns an empty list, not an error.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    const places = await searchPlaces(q);
    return NextResponse.json({ places });
  } catch {
    return NextResponse.json({ places: [] });
  }
}
