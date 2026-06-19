# CLAUDE.md — working instructions for this repo

## What we're building
A pre-trip **briefing** tool. The user names a destination, dates, and party; the app
returns a structured, adaptive briefing of what they need to know (weather, events,
safety, entry requirements, interests). It is **NOT** a recommender and **NOT** a
booking engine. The destination is an *input*, not an output.

**Read `PROJECT_SPEC.md` first** — it is the full design and the source of truth for
every product decision. This file is just how to work in the repo.

## The one principle that governs every feature
- In scope: "What you should know about a place you've chosen."
- Out of scope: "Help me choose." (recommendation / discovery)
If a proposed feature ranks or picks options for the user, it's out of scope.

## Tech decisions (locked)
- **All in Next.js (React + TypeScript)** — one repo, one language. The backend pipeline
  lives in Next.js API routes; do NOT add a separate Python service for the MVP.
- **Tailwind CSS** + a clean component library (e.g. shadcn/ui) from day one, so the
  plain MVP and the future "beautiful" version share primitives.
- **SQLite** later, for the owned cost-tier table and curated access chains. Not a vector DB.
- The in-app LLM call uses the **Claude API** (Anthropic) — distinct from Claude Code itself.

## Architecture (don't over-engineer)
This is a **pipeline**, not an autonomous agent. Flow:
form -> API route -> parallel tool calls (weather/events/safety/admin) + access-chain ->
ONE LLM synthesis pass that emits **structured typed section objects** (never a prose
blob) -> adaptive sectioned cards in the UI.
Do NOT reach for LangGraph or agent frameworks. Add them only if real branching appears.

## How to work with me (Philippe)
- **Build in small vertical slices, and stop for review between them.** Do not generate
  the whole app at once. Suggested first slices, in order:
  1. Scaffold the Next.js + Tailwind app.
  2. The input form (PROJECT_SPEC section 3) as a component.
  3. ONE backend tool — weather (Open-Meteo, free) — and render a single weather card.
  4. Then events + the access chain (the hard, high-value differentiator).
- **Explain before large changes**, and after each slice summarize what changed.
- **Commit-sized chunks.** Keep changes reviewable; I review diffs and commit between slices.
- **Don't silently decide the open items** in PROJECT_SPEC section 9 (synthesis-prompt
  design, graceful degradation, final card order). Flag them to me; I'll decide.
- Prefer Sonnet for routine work; reserve heavier reasoning for the synthesis/event logic.

## Data sources (all free / freemium for MVP)
- Weather: Open-Meteo (no key; forecast + climate normals).
- Events: cultural feeds (Ticketmaster/PredictHQ/tourism calendars) + disruption/news feeds.
- Safety: government travel advisories. Admin: official gov sources, fetched + cited.
- Always label weather mode: "forecast" vs "typical/seasonal" — never let an average read
  as a forecast.

## Repo conventions
- `main` branch. Commit after each working slice with a clear message.
- Keep everything inside the WSL filesystem (this folder). No `/mnt/c/` paths.
