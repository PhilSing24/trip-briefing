"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type TripRequest, summarizeTrip } from "@/lib/trip";
import type { Briefing, ResolvedPlace } from "@/lib/sections";
import {
  DestinationAutocomplete,
  formatPlaceLabel,
} from "@/components/DestinationAutocomplete";
import { WeatherCard } from "@/components/cards/WeatherCard";
import { EventsCard } from "@/components/cards/EventsCard";
import { SafetyCard } from "@/components/cards/SafetyCard";
import { AdminCard } from "@/components/cards/AdminCard";
import { InterestsCard } from "@/components/cards/InterestsCard";

export function TripForm() {
  const [destination, setDestination] = React.useState("");
  const [resolvedPlace, setResolvedPlace] = React.useState<ResolvedPlace | null>(
    null,
  );
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [adults, setAdults] = React.useState(2);
  const [childrenAges, setChildrenAges] = React.useState<number[]>([]);
  const [nationalities, setNationalities] = React.useState<string[]>([""]);
  const [notes, setNotes] = React.useState("");

  const [errors, setErrors] = React.useState<string[]>([]);
  const [submitted, setSubmitted] = React.useState<TripRequest | null>(null);
  const [briefing, setBriefing] = React.useState<Briefing | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  function setChildCount(next: number) {
    setChildrenAges((prev) => {
      if (next > prev.length) {
        return [...prev, ...Array(next - prev.length).fill(8)];
      }
      return prev.slice(0, next);
    });
  }

  function setChildAge(index: number, age: number) {
    setChildrenAges((prev) => prev.map((a, i) => (i === index ? age : a)));
  }

  function setNationality(index: number, value: string) {
    setNationalities((prev) => prev.map((n, i) => (i === index ? value : n)));
  }

  function build(): { request?: TripRequest; errors: string[] } {
    const errs: string[] = [];

    if (!destination.trim()) errs.push("Enter a destination.");

    if (!startDate || !endDate) {
      errs.push("Pick both a start and end date.");
    } else if (endDate < startDate) {
      errs.push("The end date can't be before the start date.");
    }

    const cleanNats = nationalities.map((n) => n.trim()).filter(Boolean);
    if (cleanNats.length === 0) {
      errs.push("Add at least one nationality (it drives entry requirements).");
    }

    if (errs.length > 0) return { errors: errs };

    const request: TripRequest = {
      destination: destination.trim(),
      place: resolvedPlace ?? undefined,
      when: { start: startDate, end: endDate },
      party: { adults, childrenAges },
      nationalities: cleanNats,
      notes: notes.trim(),
    };
    return { request, errors: [] };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { request, errors: errs } = build();
    setErrors(errs);
    if (!request) return;

    setSubmitted(request);
    setBriefing(null);
    setFetchError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!res.ok) throw new Error(`Briefing request failed (${res.status})`);
      const data = (await res.json()) as { briefing: Briefing };
      setBriefing(data.briefing);
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  }

  // After submit: form collapses to a summary bar; the briefing renders below
  // (PROJECT_SPEC §2). The briefing itself arrives in later slices.
  if (submitted) {
    const place = briefing?.place;
    const placeLine = place
      ? [place.name, place.admin1, place.country].filter(Boolean).join(", ")
      : null;

    return (
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm text-zinc-700">{summarizeTrip(submitted)}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSubmitted(null);
              setBriefing(null);
              setFetchError(null);
            }}
          >
            ✎ Edit
          </Button>
        </div>

        {placeLine && (
          <p className="px-1 text-sm text-zinc-500">
            Briefing for <span className="text-zinc-800">{placeLine}</span>
          </p>
        )}

        {loading && (
          <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 shadow-sm">
            Gathering your briefing…
          </div>
        )}

        {fetchError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            {fetchError}
          </div>
        )}

        {briefing && (
          <>
            {briefing.weatherOnly && (
              <p className="text-xs text-amber-600">
                Weather-only mode — other sections are disabled
                (BRIEFING_WEATHER_ONLY).
              </p>
            )}
            {!briefing.weatherOnly &&
              briefing.summary.status === "ok" &&
              briefing.summary.text && (
                <div className="rounded-xl border border-zinc-900 bg-zinc-900 p-5 text-zinc-50 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Summary
                  </p>
                  <p className="mt-1 text-base font-medium leading-relaxed">
                    {briefing.summary.text}
                  </p>
                </div>
              )}
            <WeatherCard section={briefing.weather} />
            {!briefing.weatherOnly && (
              <>
                <EventsCard section={briefing.events} />
                <SafetyCard section={briefing.safety} />
                <AdminCard section={briefing.admin} />
                <InterestsCard section={briefing.interests} />
              </>
            )}
          </>
        )}

      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-xl space-y-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Plan your briefing
        </h1>
        <p className="text-sm text-zinc-500">
          Tell us where and when. We&apos;ll tell you what to know.
        </p>
      </div>

      {/* Destination */}
      <div className="space-y-1.5">
        <Label htmlFor="destination">Destination</Label>
        <DestinationAutocomplete
          id="destination"
          value={destination}
          onChange={(text) => {
            setDestination(text);
            // Editing the text invalidates a previously-picked place.
            setResolvedPlace(null);
          }}
          onSelect={(place) => {
            setResolvedPlace(place);
            setDestination(formatPlaceLabel(place));
          }}
          placeholder="e.g. Capri, Italy"
        />
        <p className="text-xs text-zinc-400">
          Start typing and pick a place to disambiguate it.
        </p>
      </div>

      {/* Dates */}
      <div className="space-y-1.5">
        <Label>Dates</Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="start" className="text-xs text-zinc-500">
              Start
            </Label>
            <Input
              id="start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="end" className="text-xs text-zinc-500">
              End
            </Label>
            <Input
              id="end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-zinc-400">
          Weather shows a live forecast within ~16 days, otherwise typical
          seasonal conditions.
        </p>
      </div>

      {/* Party */}
      <div className="space-y-3">
        <Label>Party</Label>
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-700">Adults</span>
          <Stepper value={adults} min={1} onChange={setAdults} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-700">Children</span>
          <Stepper
            value={childrenAges.length}
            min={0}
            onChange={setChildCount}
          />
        </div>

        {childrenAges.length > 0 && (
          <div className="space-y-2 rounded-md bg-zinc-50 p-3">
            <p className="text-xs font-medium text-zinc-500">
              Children&apos;s ages
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {childrenAges.map((age, i) => (
                <Input
                  key={i}
                  type="number"
                  min={0}
                  max={17}
                  value={age}
                  aria-label={`Child ${i + 1} age`}
                  onChange={(e) => setChildAge(i, Number(e.target.value))}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Nationality */}
      <div className="space-y-1.5">
        <Label>Nationality / passport</Label>
        <div className="space-y-2">
          {nationalities.map((nat, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={nat}
                onChange={(e) => setNationality(i, e.target.value)}
                placeholder="e.g. British"
                autoComplete="off"
              />
              {nationalities.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove nationality"
                  onClick={() =>
                    setNationalities((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  ✕
                </Button>
              )}
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="px-0 hover:bg-transparent hover:text-zinc-900"
          onClick={() => setNationalities((prev) => [...prev, ""])}
        >
          + Add nationality
        </Button>
      </div>

      {/* Anything else? */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Anything else?</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Interests, constraints, who's coming… e.g. we love food and hiking, travelling with grandparents."
        />
        <p className="text-xs text-zinc-400">
          Optional — drives the interests card and re-weights events.
        </p>
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}

      <Button type="submit" className="w-full">
        Get briefing
      </Button>
    </form>
  );
}

function Stepper({
  value,
  min,
  max = 20,
  onChange,
}: {
  value: number;
  min: number;
  max?: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="icon"
        aria-label="Decrease"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </Button>
      <span
        className={cn("w-6 text-center text-sm tabular-nums text-zinc-900")}
        aria-live="polite"
      >
        {value}
      </span>
      <Button
        variant="outline"
        size="icon"
        aria-label="Increase"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </Button>
    </div>
  );
}
