import type { WeatherCondition, WeatherDay, WeatherSection } from "@/lib/sections";
import { SectionCard, type BadgeTone } from "@/components/cards/SectionCard";

/** Renders the weather section (PROJECT_SPEC §6). Always expands; the mode badge varies. */
export function WeatherCard({ section }: { section: WeatherSection }) {
  if (section.status === "unavailable") {
    return (
      <SectionCard
        title="Weather"
        headline={section.headline}
        badge={{ label: "Unavailable", tone: "grey" }}
        source={section.source}
        muted
      >
        {section.detail && <p>{section.detail}</p>}
      </SectionCard>
    );
  }

  const badge =
    section.mode === "forecast"
      ? { label: "Forecast", tone: "blue" as BadgeTone }
      : { label: "Seasonal average", tone: "amber" as BadgeTone };

  const days = section.days ?? [];

  return (
    <SectionCard
      title="Weather"
      headline={section.headline}
      badge={badge}
      source={section.source}
    >
      {days.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {days.map((day) => (
            <DaySquare key={day.date} day={day} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {section.tempHigh !== undefined && (
          <Stat label="High" value={`${section.tempHigh}°C`} />
        )}
        {section.tempLow !== undefined && (
          <Stat label="Low" value={`${section.tempLow}°C`} />
        )}
        {section.seaTemp !== undefined && (
          <Stat label="Sea" value={`${section.seaTemp}°C`} />
        )}
        {section.rainSignal && <Stat label="Rain" value={section.rainSignal} />}
      </div>
      {section.detail && <p className="mt-2 text-zinc-500">{section.detail}</p>}
    </SectionCard>
  );
}

/** A single forecast day: weekday, condition glyph, high/low. */
function DaySquare({ day }: { day: WeatherDay }) {
  return (
    <div className="flex w-24 flex-col items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-3 text-center">
      <span className="text-xs font-medium text-zinc-600">
        {day.weekday.slice(0, 3)}
      </span>
      <WeatherGlyph condition={day.condition} />
      <span className="text-sm text-zinc-900">
        {day.tempHigh}° <span className="text-zinc-400">/ {day.tempLow}°</span>
      </span>
      {day.precipProb !== undefined && day.precipProb >= 20 && (
        <span className="text-[11px] text-sky-600">{day.precipProb}% rain</span>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-sm text-zinc-700">
      <span className="text-zinc-400">{label}:</span> {value}
    </span>
  );
}

/**
 * Inline SVG weather glyphs (no icon dependency). One per coarse condition;
 * `wmoToCondition` in weather.ts maps the WMO code to these.
 */
function WeatherGlyph({ condition }: { condition: WeatherCondition }) {
  const common = "h-8 w-8";
  switch (condition) {
    case "clear":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-label="Sunny">
          <circle cx="12" cy="12" r="4.5" fill="#f59e0b" />
          {RAYS}
        </svg>
      );
    case "partly":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-label="Partly cloudy">
          <circle cx="9" cy="9" r="3.5" fill="#f59e0b" />
          <path d={CLOUD_PATH} fill="#cbd5e1" />
        </svg>
      );
    case "cloudy":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-label="Cloudy">
          <path d={CLOUD_PATH} fill="#94a3b8" />
        </svg>
      );
    case "rain":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-label="Rain">
          <path d={CLOUD_PATH} fill="#94a3b8" />
          {RAINDROPS}
        </svg>
      );
    case "snow":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-label="Snow">
          <path d={CLOUD_PATH} fill="#cbd5e1" />
          <g fill="#7dd3fc">
            <circle cx="9" cy="20" r="1" />
            <circle cx="13" cy="20" r="1" />
            <circle cx="17" cy="20" r="1" />
          </g>
        </svg>
      );
    case "fog":
      return (
        <svg className={common} viewBox="0 0 24 24" aria-label="Fog">
          <g stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round">
            <line x1="5" y1="9" x2="19" y2="9" />
            <line x1="4" y1="13" x2="20" y2="13" />
            <line x1="6" y1="17" x2="18" y2="17" />
          </g>
        </svg>
      );
    case "thunder":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-label="Thunderstorm">
          <path d={CLOUD_PATH} fill="#64748b" />
          <path d="M12 15l-2.5 4h2l-1.5 4 4-5h-2.2l1.7-3z" fill="#f59e0b" />
        </svg>
      );
  }
}

const CLOUD_PATH =
  "M7.5 17a3.5 3.5 0 0 1 0-7 5 5 0 0 1 9.6-1.3A3.4 3.4 0 0 1 17 17H7.5z";

const RAYS = (
  <g stroke="#f59e0b" strokeWidth="1.6" strokeLinecap="round">
    <line x1="12" y1="2.5" x2="12" y2="5" />
    <line x1="12" y1="19" x2="12" y2="21.5" />
    <line x1="2.5" y1="12" x2="5" y2="12" />
    <line x1="19" y1="12" x2="21.5" y2="12" />
    <line x1="5.2" y1="5.2" x2="6.9" y2="6.9" />
    <line x1="17.1" y1="17.1" x2="18.8" y2="18.8" />
    <line x1="18.8" y1="5.2" x2="17.1" y2="6.9" />
    <line x1="6.9" y1="17.1" x2="5.2" y2="18.8" />
  </g>
);

const RAINDROPS = (
  <g stroke="#38bdf8" strokeWidth="1.6" strokeLinecap="round">
    <line x1="9" y1="18" x2="8" y2="21" />
    <line x1="13" y1="18" x2="12" y2="21" />
    <line x1="17" y1="18" x2="16" y2="21" />
  </g>
);
