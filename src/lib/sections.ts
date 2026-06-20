/**
 * Typed section objects emitted by the backend (PROJECT_SPEC §4).
 *
 * The pipeline returns structured, typed cards — never a prose blob — so the
 * plain MVP and the future "beautiful" UI render the same data. Display hints
 * (mode, confidence, status) live in the data from day one.
 */

import type { DateRange } from "@/lib/trip";

/** Uniform confidence signal across cards. */
export type Confidence = "high" | "moderate" | "low";

export interface SectionSource {
  name: string;
  url?: string;
}

/** Weather data strategy — the key badge (PROJECT_SPEC §6). */
export type WeatherMode = "forecast" | "climate_normal";

/** Coarse sky condition, derived from the WMO weather code — drives the icon. */
export type WeatherCondition =
  | "clear"
  | "partly"
  | "cloudy"
  | "rain"
  | "snow"
  | "fog"
  | "thunder";

/** One forecast day, rendered as a square in the weather card (forecast mode only). */
export interface WeatherDay {
  /** ISO yyyy-mm-dd. */
  date: string;
  /** Pre-formatted weekday for display, e.g. "Tuesday" (server has the tz). */
  weekday: string;
  /** Pre-formatted day + month, e.g. "20 Jun" (server-side for tz correctness). */
  dateShort: string;
  condition: WeatherCondition;
  tempHigh: number;
  tempLow: number;
  /** Max precipitation probability for the day, % — forecast only. */
  precipProb?: number;
}

/**
 * How the forecast compares to the seasonal norm for this place + dates. The
 * whole point: 32°C is unremarkable in Bangkok but extraordinary in Reykjavík —
 * a bare number can't say that, this signal can. Forecast mode only.
 */
export type TempAnomaly =
  | "much_colder"
  | "colder"
  | "normal"
  | "warmer"
  | "much_warmer";

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
  /** °C, the seasonal-normal high for these dates — the baseline anomaly is judged against. */
  tempHighNormal?: number;
  /** °C, the seasonal-normal low for these dates — shown alongside the forecast. */
  tempLowNormal?: number;
  /** How the forecast high compares to the seasonal norm (forecast mode only). */
  anomaly?: TempAnomaly;
  /** Per-day breakdown for the first few forecast days (forecast mode only). */
  days?: WeatherDay[];
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
  /** ISO 3166-1 alpha-2 (e.g. "IT") — used for the public-holiday lookup. */
  countryCode?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

// ── Events + access chain (PROJECT_SPEC §5) ────────────────────────────────

/**
 * The shared "near-mirror" vocabulary used by BOTH an event's blast surface and
 * an access-chain link's vulnerability profile, so the match is a plain set
 * intersection (§5c), not fuzzy reasoning.
 *
 * NOTE (spec reconciliation): §5b lists `blast_surface` with a different word
 * list (airport · roads · ferries_sea · …), but §5c's worked example and §5a's
 * Capri table both intersect on THIS vocabulary (e.g. a regatta's `sea_traffic`
 * hits the ferry link whose profile contains `sea_traffic`). We unify on the
 * vulnerability vocabulary so the canonical example actually set-intersects.
 * Flagged for confirmation.
 */
export type VulnerabilityTag =
  | "strikes"
  | "crowd_surge"
  | "road_closure"
  | "sea_traffic"
  | "weather_sensitive"
  | "capacity_peak"
  | "security_ops"
  | "price_surge";

/** Where a link sits on the traveller's access chain (§5a). */
export type AccessChainLinkType =
  | "airport"
  | "sea_port"
  | "ground_transfer"
  | "ferry_crossing"
  | "local_transport"
  | "the_destination_itself";

/** One link in how a traveller physically reaches/moves around the destination. */
export interface AccessChainLink {
  name: string;
  type: AccessChainLinkType;
  vulnerabilityProfile: VulnerabilityTag[];
  /** The chain is LLM-generated and confidence-flagged (§5a). */
  confidence: Confidence;
}

export type EventType =
  | "sport"
  | "festival"
  | "religious"
  | "cultural"
  | "political"
  | "disruption"
  | "weather";

export type EventTiming = "travel_day" | "leisure_day" | "adjacent";

/** Four levels (§5b). `context_only` = out-of-window but worth noting. */
export type EventSeverity =
  | "disruptive"
  | "enhancing"
  | "neutral"
  | "context_only";

/** rumoured is shown, tagged — early warning of a threatened strike is the point. */
export type EventConfidence = "confirmed" | "likely" | "rumoured";

/**
 * An event as produced by the LLM, BEFORE deterministic matching. `blastSurface`
 * uses the shared VulnerabilityTag vocabulary so it set-intersects with each
 * link's `vulnerabilityProfile`.
 */
export interface CandidateEvent {
  name: string;
  /** Events span days (§5b). */
  dates: DateRange;
  /** May be a hub, not the destination. */
  location: string;
  eventType: EventType;
  blastSurface: VulnerabilityTag[];
  /** Is the event physically in the destination itself? (drop-rule input) */
  inDestination: boolean;
  /** The LLM's degree judgment; the matcher refines it (§5c). */
  severityHint?: EventSeverity;
  // human layer (LLM-written)
  headline: string;
  why: string;
  /** Mitigation; only for disruptive/enhancing (§5b). */
  whatToDo?: string;
  confidence: EventConfidence;
  source?: SectionSource;
}

