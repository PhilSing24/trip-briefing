import type { WeatherSection } from "@/lib/sections";
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

  return (
    <SectionCard
      title="Weather"
      headline={section.headline}
      badge={badge}
      source={section.source}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Stat label="High" value={`${section.tempHigh}°C`} />
        <Stat label="Low" value={`${section.tempLow}°C`} />
        {section.seaTemp !== undefined && (
          <Stat label="Sea" value={`${section.seaTemp}°C`} />
        )}
        {section.rainSignal && <Stat label="Rain" value={section.rainSignal} />}
      </div>
      {section.detail && <p className="mt-2 text-zinc-500">{section.detail}</p>}
    </SectionCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-sm text-zinc-700">
      <span className="text-zinc-400">{label}:</span> {value}
    </span>
  );
}
