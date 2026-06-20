/**
 * Weather tool — Open-Meteo (free, no key). Server-only.
 *
 * Strategy (PROJECT_SPEC §6): a live FORECAST when the trip starts within the
 * forecast horizon, otherwise a CLIMATE NORMAL averaged from the historical
 * archive over recent years. The mode is always labelled so an average never
 * reads as a forecast. In forecast mode we ALSO surface the climate normal so
 * the card can say whether the forecast is ordinary or remarkable, and show up
 * to 5 day-by-day tiles for the forecastable portion of the trip.
 */

import net from "node:net";
import type {
  Confidence,
  ResolvedPlace,
  TempAnomaly,
  WeatherCondition,
  WeatherDay,
  WeatherMode,
  WeatherSection,
} from "@/lib/sections";
import type { DateRange } from "@/lib/trip";

// Node 20+ enables Happy Eyeballs with a 250ms per-attempt connect timeout. That
// is too aggressive for higher-latency, un-proxied origins (e.g. the Open-Meteo
// archive host), which then fail with ETIMEDOUT while curl succeeds. Give the
// TCP handshake more room. No-op on runtimes without the setter (e.g. Edge).
net.setDefaultAutoSelectFamilyAttemptTimeout?.(2500);

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";

// Open-Meteo's forecast endpoint serves dates only up to today + 15 (it returns
// 16 daily values counting today). Requesting day +16 is out of range → HTTP 400.
const FORECAST_HORIZON_DAYS = 15;
const CLIMATE_YEARS = 10;

const SOURCE = { name: "Open-Meteo", url: "https://open-meteo.com" };

interface GeocodeHit {
  name: string;
  country?: string;
  country_code?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

function mapHit(hit: GeocodeHit): ResolvedPlace {
  return {
    name: hit.name,
    country: hit.country,
    countryCode: hit.country_code,
    admin1: hit.admin1,
    latitude: hit.latitude,
    longitude: hit.longitude,
    timezone: hit.timezone,
  };
}

/** Resolve free-text destination → a disambiguated place. Null if not found. */
export async function geocode(destination: string): Promise<ResolvedPlace | null> {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(destination)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data?.results?.[0];
  return hit ? mapHit(hit) : null;
}

/** Search disambiguated places for autocomplete (most-relevant first). */
export async function searchPlaces(
  query: string,
  count = 6,
): Promise<ResolvedPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(q)}&count=${count}&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const hits: GeocodeHit[] = data?.results ?? [];
  return hits.map(mapHit);
}

/** Build the weather section for a resolved place + date range. */
export async function getWeather(
  place: ResolvedPlace,
  when: DateRange,
): Promise<WeatherSection> {
  const mode = pickMode(when.start);

  if (mode === "forecast") {
    // Pull the climate normal in parallel too: it's the baseline that tells us
    // whether the forecast is ordinary or remarkable for this place + season.
    // Best-effort — a missing baseline just drops the "unusual for…" framing.
    const [core, normal, seaTemp] = await Promise.all([
      getForecast(place, when),
      getClimateNormal(place, when).catch(() => null),
      getSeaTemp(place, when, mode).catch(() => undefined),
    ]);
    return assemble(place, when, mode, core, seaTemp, normal);
  }

  const [core, seaTemp] = await Promise.all([
    getClimateNormal(place, when),
    getSeaTemp(place, when, mode).catch(() => undefined),
  ]);
  return assemble(place, when, mode, core, seaTemp, null);
}

interface CoreWeather {
  tempHigh: number;
  tempLow: number;
  /** mean daily precipitation in mm across the window */
  precipMm: number;
  /** mean daily precipitation probability (forecast only) */
  precipProb?: number;
  /** per-day breakdown for the first few forecast days (forecast only) */
  days?: WeatherDay[];
}

function pickMode(startISO: string): WeatherMode {
  const start = new Date(`${startISO}T00:00:00`);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + FORECAST_HORIZON_DAYS);
  return start <= horizon ? "forecast" : "climate_normal";
}

