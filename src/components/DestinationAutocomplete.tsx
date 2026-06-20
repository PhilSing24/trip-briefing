"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ResolvedPlace } from "@/lib/sections";

/** Canonical one-line label for a resolved place, e.g. "Capri, Campania, Italy". */
export function formatPlaceLabel(p: ResolvedPlace): string {
  return [p.name, p.admin1, p.country].filter(Boolean).join(", ");
}

interface Props {
  id?: string;
  value: string;
  /** Called as the user types — the parent should clear any resolved place. */
  onChange: (text: string) => void;
  /** Called when a suggestion is picked — the parent stores the resolved place. */
  onSelect: (place: ResolvedPlace) => void;
  placeholder?: string;
}

/**
 * Destination autocomplete (PROJECT_SPEC §3). As the user types it queries
 * /api/geocode (debounced) and offers disambiguated places (Paris FR vs Paris
 * TX); picking one resolves to a real place so the backend never has to guess.
 */
export function DestinationAutocomplete({
  id,
  value,
  onChange,
  onSelect,
  placeholder,
}: Props) {
  const [results, setResults] = React.useState<ResolvedPlace[]>([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [loading, setLoading] = React.useState(false);
  const skipFetch = React.useRef(false);

  // Debounced search on the typed value. A selection sets skipFetch so the
  // canonical label we write back doesn't immediately re-open the dropdown.
  React.useEffect(() => {
    if (skipFetch.current) {
      skipFetch.current = false;
      return;
    }
    const q = value.trim();
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as { places: ResolvedPlace[] };
        setResults(data.places ?? []);
        setActive(-1);
        setOpen(true);
      } catch {
        /* aborted or network error — leave prior results, fail quietly */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  function select(place: ResolvedPlace) {
    skipFetch.current = true;
    setOpen(false);
    setResults([]);
    setActive(-1);
    onSelect(place);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      select(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
          {results.map((p, i) => (
            <li
              key={`${p.name}-${p.latitude}-${p.longitude}`}
              // mouseDown (not click) fires before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                select(p);
              }}
              className={cn(
                "flex cursor-pointer items-baseline gap-2 px-3 py-2 text-sm",
                i === active ? "bg-zinc-100" : "hover:bg-zinc-50",
              )}
            >
              <span className="text-zinc-900">{p.name}</span>
              <span className="truncate text-xs text-zinc-400">
                {[p.admin1, p.country].filter(Boolean).join(", ")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {loading && value.trim().length >= 2 && !open && (
        <span className="absolute right-3 top-2.5 text-xs text-zinc-400">…</span>
      )}
    </div>
  );
}
