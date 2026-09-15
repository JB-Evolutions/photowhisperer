"use client";

// One lens as a dense spec sheet (13px/20px, 4px rhythm). Border style is the
// confidence signal: solid = read from the name or typed, dashed = a guess or
// unknown. Empty fields stay empty — no placeholder numbers.
import Segmented from "./Segmented";
import {
  editField,
  fieldBorder,
  hasGuesses,
  reparseDraft,
  setStabilised,
  stabilisedBorder,
  type Border,
  type LensDraft,
  type LensField,
} from "./lensDraft";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]";

const STAB_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Unknown" },
] as const;

type StabValue = (typeof STAB_OPTIONS)[number]["value"];

function stabValue(v: boolean | null): StabValue {
  return v === true ? "yes" : v === false ? "no" : "unknown";
}

function borderClass(border: Border): string {
  return border === "dashed" ? "border-dashed" : "border-solid";
}

interface SpecInputProps {
  value: string;
  border: Border;
  label: string;
  placeholder: string;
  onChange: (value: string) => void;
  width?: string;
}

// text-base below sm keeps iOS from zooming on focus; 13px from sm up.
function SpecInput({ value, border, label, placeholder, onChange, width = "w-14" }: SpecInputProps) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${width} rounded-none border-0 border-b border-border-strong ${borderClass(border)} bg-transparent px-0 py-1 font-mono text-base leading-5 text-text placeholder:text-text-dim sm:text-[13px] ${focusRing}`}
    />
  );
}

interface IconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

function IconButton({ label, onClick, disabled, children }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-30 ${focusRing}`}
    >
      {children}
    </button>
  );
}

interface LensCardProps {
  draft: LensDraft;
  index: number;
  count: number;
  error: string | null;
  onChange: (draft: LensDraft) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}

export default function LensCard({ draft, index, count, error, onChange, onRemove, onMove }: LensCardProps) {
  const name = draft.label.trim() || `Lens ${index + 1}`;
  const errorId = `${draft.key}-error`;

  function field(f: LensField, label: string, placeholder: string) {
    return (
      <SpecInput
        value={draft[f]}
        border={fieldBorder(draft, f)}
        label={`${name}: ${label}`}
        placeholder={placeholder}
        onChange={(v) => onChange(editField(draft, f, v))}
      />
    );
  }

  return (
    <li
      aria-describedby={error ? errorId : undefined}
      className="rounded-[14px] border border-border bg-surface-2 p-3"
    >
      <div className="flex items-start gap-1">
        <input
          type="text"
          value={draft.label}
          aria-label={`Lens ${index + 1} name`}
          placeholder="Lens name"
          maxLength={255}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
          onBlur={() => onChange(reparseDraft(draft))}
          className={`min-h-[44px] min-w-0 flex-1 rounded-none border-0 border-b border-solid border-border-strong bg-transparent px-0 text-base text-text placeholder:text-text-dim ${focusRing}`}
        />
        <IconButton label={`Move ${name} up`} onClick={() => onMove(-1)} disabled={index === 0}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </IconButton>
        <IconButton label={`Move ${name} down`} onClick={() => onMove(1)} disabled={index === count - 1}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </IconButton>
        <IconButton label={`Remove ${name}`} onClick={onRemove}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </IconButton>
      </div>

      <dl className="mt-2 grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-x-4 gap-y-1 text-[13px] leading-5">
        <dt className="text-text-muted">Focal length</dt>
        <dd className="flex items-center gap-2">
          {field("focalMin", "shortest focal length, mm", "mm")}
          <span aria-hidden="true" className="text-text-dim">–</span>
          {field("focalMax", "longest focal length, mm", "mm")}
          <span aria-hidden="true" className="text-text-dim">mm</span>
        </dd>

        <dt className="text-text-muted">Max aperture</dt>
        <dd className="flex items-center gap-2">
          <span aria-hidden="true" className="text-text-dim">f/</span>
          {field("aperWide", "widest aperture at the short end", "wide")}
          <span aria-hidden="true" className="text-text-dim">–</span>
          {field("aperTele", "widest aperture at the long end", "long")}
        </dd>

        <dt className="text-text-muted">Stabilised</dt>
        <dd className={`border-b border-border-strong pb-1 ${borderClass(stabilisedBorder(draft))}`}>
          <Segmented
            label={`${name}: stabilised`}
            options={STAB_OPTIONS}
            value={stabValue(draft.stabilised)}
            onChange={(v) => onChange(setStabilised(draft, v === "yes" ? true : v === "no" ? false : null))}
          />
        </dd>
      </dl>

      {hasGuesses(draft) && (
        <p className="mt-1 text-[13px] leading-5 text-text-muted">
          Best guess from the name — correct anything that&rsquo;s wrong.
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-[13px] leading-5 text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
