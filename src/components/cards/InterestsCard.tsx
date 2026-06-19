import type { InterestsSection, InterestBlock } from "@/lib/sections";
import { SectionCard, type BadgeTone } from "@/components/cards/SectionCard";

/** Renders the interests section (§6). Adaptive: expands per detected interest, else one line. */
export function InterestsCard({ section }: { section: InterestsSection }) {
  if (section.status === "unavailable") {
    return (
      <SectionCard
        title="Interests"
        headline={section.headline}
        badge={{ label: "Unavailable", tone: "grey" }}
        muted
      >
        {section.detail && <p>{section.detail}</p>}
      </SectionCard>
    );
  }

  const empty = section.interests.length === 0;

  return (
    <SectionCard
      title="Interests"
      headline={section.headline}
      badge={
        empty
          ? undefined
          : { label: "From your note", tone: "green" as BadgeTone }
      }
      muted={empty}
    >
      {!empty && (
        <div className="mt-1 space-y-3">
          {section.interests.map((block, i) => (
            <InterestBlockView key={i} block={block} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function InterestBlockView({ block }: { block: InterestBlock }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3">
      <p className="text-sm font-medium capitalize text-zinc-900">
        {block.interest}
      </p>
      {block.headline && (
        <p className="mt-0.5 text-sm text-zinc-600">{block.headline}</p>
      )}

      {block.items.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {block.items.map((item, i) => (
            <li key={i}>
              <span className="font-medium text-zinc-800">{item.name}</span>
              {item.note && (
                <span className="text-zinc-600"> — {item.note}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {block.logistics && (
        <p className="mt-2 text-xs text-zinc-500">
          <span className="font-medium text-zinc-600">Good to know:</span>{" "}
          {block.logistics}
        </p>
      )}
    </div>
  );
}