/** A candidate after deterministic matching against the access chain (§5c). */
export interface MatchedEvent extends CandidateEvent {
  /** Names of the chain links this event hits (set intersection). */
  chainLinksTouched: string[];
  timing: EventTiming;
  severity: EventSeverity;
}

/** The events card (the differentiator). Single shape, adaptive. */
export interface EventsSection {
  kind: "events";
  status: "ok" | "unavailable";
  /** Always present, one line. */
  headline: string;
  /** Failure / empty explanation when status !== "ok". */
  detail?: string;
  /** The generated access chain (§5a) — shown as supporting context. */
  chain: AccessChainLink[];
  /** Matched, ordered events; empty when nothing is consequential. */
  events: MatchedEvent[];
  confidence: Confidence;
}

// ── Admin / entry requirements (PROJECT_SPEC §6) ────────────────────────────

/** Mirrors advisory/immigration status tiers. */
export type VisaStatus =
  | "visa_free"
  | "visa_on_arrival"
  | "evisa"
  | "visa_required"
  | "eta_required";

/** Entry requirements for one nationality (mixed groups give several). */
export interface NationalityAdmin {
  nationality: string;
  visaStatus: VisaStatus;
  /** e.g. "90 days within any 180-day period". */
  maxStay: string;
  /** Concrete actions; drives the "N to-do" badge. */
  toDos: string[];
  /** e.g. "Passport valid for 3+ months beyond departure". */
  passportValidity: string;
}

/**
 * Admin card (§6). Adaptive: collapses when every nationality is visa-free with
 * zero to-dos; expands per-nationality when there are actions. Source is always
 * cited (official government source).
 */
export interface AdminSection {
  kind: "admin";
  status: "ok" | "unavailable";
  headline: string;
  detail?: string;
  perNationality: NationalityAdmin[];
  /** Always an official government source. */
  source: SectionSource;
  confidence: Confidence;
}

// ── Safety / geopolitical risk (PROJECT_SPEC §6) ────────────────────────────

/** Mirrors government advisory tiers (e.g. US State Dept Levels 1–4). */
export type SafetyLevel =
  | "normal"
  | "caution"
  | "reconsider"
  | "do_not_travel";

/**
 * Safety card (§6) — the strongest collapse case. `normal` shows one grey line;
 * higher levels expand into a real section. Source is always cited.
 */
export interface SafetySection {
  kind: "safety";
  status: "ok" | "unavailable";
  level: SafetyLevel;
  /** Tone scales to the level. */
  headline: string;
  /** Populated only when level > normal. */
  detail?: string;
  /** Always cited; name is the issuing authority (e.g. "UK FCDO"). */
  source: SectionSource;
  confidence: Confidence;
}

// ── Interests (PROJECT_SPEC §6) ─────────────────────────────────────────────

/** One piece of local context — NOT a ranked pick (the guiding principle). */
export interface InterestItem {
  name: string;
  /** What it is / why it's notable — knowledge, not "you should go here". */
  note: string;
}

/** Context for one detected interest (food, sport, art, history…). */
export interface InterestBlock {
  /** Detected from the free-text, e.g. "food", "hiking". */
  interest: string;
  headline?: string;
  items: InterestItem[];
  /** Optional briefing-safe practical note ("popular spots book weeks ahead"). */
  logistics?: string;
}

/**
 * Interests card (§6), driven by the free-text box. Knowledge-sourced, no ranked
 * picks. Adaptive: expands when a matching cue is present, collapses to a line
 * otherwise.
 */
export interface InterestsSection {
  kind: "interests";
  status: "ok" | "unavailable";
  headline: string;
  detail?: string;
  /** Empty when no interest cue was given. */
  interests: InterestBlock[];
}

// ── Summary (PROJECT_SPEC §4) ───────────────────────────────────────────────

/**
 * The summary — 2–4 plain sentences a rushed user reads instead of the whole
 * briefing. Written last, over the other sections' signals, in one coherent
 * tone: a serious concern sets the register and positives never undercut it.
 */
export interface SummarySection {
  kind: "summary";
  status: "ok" | "unavailable";
  text: string;
}

/** The briefing payload returned by /api/briefing. */
export interface Briefing {
  place: ResolvedPlace | null;
  /**
   * Dev flag: when set (via BRIEFING_WEATHER_ONLY), only weather is computed and
   * the UI renders just that card — fast/cheap iteration on the weather tile
   * without paying for the LLM sections. The other fields carry placeholders.
   */
  weatherOnly?: boolean;
  /** Read first; written last (synthesises the sections below). */
  summary: SummarySection;
  /** Section render order is decided in the UI (§4): Summary → Weather → Events → … */
  events: EventsSection;
  weather: WeatherSection;
  safety: SafetySection;
  admin: AdminSection;
  interests: InterestsSection;
}
