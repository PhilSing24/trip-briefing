# Trip Briefing

A pre-trip **briefing** tool. You name a destination, dates, and party, and the app
returns a structured, adaptive briefing of what you need to know before you go:
weather, events, safety, entry requirements, and interest-based context.

It is **not** a recommender and **not** a booking engine. The destination is an
*input*, not an output — the app enriches a plan you've already made; it doesn't help
you choose where to go.

> **In scope:** "What you should know about a place you've chosen."
> **Out of scope:** "Help me choose." (recommendation / discovery)

See [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) for the full design and the source of truth
for every product decision.

## What makes it different

The **events** section. Instead of listing what's "near" the destination, it surfaces
events that affect the trip via **consequence** — a strike at the arrival airport or a
regatta congesting the ferry route matters even though it isn't "in" the destination.

The mechanism is an **access chain**: a model of how a traveller physically reaches and
moves around a place, broken into links (airport, ferry crossing, ground transfer, the
destination itself…). Each link has a `vulnerability_profile`, each event has a
`blast_surface` drawn from the same vocabulary, so matching an event to the trip is a
literal **set intersection** rather than fuzzy guesswork. Severity = how hard the event
hits a link × whether it lands on a travel day. Distance is at most a weak signal.

## How it works

A **pipeline**, not an autonomous agent:

```
Next.js form
  → API route (one structured request in)
    → parallel tool calls:  weather | events (cultural + disruption) | safety | admin
    → + access-chain lookup/generation for the destination
  → ONE LLM synthesis pass (Claude API):
       writes the verdict, matches events to the access chain & scores severity,
       sets each card's expand/collapse state, headlines and signals
    → emits STRUCTURED, typed section objects (never a prose blob)
  → adaptive sectioned cards rendered in the UI
```

Every section is a card with the same anatomy (`headline` · `detail` · `signal` ·
`source`) and is **adaptive** — it expands when it has something to say and collapses to
a one-liner when it doesn't. Display hints (confidence, severity, weather mode) live in
the data from day one, so a future "beautiful" version is a pure restyle of the same
objects.

Section order: **Verdict → Events → Weather → Safety → Admin → Interests**. Costs are
deferred.

## Tech stack

- **Next.js 16** (React 19 + TypeScript) — one repo, one language. The backend pipeline
  lives in Next.js API routes; there is no separate Python service.
- **Tailwind CSS 4** with shadcn/ui-style primitives, shared by the plain MVP and the
  future polished version.
- **Claude API** ([`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk))
  for the single synthesis pass. (Distinct from Claude Code, which is only the build tool.)
- **Zod** for validating structured section objects.
- **Vitest** + **Playwright** for testing.
- **SQLite** later, for the owned cost-tier table and curated access chains. Not a vector DB.

### Data sources (all free / freemium)

- **Weather:** [Open-Meteo](https://open-meteo.com) — forecast + climate normals, no key.
  Always labelled `forecast` vs `climate_normal` so an average never reads as a forecast.
- **Events:** cultural feeds (Ticketmaster / PredictHQ / tourism calendars) + a separate
  disruption/news feed for strikes and closures.
- **Safety:** government travel advisories (US State Dept / UK FCDO) — always cited.
- **Admin:** official government entry-requirement sources, fetched + cited.

## Project layout

```
src/
  app/
    api/briefing/route.ts   # the pipeline endpoint
    page.tsx                # form + briefing view
  components/
    TripForm.tsx
    cards/                  # one component per briefing section
    ui/                     # shadcn-style primitives
  lib/
    weather.ts              # Open-Meteo tool
    events.ts               # event matching against the access chain
    *-llm.ts                # Claude synthesis helpers (events, entry/safety, interests, verdict)
    sections.ts, trip.ts    # shared types
```

## Getting started

Requires Node and an Anthropic API key.

```bash
npm install
```

Create `.env.local` with your Claude API key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |
| `npm test` | Run the Vitest suite |

## Status

MVP in progress, built in small vertical slices: weather, events + access chain, safety,
admin, interests, and a synthesis verdict line. Cost estimates and an in-trip companion
are deferred (see `PROJECT_SPEC.md` §7 and §1).
