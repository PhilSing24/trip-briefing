import type {
  AdminSection,
  NationalityAdmin,
  VisaStatus,
} from "@/lib/sections";
import { SectionCard, type BadgeTone } from "@/components/cards/SectionCard";
import { cn } from "@/lib/utils";

const VISA_LABEL: Record<VisaStatus, string> = {
  visa_free: "Visa-free",
  visa_on_arrival: "Visa on arrival",
  evisa: "e-Visa",
  visa_required: "Visa required",
  eta_required: "Travel authorisation",
};

const VISA_TONE: Record<VisaStatus, BadgeTone> = {
  visa_free: "green",
  visa_on_arrival: "amber",
  evisa: "amber",
  visa_required: "red",
  eta_required: "amber",
};

/** Renders the admin / entry-requirements section (§6). Adaptive: collapses when visa-free + no to-dos. */
export function AdminCard({ section }: { section: AdminSection }) {
  if (section.status === "unavailable") {
    return (
      <SectionCard
        title="Entry requirements"
        headline={section.headline}
        badge={{ label: "Unavailable", tone: "grey" }}
        muted
      >
        {section.detail && <p>{section.detail}</p>}
      </SectionCard>
    );
  }

  const totalToDos = section.perNationality.reduce(
    (n, p) => n + p.toDos.length,
    0,
  );
  const allVisaFree = section.perNationality.every(
    (p) => p.visaStatus === "visa_free",
  );
  const collapsed = allVisaFree && totalToDos === 0;

  const badge =
    totalToDos > 0
      ? {
          label: `${totalToDos} to-do${totalToDos === 1 ? "" : "s"}`,
          tone: "amber" as BadgeTone,
        }
      : { label: "All set", tone: "green" as BadgeTone };

  return (
    <SectionCard
      title="Entry requirements"
      headline={section.headline}
      badge={badge}
      source={section.source}
    >
      {!collapsed && (
        <ul className="mt-1 space-y-3">
          {section.perNationality.map((nat, i) => (
            <NationalityRow key={i} nat={nat} />
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-zinc-400">
        Entry rules change — confirm with the official source before you book or
        travel.
      </p>
    </SectionCard>
  );
}

function NationalityRow({ nat }: { nat: NationalityAdmin }) {
  return (
    <li className="rounded-lg border border-zinc-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-zinc-900">
          {nat.nationality}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
            toneClass(VISA_TONE[nat.visaStatus]),
          )}
        >
          {VISA_LABEL[nat.visaStatus]}
        </span>
      </div>

      <dl className="mt-1.5 space-y-0.5 text-sm text-zinc-600">
        <Row label="Max stay" value={nat.maxStay} />
        <Row label="Passport" value={nat.passportValidity} />
      </dl>

      {nat.toDos.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-zinc-500">To do</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-zinc-700">
            {nat.toDos.map((todo, i) => (
              <li key={i}>{todo}</li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-zinc-400">{label}:</dt>
      <dd>{value}</dd>
    </div>
  );
}

function toneClass(tone: BadgeTone): string {
  const tones: Record<BadgeTone, string> = {
    red: "bg-red-50 text-red-700 ring-red-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    green: "bg-green-50 text-green-700 ring-green-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    grey: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  };
  return tones[tone];
}