async function getForecast(
  place: ResolvedPlace,
  when: DateRange,
): Promise<CoreWeather> {
  // Clamp the end date to the forecast horizon; Open-Meteo can't forecast past it.
  const horizon = toISODate(addDays(new Date(), FORECAST_HORIZON_DAYS));
  const endDate = when.end < horizon ? when.end : horizon;
  const startDate = when.start;

  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunshine_duration,daylight_duration",
    timezone: "auto",
    start_date: startDate,
    end_date: endDate,
  });
  const data = await fetchJson(`${FORECAST_URL}?${params}`);
  const daily = data.daily ?? {};
  return {
    tempHigh: mean(daily.temperature_2m_max),
    tempLow: mean(daily.temperature_2m_min),
    precipMm: mean(daily.precipitation_sum),
    precipProb: mean(daily.precipitation_probability_max),
    days: buildDays(daily),
  };
}

/** First up-to-5 forecast days as squares: weekday + condition icon + high/low. */
function buildDays(daily: Record<string, unknown[]>): WeatherDay[] {
  const times = (daily.time as unknown as string[]) ?? [];
  const codes = daily.weather_code ?? [];
  const maxes = daily.temperature_2m_max ?? [];
  const mins = daily.temperature_2m_min ?? [];
  const probs = daily.precipitation_probability_max ?? [];
  const sunshine = daily.sunshine_duration ?? [];
  const daylight = daily.daylight_duration ?? [];

  const days: WeatherDay[] = [];
  for (let i = 0; i < times.length && days.length < 5; i++) {
    const high = maxes[i];
    const low = mins[i];
    if (typeof high !== "number" || typeof low !== "number") continue;
    const prob = typeof probs[i] === "number" ? round(probs[i] as number) : undefined;
    const sun = sunshine[i];
    const day = daylight[i];
    const sunFraction =
      typeof sun === "number" && typeof day === "number" && day > 0
        ? sun / day
        : undefined;
    days.push({
      date: times[i],
      weekday: weekdayOf(times[i]),
      dateShort: dayMonthOf(times[i]),
      condition: deriveCondition(
        typeof codes[i] === "number" ? (codes[i] as number) : 3,
        prob,
        sunFraction,
      ),
      tempHigh: round(high),
      tempLow: round(low),
      precipProb: prob,
    });
  }
  return days;
}

async function getClimateNormal(
  place: ResolvedPlace,
  when: DateRange,
): Promise<CoreWeather> {
  // One archive request spanning the last CLIMATE_YEARS years, then keep only
  // the days inside the trip's calendar window. A single call avoids the burst
  // rate limit that many concurrent year-requests would hit.
  const startMD = when.start.slice(5); // MM-DD
  const endMD = when.end.slice(5);
  const lastFullYear = new Date().getFullYear() - 1;
  const firstYear = lastFullYear - CLIMATE_YEARS + 1;

  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum",
    timezone: "auto",
    start_date: `${firstYear}-01-01`,
    end_date: `${lastFullYear}-12-31`,
  });
  const data = await fetchJson(`${ARCHIVE_URL}?${params}`);
  const daily = data.daily ?? {};
  const times = (daily.time as unknown as string[]) ?? [];
  const maxes = daily.temperature_2m_max ?? [];
  const mins = daily.temperature_2m_min ?? [];
  const sums = daily.precipitation_sum ?? [];

  const highs: number[] = [];
  const lows: number[] = [];
  const precip: number[] = [];
  times.forEach((t, i) => {
    if (!inWindow(t.slice(5), startMD, endMD)) return;
    if (typeof maxes[i] === "number") highs.push(maxes[i] as number);
    if (typeof mins[i] === "number") lows.push(mins[i] as number);
    if (typeof sums[i] === "number") precip.push(sums[i] as number);
  });

  return {
    tempHigh: mean(highs),
    tempLow: mean(lows),
    precipMm: mean(precip),
  };
}

/** Is calendar day `md` (MM-DD) within [start, end], handling year wrap? */
function inWindow(md: string, startMD: string, endMD: string): boolean {
  return startMD <= endMD
    ? md >= startMD && md <= endMD
    : md >= startMD || md <= endMD;
}

