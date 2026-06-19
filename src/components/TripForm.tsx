"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type TripRequest,
  type WhenMode,
  summarizeTrip,
} from "@/lib/trip";

const WHEN_OPTIONS: { mode: WhenMode; label: string; hint: string }[] = [
  {
    mode: "exact",
    label: "Exact dates",
    hint: "Live forecast if travel is within ~16 days, otherwise typical seasonal weather.",
  },
  {
    mode: "month",
    label: "Just a month",
    hint: "Typical seasonal weather and a month-wide event window.",
  },
  {
    mode: "flexible",
    label: "Flexible",
    hint: "Typical seasonal weather and a wide event window.",
  },
];

export function TripForm() {
  const [destination, setDestination] = React.useState("");
  const [whenMode, setWhenMode] = React.useState<WhenMode>("exact");
  const [exactStart, setExactStart] = React.useState("");
  const [exactEnd, setExactEnd] = React.useState("");
  const [month, setMonth] = React.useState("");
  const [adults, setAdults] = React.useState(2);
  const [childrenAges, setChildrenAges] = React.useState<number[]>([]);
  const [nationalities, setNationalities] = React.useState<string[]>([""]);
  const [notes, setNotes] = React.useState("");

  const [errors, setErrors] = React.useState<string[]>([]);
  const [submitted, setSubmitted] = React.useState<TripRequest | null>(null);

  const activeHint = WHEN_OPTIONS.find((o) => o.mode === whenMode)!.hint;

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

    if (whenMode === "exact") {
      if (!exactStart || !exactEnd) {
        errs.push("Pick both a start and end date.");
      } else if (exactEnd < exactStart) {
        errs.push("The end date can't be before the start date.");
      }
    }
    if (whenMode === "month" && !month) {
      errs.push("Pick a month.");
    }

    const cleanNats = nationalities.map((n) => n.trim()).filter(Boolean);
    if (cleanNats.length === 0) {
      errs.push("Add at least one nationality (it drives entry requirements).");
    }

    if (errs.length > 0) return { errors: errs };

    const request: TripRequest = {
      destination: destination.trim(),
      when: {
        mode: whenMode,
        ...(whenMode === "exact"
          ? { exact: { start: exactStart, end: exactEnd } }
          : {}),
        ...(whenMode === "month" ? { month } : {}),
      },
      party: { adults, childrenAges },
      nationalities: cleanNats,
      notes: notes.trim(),
    };
    return { request, errors: [] };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { request, errors: errs } = build();
    setErrors(errs);
    if (request) setSubmitted(request);
  }

  // After submit: form collapses to a summary bar; the briefing renders below
  // (PROJECT_SPEC §2). The briefing itself arrives in later slices.
  if (submitted) {
    return (
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm text-zinc-700">{summarizeTrip(submitted)}</p>
          <Button variant="ghost" size="sm" onClick={() => setSubmitted(null)}>
            ✎ Edit
          </Button>
        </div>

        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6">
          <p className="text-sm font-medium text-zinc-700">
            Briefing will render here.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            The synthesis pipeline (weather → events → safety → admin →
            interests) lands in the next slices. Captured request:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-md bg-zinc-900 p-4 text-xs leading-relaxed text-zinc-100">
            {JSON.stringify(submitted, null, 2)}
          </pre>
        </div>
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
        <Input
          id="destination"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="e.g. Capri, Italy"
          autoComplete="off"
        />
        <p className="text-xs text-zinc-400">
          Place autocomplete is coming in a later slice — free text for now.
        </p>
      </div>

      {/* When — the load-bearing toggle */}
      <div className="space-y-1.5">
        <Label>When</Label>
        <div className="grid grid-cols-3 gap-2">
          {WHEN_OPTIONS.map((opt) => (
            <Button
              key={opt.mode}
              variant={whenMode === opt.mode ? "primary" : "outline"}
              onClick={() => setWhenMode(opt.mode)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {whenMode === "exact" && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="space-y-1">
              <Label htmlFor="start" className="text-xs text-zinc-500">
                Start
              </Label>
              <Input
                id="start"
                type="date"
                value={exactStart}
                onChange={(e) => setExactStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="end" className="text-xs text-zinc-500">
                End
              </Label>
              <Input
                id="end"
                type="date"
                value={exactEnd}
                onChange={(e) => setExactEnd(e.target.value)}
              />
            </div>
          </div>
        )}

        {whenMode === "month" && (
          <div className="pt-1">
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        )}

        <p className="text-xs text-zinc-400">{activeHint}</p>
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
