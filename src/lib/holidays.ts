/**
 * Public-holiday lookup — Nager.Date (free, no key). Server-only.
 *
 * Holidays are dated and consequence-bearing (closed shops/banks, packed
 * transport, holiday crowds), so per PROJECT_SPEC §5e they belong to EVENTS, not
 * a separate card. This module only supplies the FACTS (which holidays fall in
 * the trip window, nationwide vs regional); the events synthesis pass judges
 * whether each one materially affects the trip and writes the human layer.
 *
 * Best-effort: any failure (no country code, API down) returns [] — a missing
 * holiday list degrades gracefully, it never blocks the events section.
 */

import type { ResolvedPlace } from "@/lib/sections";
import type { DateRange } from "@/lib/trip";

const API = "https://date.nager.at/api/v3/PublicHolidays";

/** Days either side of the trip a holiday is still worth knowing about. */
const ADJACENT_DAYS = 3;

export interface PublicHoliday {
  /** ISO yyyy-mm-dd. */
  date: string;
  /** English name, e.g. "Assumption Day". */
  name: string;
  /** Local name, e.g. "Ferragosto". */
  localName: string;
  /** True if observed nationwide; false if only in some regions. */
  nationwide: boolean;
}

/** Public holidays falling within (or just around) the trip window. */
export async function getPublicHolidays(
  place: ResolvedPlace,
  when: DateRange,
): Promise<PublicHoliday[]> {
  const code = place.countryCode?.toUpperCase();
  if (!code) return [];

  const windowStart = addDays(when.start, -ADJACENT_DAYS);
  const windowEnd = addDays(when.end, ADJACENT_DAYS);

  // A window can straddle a year boundary; fetch each year it spans.
  const years = yearsBetween(windowStart, windowEnd);
  const all = await Promise.all(years.map((y) => fetchYear(y, code)));

  return all
    .flat()
    .filter((h) => h.date >= windowStart && h.date <= windowEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchYear(year: number, code: string): Promise<PublicHoliday[]> {
  try {
    const res = await fetch(`${API}/${year}/${code}`);
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      date: string;
      name: string;
      localName: string;
      global: boolean;
    }>;
    return data.map((h) => ({
      date: h.date,
      name: h.name,
      localName: h.localName,
      nationwide: h.global,
    }));
  } catch {
    return [];
  }
}

function yearsBetween(startISO: string, endISO: string): number[] {
  const first = Number(startISO.slice(0, 4));
  const last = Number(endISO.slice(0, 4));
  const out: number[] = [];
  for (let y = first; y <= last; y++) out.push(y);
  return out;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