/** Best-effort sea-surface temperature; null/undefined inland or on failure. */
async function getSeaTemp(
  place: ResolvedPlace,
  when: DateRange,
  mode: WeatherMode,
): Promise<number | undefined> {
  // Marine forecast only covers near dates; for climate mode sample last year.
  const start =
    mode === "forecast" ? when.start : shiftYear(when.start, -1);
  const end = mode === "forecast" ? when.end : shiftYear(when.end, -1);

  // Sea-surface temperature is an HOURLY marine variable (not daily).
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    hourly: "sea_surface_temperature",
    timezone: "auto",
    start_date: start,
    end_date: end,
  });
  const data = await fetchJson(`${MARINE_URL}?${params}`);
  const values = numbers(
    (data as { hourly?: Record<string, unknown[]> }).hourly
      ?.sea_surface_temperature,
  );
  if (values.length === 0) return undefined;
  return round(mean(values));
}

function assemble(
  place: ResolvedPlace,
  when: DateRange,
  mode: WeatherMode,
  core: CoreWeather,
  seaTemp: number | undefined,
  normal: CoreWeather | null,
): WeatherSection {
  const tempHigh = round(core.tempHigh);
  const tempLow = round(core.tempLow);
  const rainSignal = rainPhrase(core, mode);
  const confidence: Confidence = mode === "forecast" ? "high" : "moderate";

  // In forecast mode, judge the forecast against the seasonal norm so the
  // headline can say whether this is ordinary or remarkable for the place.
  const tempHighNormal =
    mode === "forecast" && normal && Number.isFinite(normal.tempHigh)
      ? round(normal.tempHigh)
      : undefined;
  const tempLowNormal =
    mode === "forecast" && normal && Number.isFinite(normal.tempLow)
      ? round(normal.tempLow)
      : undefined;
  const anomaly =
    tempHighNormal !== undefined ? classifyAnomaly(tempHigh, tempHighNormal) : undefined;

  const warmth = warmthWord(tempHigh);
  const headline =
    mode === "forecast"
      ? `${warmth} — highs around ${tempHigh}°C, lows ${tempLow}°C. ${anomalyPhrase(anomaly, place, when, tempHigh, tempHighNormal)}`
      : `Typically ${warmth.toLowerCase()} — highs near ${tempHigh}°C, lows ${tempLow}°C. ${rainSignal}.`;

  const detailParts = [
    mode === "forecast"
      ? `Live forecast for ${fmtRange(when)}. ${rainSignal}.`
      : `Based on ${CLIMATE_YEARS}-year averages for ${fmtRange(when)}; not a forecast.`,
  ];
  if (seaTemp !== undefined) {
    detailParts.push(`Sea temperature around ${seaTemp}°C.`);
  }

  return {
    kind: "weather",
    status: "ok",
    headline,
    detail: detailParts.join(" "),
    mode,
    tempHigh,
    tempLow,
    tempHighNormal,
    tempLowNormal,
    anomaly,
    days: core.days,
    seaTemp,
    rainSignal,
    confidence,
    source: SOURCE,
  };
}

/** Forecast-high vs seasonal-norm → an anomaly band. ±3°C is the "normal" margin. */
function classifyAnomaly(high: number, normalHigh: number): TempAnomaly {
  const delta = high - normalHigh;
  if (delta >= 6) return "much_warmer";
  if (delta >= 3) return "warmer";
  if (delta <= -6) return "much_colder";
  if (delta <= -3) return "colder";
  return "normal";
}

/**
 * The contextual line: 32°C means nothing without knowing it's 12° above the
 * Reykjavík norm. Falls back to nothing if there's no baseline to compare to.
 */
