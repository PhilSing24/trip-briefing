/**
 * Typed section objects emitted by the backend (PROJECT_SPEC §4).
 *
 * The pipeline returns structured, typed cards — never a prose blob — so the
 * plain MVP and the future "beautiful" UI render the same data. Display hints
 * (mode, confidence, status) live in the data from day one.
 */

/** Uniform confidence signal across cards. */
export type Confidence = "high" | "moderate" | "low";

export interface SectionSource {
  name: string;
  url?: string;
}

/** Weather data strategy — the key badge (PROJECT_SPEC §6). */
export type WeatherMode = "forecast" | "climate_normal";

/**
 * Weather card (PROJECT_SPEC §6). Single shape, adaptive: weather always
 * expands. `status: "unavailable"` is the graceful-degradation state — a card
 * that says "couldn't check" rather than a silent gap (§9 item 2).
 */
export interface WeatherSection {
  kind: "weather";
  status: "ok" | "unavailable";
  /** Always present, one line. On failure: an honest "couldn't check" line. */
  headline: string;
  /** Shown when expanded. */
  detail?: string;
  mode?: WeatherMode;
  /** °C, representative high across the trip window. */
  tempHigh?: number;
  /** °C, representative low across the trip window. */
  tempLow?: number;
  /** °C, coastal only — omitted inland. */
  seaTemp?: number;
  /** Human phrase, e.g. "Mostly dry" / "Showers likely". */
  rainSignal?: string;
  confidence: Confidence;
  source: SectionSource;
}

/** A resolved, disambiguated place (from geocoding). */
export interface ResolvedPlace {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

/** The (growing) briefing payload returned by /api/briefing. */
export interface Briefing {
  place: ResolvedPlace | null;
  weather: WeatherSection;
}
