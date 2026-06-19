/**
 * Weather tool — Open-Meteo (free, no key). Server-only.
 *
 * Strategy (PROJECT_SPEC §6): a live FORECAST when the trip starts within the
 * forecast horizon (~16 days), otherwise a CLIMATE NORMAL averaged from the
 * historical archive over recent years. The mode is always labelled so an
 * average never reads as a forecast.
 */

import net from "node:net";
import type {
  Confidence,
  ResolvedPlace,
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

const FORECAST_HORIZON_DAYS = 16;
const CLIMATE_YEARS = 10;

const SOURCE = { name: "Open-Meteo", url: "https://open-meteo.com" };

/** Resolve free-text destination → a disambiguated place. Null if not found. */
export async function geocode(destination: string): Promise<ResolvedPlace | null> {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(destination)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data?.results?.[0];
  if (!hit) return null;
  return {
    name: hit.name,
    country: hit.country,
    admin1: hit.admin1,
    latitude: hit.latitude,
    longitude: hit.longitude,
    timezone: hit.timezone,
  };
}

/** Build the weather section for a resolved place + date range. */
export async function getWeather(
  place: ResolvedPlace,
  when: DateRange,
): Promise<WeatherSection> {
  const mode = pickMode(when.start);
  const core =
    mode === "forecast"
      ? await getForecast(place, when)
      : await getClimateNormal(place, when);

  const seaTemp = await getSeaTemp(place, when, mode).catch(() => undefined);

  return assemble(place, when, mode, core, seaTemp);
}

interface CoreWeather {
  tempHigh: number;
  tempLow: number;
  /** mean daily precipitation in mm across the window */
  precipMm: number;
  /** mean daily precipitation probability (forecast only) */
  precipProb?: number;
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
      "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
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
  };
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
): WeatherSection {
  const tempHigh = round(core.tempHigh);
  const tempLow = round(core.tempLow);
  const rainSignal = rainPhrase(core, mode);
  const confidence: Confidence = mode === "forecast" ? "high" : "moderate";

  const warmth = warmthWord(tempHigh);
  const headline =
    mode === "forecast"
      ? `${warmth} — highs around ${tempHigh}°C, lows ${tempLow}°C. ${rainSignal}.`
      : `Typically ${warmth.toLowerCase()} — highs near ${tempHigh}°C, lows ${tempLow}°C. ${rainSignal}.`;

  const detailParts = [
    mode === "forecast"
      ? `Live forecast for ${fmtRange(when)}.`
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
    seaTemp,
    rainSignal,
    confidence,
    source: SOURCE,
  };
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