function anomalyPhrase(
  anomaly: TempAnomaly | undefined,
  place: ResolvedPlace,
  when: DateRange,
  high: number,
  normalHigh: number | undefined,
): string {
  if (!anomaly || normalHigh === undefined) return "";
  const month = monthName(when.start);
  const delta = Math.abs(high - normalHigh);
  switch (anomaly) {
    case "much_warmer":
      return `Unusually warm for ${place.name} in ${month} — about ${delta}° above the seasonal norm.`;
    case "warmer":
      return `A touch warmer than usual for ${place.name} in ${month}.`;
    case "much_colder":
      return `Unusually cold for ${place.name} in ${month} — about ${delta}° below the seasonal norm.`;
    case "colder":
      return `A touch cooler than usual for ${place.name} in ${month}.`;
    default:
      return `About typical for ${place.name} in ${month}.`;
  }
}

/** Graceful-degradation card when the destination or data can't be fetched. */
export function weatherUnavailable(reason: string): WeatherSection {
  return {
    kind: "weather",
    status: "unavailable",
    headline: "Couldn't check the weather",
    detail: reason,
    confidence: "low",
    source: SOURCE,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────

function rainPhrase(core: CoreWeather, mode: WeatherMode): string {
  if (mode === "forecast" && core.precipProb !== undefined) {
    if (core.precipProb >= 60) return "Wet — pack rain gear";
    if (core.precipProb >= 30) return "Some showers possible";
    return "Mostly dry";
  }
  // climate: only precipitation amount is available historically
  if (core.precipMm >= 5) return "Often wet this time of year";
  if (core.precipMm >= 1) return "Occasional rain is typical";
  return "Typically dry";
}

/** A WMO code that means precipitation (drizzle/rain/snow/showers/thunder). */
function isPrecipCode(code: number): boolean {
  return (
    (code >= 51 && code <= 67) || (code >= 71 && code <= 86) || code >= 95
  );
}

/** Minimum rain probability before a precip code earns a wet glyph. */
const WET_PROB_THRESHOLD = 30;

/**
 * Coarse sky condition for the icon. The daily `weather_code` is pessimistic —
 * it reports the day's *most significant* weather, so a near-cloudless 40°C day
 * comes back as "overcast" and a single passing shower flips a sunny day to
 * "showers". So we only trust it for the *type* of wet weather (and gate that on
 * a real rain chance); for dry days we let actual sunshine decide how cloudy it
 * looks.
 */
function deriveCondition(
  code: number,
  precipProb: number | undefined,
  sunFraction: number | undefined,
): WeatherCondition {
  if (code === 45 || code === 48) return "fog";

  if (isPrecipCode(code) && (precipProb ?? 0) >= WET_PROB_THRESHOLD) {
    if (code >= 95) return "thunder";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
    return "rain";
  }

  // Dry day: sunshine fraction (sunshine ÷ daylight) is the honest sky signal.
  if (sunFraction !== undefined) {
    if (sunFraction >= 0.7) return "clear";
    if (sunFraction >= 0.4) return "partly";
    return "cloudy";
  }

  // No sunshine data — fall back to the coarse code.
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly";
  return "cloudy";
}

function weekdayOf(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
  });
}

function monthName(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    month: "long",
  });
}

function dayMonthOf(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function warmthWord(tempHigh: number): string {
  if (tempHigh >= 30) return "Hot";
  if (tempHigh >= 24) return "Warm";
  if (tempHigh >= 17) return "Mild";
  if (tempHigh >= 9) return "Cool";
  return "Cold";
}

async function fetchJson(url: string): Promise<Record<string, unknown> & { daily?: Record<string, unknown[]> }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = await res.json();
  if (json?.error) throw new Error(String(json.reason ?? "Open-Meteo error"));
  return json;
}

function numbers(arr: unknown): number[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((v): v is number => typeof v === "number");
}

function mean(arr: unknown): number {
  const nums = numbers(arr);
  if (nums.length === 0) return NaN;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round(n: number): number {
  return Math.round(n);
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function shiftYear(iso: string, delta: number): string {
  const [y, rest] = [iso.slice(0, 4), iso.slice(4)];
  return `${Number(y) + delta}${rest}`;
}

function fmtRange(when: DateRange): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const s = new Date(`${when.start}T00:00:00`).toLocaleDateString("en-GB", opts);
  const e = new Date(`${when.end}T00:00:00`).toLocaleDateString("en-GB", opts);
  return `${s}–${e}`;
}
