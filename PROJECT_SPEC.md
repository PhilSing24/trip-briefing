# Trip Briefing App — Project Specification

> A pre-trip **briefing** tool. The user names a destination, dates, and party; the app
> returns a structured, adaptive briefing of what they need to know. It is **not** a
> recommender and **not** a booking engine.

This document is the single source of truth for the design decisions made so far.
It is written to be read by Claude Code as project context. Build against it.

---

## 1. Product definition

### What it is
The user has **already decided where they are going**. The destination is an *input*,
not an output. The app enriches a known plan with practical, synthesised intelligence:
weather, events (the differentiator), safety, entry requirements, and interest-based
context. Costs come later.

### The guiding principle (applies to every feature decision)
> **In scope:** "What you should know about a place you've chosen."
> **Out of scope:** "Help me choose." (recommendation / discovery)

This line has already excluded: "similar destinations you might like", and ranked
restaurant/activity picks. Apply it to every future feature.

### The differentiator
The **events** section — specifically, surfacing events that affect the trip via
**consequence**, not proximity. A strike at the arrival airport or a regatta congesting
the ferry route matters even though it is not "in" the destination. Distance is a weak
signal; **shared infrastructure on the traveller's access chain** is the real one.

### Build order
1. MVP: the briefing (weather, events, safety, admin, interests) — no costs.
2. Later: accommodation + transport **cost estimates** via an owned reference DB.
3. Much later (separate product): an in-trip companion (native mobile makes sense only then).

---

## 2. Platform & layout

- **Responsive web first.** Laptop-first for planning; mobile-friendly via card layout.
  PWA if mobile demand appears. Native mobile only for the future in-trip product.
