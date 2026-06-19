import { describe, it, expect } from "vitest";
import type { AccessChainLink, CandidateEvent } from "@/lib/sections";
import type { DateRange } from "@/lib/trip";
import {
  computeTiming,
  linksTouched,
  matchEvents,
  resolveSeverity,
  shouldDrop,
} from "@/lib/events";

// The Capri access chain from PROJECT_SPEC §5a.
const CAPRI_CHAIN: AccessChainLink[] = [
  {
    name: "Naples airport",
    type: "airport",
    vulnerabilityProfile: ["strikes", "crowd_surge", "security_ops", "capacity_peak"],
    confidence: "high",
  },
  {
    name: "Airport → port",
    type: "ground_transfer",
    vulnerabilityProfile: ["strikes", "road_closure"],
    confidence: "high",
  },
  {
    name: "Naples/Sorrento port",
    type: "sea_port",
    vulnerabilityProfile: ["strikes", "sea_traffic", "crowd_surge", "capacity_peak"],
    confidence: "high",
  },
  {
    name: "Ferry crossing",
    type: "ferry_crossing",
    vulnerabilityProfile: ["sea_traffic", "weather_sensitive", "capacity_peak"],
    confidence: "high",
  },
  {
    name: "Capri itself",
    type: "the_destination_itself",
    vulnerabilityProfile: ["crowd_surge", "road_closure", "price_surge"],
    confidence: "high",
  },
];

// Trip: 21–28 Jul 2026. Travel days are the 21st (arrival) and 28th (departure).
const TRIP: DateRange = { start: "2026-07-21", end: "2026-07-28" };

function event(overrides: Partial<CandidateEvent>): CandidateEvent {
  return {
    name: "Test event",
    dates: { start: "2026-07-24", end: "2026-07-24" },
    location: "Somewhere",
    eventType: "festival",
    blastSurface: [],
    inDestination: false,
    headline: "h",
    why: "w",
    confidence: "confirmed",
    ...overrides,
  };
}

describe("linksTouched (set intersection)", () => {
  it("matches a regatta's sea_traffic to the sea routes", () => {
    const regatta = event({ blastSurface: ["sea_traffic"] });
    expect(linksTouched(regatta, CAPRI_CHAIN)).toEqual([
      "Naples/Sorrento port",
      "Ferry crossing",
    ]);
  });

  it("returns nothing when no surface overlaps a profile", () => {
    expect(linksTouched(event({ blastSurface: [] }), CAPRI_CHAIN)).toEqual([]);
  });
});

describe("computeTiming", () => {
  it("flags an event on the arrival day as travel_day", () => {
    expect(computeTiming({ start: "2026-07-21", end: "2026-07-21" }, TRIP)).toBe(
      "travel_day",
    );
  });
  it("flags an event on the departure day as travel_day", () => {
    expect(computeTiming({ start: "2026-07-28", end: "2026-07-28" }, TRIP)).toBe(
      "travel_day",
    );
  });
  it("flags a mid-trip event as leisure_day", () => {
    expect(computeTiming({ start: "2026-07-24", end: "2026-07-24" }, TRIP)).toBe(
      "leisure_day",
    );
  });
  it("flags an event 2 days after departure as adjacent", () => {
    expect(computeTiming({ start: "2026-07-30", end: "2026-07-30" }, TRIP)).toBe(
      "adjacent",
    );
  });
  it("drops an event far outside the window as out", () => {
    expect(computeTiming({ start: "2026-08-15", end: "2026-08-15" }, TRIP)).toBe(
      "out",
    );
  });
});

describe("shouldDrop (clear-impact gate)", () => {
  it("drops an event with no stated impact, even in-destination", () => {
    expect(
      shouldDrop(event({ blastSurface: [], inDestination: true }), []),
    ).toBe(true);
  });
  it("drops an impactful event that touches nothing and is not in-destination", () => {
    expect(
      shouldDrop(event({ blastSurface: ["crowd_surge"], inDestination: false }), []),
    ).toBe(true);
  });
  it("keeps an in-destination event that has a real impact", () => {
    expect(
      shouldDrop(event({ blastSurface: ["crowd_surge"], inDestination: true }), []),
    ).toBe(false);
  });
  it("keeps an impactful event that touches a chain link", () => {
    expect(
      shouldDrop(event({ blastSurface: ["sea_traffic"] }), ["Ferry crossing"]),
    ).toBe(false);
  });
});

describe("resolveSeverity", () => {
  it("downgrades adjacent events to context_only regardless of hint", () => {
    expect(
      resolveSeverity(event({ severityHint: "disruptive" }), "adjacent"),
    ).toBe("context_only");
  });
  it("trusts the LLM degree hint on travel/leisure days", () => {
    expect(
      resolveSeverity(event({ severityHint: "disruptive" }), "travel_day"),
    ).toBe("disruptive");
  });
  it("defaults to neutral when the LLM gave no hint", () => {
    expect(resolveSeverity(event({}), "leisure_day")).toBe("neutral");
  });
});

describe("matchEvents — the worked example (§5c)", () => {
  it("scores a 50km-away regatta HIGH via shared infrastructure on a travel day", () => {
    // Distance is ~50km — a distance filter would miss it. Consequence does not.
    const regatta = event({
      name: "Amalfi regatta",
      location: "Amalfi (~50km)",
      eventType: "sport",
      dates: { start: "2026-07-21", end: "2026-07-21" }, // arrival day
      blastSurface: ["sea_traffic"],
      inDestination: false,
      severityHint: "disruptive",
    });

    const [match] = matchEvents([regatta], CAPRI_CHAIN, TRIP);
    expect(match.chainLinksTouched).toContain("Ferry crossing");
    expect(match.timing).toBe("travel_day");
    expect(match.severity).toBe("disruptive");
  });

  it("drops irrelevant events and orders survivors by decision-relevance", () => {
    const irrelevant = event({
      name: "Distant unrelated fair",
      blastSurface: [],
      inDestination: false,
    });
    const inTownFestival = event({
      name: "Capri festival",
      blastSurface: ["crowd_surge"], // real footprint in town → clears the gate
      inDestination: true,
      dates: { start: "2026-07-24", end: "2026-07-24" },
      severityHint: "enhancing",
    });
    const strike = event({
      name: "Ferry workers strike",
      blastSurface: ["strikes", "sea_traffic"],
      dates: { start: "2026-07-28", end: "2026-07-28" }, // departure
      inDestination: false,
      severityHint: "disruptive",
      confidence: "rumoured",
    });

    const result = matchEvents(
      [irrelevant, inTownFestival, strike],
      CAPRI_CHAIN,
      TRIP,
    );

    expect(result.map((e) => e.name)).toEqual([
      "Ferry workers strike", // disruptive, travel day → first
      "Capri festival", // enhancing
    ]);
    expect(result.find((e) => e.name === "Distant unrelated fair")).toBeUndefined();
  });
});
