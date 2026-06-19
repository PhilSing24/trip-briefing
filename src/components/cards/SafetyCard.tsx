import type { SafetySection, SafetyLevel } from "@/lib/sections";
import { SectionCard, type BadgeTone } from "@/components/cards/SectionCard";

const LEVEL_LABEL: Record<SafetyLevel, string> = {
  normal: "Normal precautions",
  caution: "Increased caution",
  reconsider: "Reconsider travel",
  do_not_travel: "Do not travel",
};

const LEVEL_TONE: Record<SafetyLevel, BadgeTone> = {
  normal: "green",
  caution: "amber",
  reconsider: "red",
  do_not_travel: "red",
};

/** Renders safety / geopolitical risk (§6). Strongest collapse case: normal → one grey line. */
export function SafetyCard({ section }: { section: SafetySection }) {
  if (section.status === "unavailable") {
    return (
      <SectionCard
        title="Safety"
        headline={section.headline}
        badge={{ label: "Unavailable", tone: "grey" }}
        muted
      >
        {section.detail && <p>{section.detail}</p>}
      </SectionCard>
    );
  }

  const isNormal = section.level === "normal";

  return (
    <SectionCard
      title="Safety"
      headline={section.headline}
      badge={{ label: LEVEL_LABEL[section.level], tone: LEVEL_TONE[section.level] }}
      source={section.source}
      muted={isNormal}
    >
      {!isNormal && section.detail && <p>{section.detail}</p>}
      {!isNormal && (
        <p className="mt-2 text-xs text-zinc-400">
          Based on the official advisory — re-check close to departure.
        </p>
      )}
    </SectionCard>
  );
}