- **Layout flow:**
  - Before submit: a **centered form** on a calm neutral background (no hero photo).
  - After submit: the form **collapses to a summary bar** ("Capri · 21–28 Jul · 2 adults,
    2 kids · ✎ edit"); the **briefing renders full-width below**.
- **Imagery** belongs in the *output* (destination header + per-section cues), never the
  input form. It is contextual and earned, not decorative mood-setting.

---

## 3. Input contract

Structured form (not a chatbox). Rule: **only ask for an input when a section consumes it.**

| Field | Type | Feeds |
|---|---|---|
| Destination | text + autocomplete (resolves to a real, disambiguated place) | weather, events, safety, admin, interests |
| When | date range (start + end) | weather *mode*, events |
| Party | steppers: # adults, # children **+ children's ages** | events suitability, admin |
| Nationality / passport | text (allow multiple for mixed groups) | admin |
| Anything else? | optional free-text | **interests card** + flavours verdict & event ranking |
| ~~Travelling from~~ | *deferred* — add with the cost layer | transport cost |

The **dates** are load-bearing: they select the weather data strategy
(forecast vs climate normals — *derived from how far out the trip is*, ~16 days)
and the event search window. (An earlier `exact / month / flexible` toggle was
collapsed to a single date range; proximity, not an explicit mode, now decides
the weather strategy.)

The **free-text box** is not mere flavour — it *drives the interests card* and
*re-weights events* (see §5). It pays off twice.

---

## 4. Output contract — overall shape

Read top-to-bottom, ordered by decision-relevance. Every section is a **card** with the
**same anatomy**, and every card is **adaptive** (expand when it has something to say,
collapse to a one-liner when it doesn't).

### Uniform card anatomy (every section returns this shape)
- `headline` — always present, one line
- `detail` — shown when expanded
- `signal` — confidence / severity / status (this is what the UI styles into badges/colors)
- `source` — link + authority, where applicable

### Section order
1. **Destination header** — image + restated request
2. **Verdict** — 1–2 sentence synthesis (LLM); what a rushed user reads and nothing else
3. **Weather**
4. **Events** ← the differentiator
5. **Safety / geopolitical risk**
6. **Admin / entry requirements**
7. **Interests** (food, sport, art… — driven by free-text)
8. **[Costs]** — deferred

### Critical data/UI separation
The synthesis step emits **structured, typed section objects**, never a prose blob.
The MVP renders them plainly; "make it beautiful later" is then a pure restyle of the
same data. Display hints (confidence, severity, disruption flags) live *in the data* from
day one so the future UI can style them without re-running anything.

---

## 5. The differentiator: Events + Access Chain

### 5a. Access chain (per-destination reference data)
Describes how a traveller physically reaches/moves around the destination, broken into
links where disruption bites. **LLM-generated, confidence-flagged** (structural geography
is a task the model is reliable on — unlike prices, a missed link degrades gracefully).
Spot-check launch cities; do not hand-author at scale.

```
link: { name, type, vulnerability_profile[] }
```

- `type` enum: `airport · sea_port · ground_transfer · ferry_crossing · local_transport · the_destination_itself`
  - `the_destination_itself` is just another link — in-destination events need no special case.
- `vulnerability_profile` vocabulary: `strikes · crowd_surge · road_closure · sea_traffic · weather_sensitive · capacity_peak · security_ops · price_surge`

Example — Capri:

| link | type | vulnerable to |
|---|---|---|
| Naples airport | airport | strikes, crowd_surge, security_ops, capacity_peak |
| Airport → port | ground_transfer | strikes, road_closure |
| Naples/Sorrento port | sea_port | strikes, sea_traffic, crowd_surge, capacity_peak |
| Ferry crossing | ferry_crossing | sea_traffic, weather_sensitive, capacity_peak |
| Capri itself | the_destination_itself | crowd_surge, road_closure, price_surge |

**Emergent property (noted, build later):** the chain's *shape* encodes trip fragility.
Serial/thin chain (one ferry, one road) = brittle; fat/parallel chain (big city) = robust.
A `fragility` score is derivable later and could scale warning tone. Not in MVP.

### 5b. Event object (fully specified)

**Identity**
- `name`
- `dates` (start/end — events span days)
- `location` (may be a hub, not the destination)
- `event_type` enum: `sport · festival · religious · cultural · political · disruption · weather`
  - `disruption` = strikes / planned closures / major works (news-sourced)
  - `political` = summits / G7 / elections

**Consequence assessment (the core)**
- `blast_surface` multi-select — the surfaces an event disrupts. Uses the **same
  vocabulary as a link's `vulnerability_profile`** (`strikes · crowd_surge ·
  road_closure · sea_traffic · weather_sensitive · capacity_peak · security_ops ·
  price_surge`), so the §5c match is a literal set intersection. *(Reconciled: an
  earlier draft listed a separate word-list here — `airport · roads · ferries_sea
  …` — that could not set-intersect with `vulnerability_profile`; the worked
  example in §5c, where a regatta's `sea_traffic` hits the ferry link, only works
  on the shared vocabulary.)*
- `chain_links_touched` — which access-chain link(s) it hits. Empty + not in-destination → drop.
- `timing` enum: `travel_day · leisure_day · adjacent` + concrete date(s)
- `severity` enum (**4 levels**): `disruptive · enhancing · neutral · context_only`
  - `context_only` covers out-of-window-but-worth-noting (e.g. a festival 2 days after departure)

**Human layer (LLM-written, UI-rendered)**
- `headline`
- `why` — why it matters for *this* trip
- `what_to_do` — mitigation; only for disruptive/enhancing
- `confidence` enum: `confirmed · likely · rumoured`
  - **rumoured is shown, with a tag.** Early warning of a threatened strike is the whole
    point; the asymmetry favours surfacing it, honestly labelled.
- `source` — link + name

### 5c. Matching logic
`blast_surface` and `vulnerability_profile` are deliberate near-mirror vocabularies, so the
match is **set intersection**, not fuzzy reasoning. The LLM judges only the *degree*, not
whether any connection exists.

**Severity = (how hard blast_surface hits a chain link) × (whether it lands on a travel day).**
Distance is at most a weak input, never the decision.

Worked example: a regatta in Amalfi (~50km away) scores HIGH because its blast_surface
(sea_traffic) hits the `ferry_crossing` link on the `travel_day`. A distance filter misses it.

### 5d. Two source types feed events
- **Cultural-event feeds** (festivals, sport, concerts): e.g. Ticketmaster Discovery,
  PredictHQ, local tourism calendars, + LLM knowledge of recurring annual events.
- **Disruption / news feeds** (strikes, closures, works): different sources — news,
  transport-operator / government feeds. The strike case proved this second type is needed.

### 5e. Events × Interests linkage
Events owns anything **dated and consequence-bearing**. Interests owns **evergreen** context.
No duplication. A dated F1 race lives in events; an "I love sport" free-text cue *re-weights*
that event upward (toward enhancing) and lets the verdict connect them.

---

## 6. Remaining cards (field-level)

### Weather
- `mode` enum: `forecast · climate_normal` (the key badge; forecast only within ~16 days)
- `temp_high`, `temp_low`
- `sea_temp` (conditional — coastal only)
- `rain_signal`
- `headline`
- `confidence` (derived from mode)
- Adaptive: **always expands** (weather always matters); the mode badge is what varies.

### Safety / geopolitical risk
- `level` enum (mirrors advisory tiers): `normal · caution · reconsider · do_not_travel`
- `headline` (tone scales to level)
- `detail` (populated only when level > normal)
- `source` + `source_authority` (e.g. US State Dept / UK FCDO) — **always cited**
- Adaptive: **strongest collapse case.** `normal` → one grey line; higher → real section.

### Admin / entry requirements
- `per_nationality[]` — list (mixed-nationality groups), each:
  - `nationality`
  - `visa_status` enum: `visa_free · visa_on_arrival · evisa · visa_required · eta_required`
  - `max_stay`
  - `to_dos[]` (drives the "N to-do" badge)
  - `passport_validity`
- `source` — official government source — **always cited**
- Adaptive: collapses when visa-free + zero to-dos; expands per-nationality when there are actions.

### Interests (generalised from "food")
Driven by the free-text box. Covers whatever interest is expressed (food, sport, art,
nightlife, history…). **Knowledge-sourced, no ranked picks** (the guiding principle).
- `interest` (detected from free-text, e.g. "food", "sport")
- `items[]` — `{ name, note }` (local specialities, things to do, local culture)
- `logistics` — *optional* briefing-safe practical note ("good places book weeks ahead";
  "book diving in advance") — the one place interests may touch logistics without becoming
  a recommender
- `headline`
- Adaptive: expands when a matching free-text cue is present; collapses to a line otherwise.

---

## 7. Costs (deferred — design noted)

A reference DB of **price ranges**, not live inventory (sidesteps the partner-approval /
no-public-API walls for hotels & flights). It answers "what should I expect to pay", a
statistical question you can *own*.

- **Tier/cluster model** (not per-city rows): map cities to price archetypes; classify an
  unknown city into a tier (the LLM can do this from world knowledge — e.g. "Capri = luxury
  Mediterranean island"). Solves the non-interpolable location axis.
- Schema sketch: `tier × star_rating × season → {low, high, currency}` + a confidence/sample flag.
- SQLite to start (a file, zero infra). **Not** a vector DB — this is structured lookup.
- Exposed as a function: `get_hotel_cost_estimate(city, star, season)`.
- Always framed as **estimates for budgeting**, never live prices.
- Adds the deferred **departure point** input (transport cost needs origin; admin needs
  nationality — two different questions, often collapsible).

---

## 8. Architecture (high-level)

> Match the tool to the problem: this is a **pipeline**, not an autonomous agent maze.
> Resist framework-itis. Add LangGraph only when real branching appears.

```
Next.js form
  → backend endpoint (one structured request in)
    → parallel tool calls:  weather API | event feeds (cultural + disruption) | advisory feed | admin source
    → + access-chain lookup/generation for the destination
    → + (later) cost-DB lookup
  → ONE LLM synthesis pass:
       - writes the verdict line
       - matches events to the access chain & sets severity
       - decides each card's expand/collapse state + writes headlines
       - sets signals (confidence/severity/mode)
       - emits STRUCTURED section objects (not prose)
  → adaptive sectioned briefing back to the UI (cards)
```

### Stack
- **Frontend:** Next.js (React) + Tailwind + a clean component lib (e.g. shadcn/ui) from
  day one, so the plain MVP and the future "beautiful" version share primitives.
- **Backend:** Python or Node (pick fluency; Python pairs naturally with the LLM ecosystem).
  Not a chat server — a "structured request → briefing" service.
- **Orchestration:** plain orchestrated tool-calling + one LLM synthesis step. The flow is
  mostly deterministic (we always want weather/events/risk/admin); the LLM does *writing and
  judgment*, not control flow.
- **LLM:** one capable model for synthesis (classification + writing). Prompt caching helps
  if the system prompt / template is large and reused. (The in-app LLM call is the **Claude
  API** — distinct from Claude Code, which is only the build tool.)
- **Owned data:** SQLite for the cost-tier table and the curated/spot-checked access chains.
- **Observability:** light tracing from the start (e.g. Langfuse) — briefings are easy to
  get subtly wrong; inspect what each tool returned and what the model did with it.

### Data sources
- Weather: Open-Meteo (free; forecast + climate normals).
- Cultural events: Ticketmaster Discovery / PredictHQ + tourism calendars + LLM knowledge.
- Disruptions: news / transport-operator / government feeds.
- Safety: government advisory feeds (State Dept / FCDO).
- Admin: official government sources, fetched + cited.
- Places (later, for interests context / costs calibration): Google Places (free credit).

---

## 9. Open items (not yet decided)

1. **Synthesis reliability** — how to prompt the single LLM pass so the verdict + expand/
   collapse decisions + event scoring are consistent. (Design the synthesis prompt.)
2. **Graceful degradation** — what each card shows when its source is down/empty. A briefing
   with *silent* gaps is worse than one that says "couldn't check." Define empty/failure
   states per card (they also need to look intentional in the future design).
3. **Card order confirmation** — events may deserve to sit above weather given it's the
   differentiator and often most decision-relevant.

---

## 10. Toolchain (dev environment)

- **VS Code on WSL2 (Ubuntu).** App stack is Linux-native; dev env matches deploy target.
- Install Claude Code **inside WSL** with the native installer
  (`curl -fsSL https://claude.ai/install.sh | bash`) — not via Windows-side npm.
  Ensure `~/.local/bin` is on PATH. Requires a paid Claude plan.
- Run Claude Code from VS Code's integrated terminal pointed at the WSL distro.
- Suggested first vertical slice: **form → one tool (weather) → render a card.** Then add
  events + the access chain (the hard, high-value part). Prove the events/strike case early.
