"use client";

// Per screen-spec-v1.md §3 (Phase 9.3). Captures body, ISO behaviour and
// structured lenses — flash/notes are settings-only fields, not part of
// onboarding. Nothing is saved until the confirm step.
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/shared/Button";
import { MAX_LENSES } from "@/app/api/camera-profile/structured";
import AutocompleteField from "./AutocompleteField";
import LensCard from "./LensCard";
import Segmented from "./Segmented";
import { BODY_SUGGESTIONS, LENS_SUGGESTIONS } from "./suggestions";
import { draftFromLabel, moveItem, type LensDraft } from "./lensDraft";
import {
  EMPTY_BODY_DRAFT,
  buildProfilePayload,
  bodyDraftToProfile,
  editCropFactor,
  formatIsoSummary,
  formatLensSpec,
  setBodyLabel,
  type BodyDraft,
  type BodyField,
  type ProfilePayload,
  type TriState,
} from "./profileDraft";

type Step = 1 | 2 | 3;

const STEP_LABELS = ["Camera", "Lenses", "Confirm"];

const ISO_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "locked", label: "Locked" },
  { value: "capped", label: "Max cap" },
] as const;

const TRI_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Unknown" },
] as const;

const ISO_NOTE =
  "Aperture and shutter absorb everything else — and we'll tell you when a correct exposure is out of reach.";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]";

function setSkippedFlag() {
  try {
    localStorage.setItem("pw-skipped-onboarding", "true");
  } catch {
    // Storage can throw in private-browsing modes — skip must never block nav.
  }
}

function SkipLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/app"
      onClick={setSkippedFlag}
      className={`text-sm text-text-dim transition-colors duration-200 hover:text-text-muted ${focusRing} ${className}`}
    >
      I&rsquo;ll do this later
    </Link>
  );
}

function ProgressDots({ step }: { step: Step }) {
  return (
    <div
      className="flex items-center justify-center gap-2"
      role="img"
      aria-label={`Step ${step} of 3: ${STEP_LABELS[step - 1]}`}
    >
      {STEP_LABELS.map((label, i) => {
        const n = (i + 1) as Step;
        const reached = n <= step;
        return (
          <div key={label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-full transition-colors duration-300 ${
                reached ? "bg-accent" : "bg-border-strong"
              }`}
            />
            {n < 3 && <span aria-hidden="true" className="h-px w-5 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

interface StepFrameProps {
  heading: string;
  helper?: string;
  onBack?: () => void;
  children: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  primaryPending?: boolean;
  primaryPendingLabel?: string;
}

function StepFrame({
  heading,
  helper,
  onBack,
  children,
  primaryLabel,
  onPrimary,
  primaryPending,
  primaryPendingLabel,
}: StepFrameProps) {
  return (
    <div className="flex flex-1 flex-col gap-6 px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:flex-none sm:px-10 sm:pt-10 sm:pb-10">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className={`pw-pressable self-start text-sm text-text-muted transition-colors duration-200 hover:text-text ${focusRing}`}
        >
          ← Back
        </button>
      ) : (
        <div className="h-5" />
      )}

      <div className="flex flex-1 flex-col gap-3 sm:flex-none">
        <h1 className="font-display text-2xl text-text sm:text-3xl">{heading}</h1>
        {helper && <p className="text-sm text-text-muted">{helper}</p>}
        <div className="mt-2 flex flex-1 flex-col sm:flex-none">{children}</div>
      </div>

      <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button
          size="lg"
          fullWidth
          className="sm:w-auto"
          onClick={onPrimary}
          pending={primaryPending}
          pendingLabel={primaryPendingLabel}
        >
          {primaryLabel}
        </Button>
      </div>

      <SkipLink className="text-center sm:hidden" />
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] font-medium leading-5 text-text-muted">
      {children}
    </label>
  );
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-[13px] leading-5 text-danger">
      {message}
    </p>
  );
}

interface NumberFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode: "decimal" | "numeric";
  error: string | null;
  suffix?: string;
}

function NumberField({ id, value, onChange, placeholder, inputMode, error, suffix }: NumberFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`w-28 rounded-none border-0 border-b border-border-strong bg-transparent px-0 py-1 font-mono text-base leading-5 text-text placeholder:text-text-dim sm:text-[13px] ${
          value.trim() === "" ? "border-dashed" : "border-solid"
        } ${focusRing}`}
      />
      {suffix && <span className="text-[13px] leading-5 text-text-dim">{suffix}</span>}
    </div>
  );
}

let lensKeyCounter = 0;
function nextLensKey(): string {
  lensKeyCounter += 1;
  return `lens-${lensKeyCounter}`;
}

export default function CameraOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [bodyDraft, setBodyDraft] = useState<BodyDraft>(EMPTY_BODY_DRAFT);
  const [bodyError, setBodyError] = useState<{ field: BodyField; message: string } | null>(null);
  const [lenses, setLenses] = useState<LensDraft[]>([]);
  const [lensErrors, setLensErrors] = useState<Record<string, string>>({});
  const [lensQuery, setLensQuery] = useState("");
  const [payload, setPayload] = useState<ProfilePayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  function updateBody(next: BodyDraft) {
    setBodyDraft(next);
    setBodyError(null);
  }

  function addLens(text: string) {
    const trimmed = text.trim();
    setLensQuery("");
    if (trimmed.length === 0) return;
    setLenses((prev) => (prev.length >= MAX_LENSES ? prev : [...prev, draftFromLabel(nextLensKey(), trimmed)]));
  }

  function updateLens(next: LensDraft) {
    setLenses((prev) => prev.map((l) => (l.key === next.key ? next : l)));
    setLensErrors((prev) => {
      if (!(next.key in prev)) return prev;
      const rest = { ...prev };
      delete rest[next.key];
      return rest;
    });
  }

  function handleBodyContinue() {
    const result = bodyDraftToProfile(bodyDraft);
    if (!result.ok) {
      setBodyError({ field: result.field, message: result.message });
      return;
    }
    setStep(2);
  }

  function handleLensesContinue() {
    let drafts = lenses;
    if (lensQuery.trim().length > 0 && lenses.length < MAX_LENSES) {
      drafts = [...lenses, draftFromLabel(nextLensKey(), lensQuery.trim())];
      setLenses(drafts);
      setLensQuery("");
    }
    const result = buildProfilePayload(bodyDraft, drafts);
    if (!result.ok) {
      if (result.step === 1) {
        setBodyError({ field: result.field, message: result.message });
        setStep(1);
      } else {
        setLensErrors({ [result.lensKey]: result.message });
      }
      return;
    }
    setPayload(result.payload);
    setSaveError(false);
    setStep(3);
  }

  async function handleSave() {
    if (!payload) return;
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch("/api/camera-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save failed");
      router.push("/app");
    } catch {
      // Everything entered stays in state; the user can retry or go back.
      setSaving(false);
      setSaveError(true);
    }
  }

  const lensLabels = new Set(lenses.map((l) => l.label.trim()));
  const availableLensPool = LENS_SUGGESTIONS.filter((lens) => !lensLabels.has(lens));
  const atLensLimit = lenses.length >= MAX_LENSES;
  const errorFor = (field: BodyField) => (bodyError?.field === field ? bodyError.message : null);

  return (
    <main className="flex min-h-screen items-center justify-center sm:px-6 sm:py-12">
      <div
        data-shot="camera-picker"
        className="relative flex min-h-screen w-full flex-col sm:min-h-0 sm:max-w-[560px] sm:rounded-[24px] sm:border sm:border-border sm:bg-surface"
      >
        <SkipLink className="absolute right-5 top-5 hidden sm:inline-block" />

        <div className="px-6 pt-[max(2rem,env(safe-area-inset-top))] sm:px-10 sm:pt-10">
          <ProgressDots step={step} />
        </div>

        {step === 1 && (
          <StepFrame
            heading="What do you shoot on?"
            helper="Pick your camera, or type your own. Anything you don't know can stay blank."
            primaryLabel="Continue"
            onPrimary={handleBodyContinue}
          >
            <div className="flex flex-col gap-5">
              <AutocompleteField
                id="camera-body"
                value={bodyDraft.body}
                onChange={(v) => updateBody(setBodyLabel(bodyDraft, v))}
                onCommit={(v) => updateBody(setBodyLabel(bodyDraft, v))}
                pool={BODY_SUGGESTIONS}
                placeholder="e.g. Canon R6"
                sheetTitle="Choose your camera"
              />

              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="crop-factor">Crop factor</FieldLabel>
                <NumberField
                  id="crop-factor"
                  value={bodyDraft.cropFactor}
                  onChange={(v) => updateBody(editCropFactor(bodyDraft, v))}
                  placeholder="Unknown"
                  inputMode="decimal"
                  error={errorFor("cropFactor")}
                  suffix={bodyDraft.cropFactor.trim() === "1" ? "full frame" : undefined}
                />
                <FieldError id="crop-factor-error" message={errorFor("cropFactor")} />
              </div>

              <div className="flex flex-col gap-1">
                <span id="ibis-label" className="text-[13px] font-medium leading-5 text-text-muted">
                  In-body stabilisation
                </span>
                <Segmented
                  label="In-body stabilisation"
                  options={TRI_OPTIONS}
                  value={bodyDraft.ibis}
                  onChange={(v: TriState) => updateBody({ ...bodyDraft, ibis: v })}
                />
                {bodyDraft.ibis === "yes" && (
                  <div className="mt-1 flex flex-col gap-1">
                    <FieldLabel htmlFor="ibis-stops">Stops (if you know)</FieldLabel>
                    <NumberField
                      id="ibis-stops"
                      value={bodyDraft.ibisStops}
                      onChange={(v) => updateBody({ ...bodyDraft, ibisStops: v })}
                      placeholder="Unknown"
                      inputMode="decimal"
                      error={errorFor("ibisStops")}
                      suffix="stops"
                    />
                    <FieldError id="ibis-stops-error" message={errorFor("ibisStops")} />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-medium leading-5 text-text-muted">ISO</span>
                <Segmented
                  label="ISO"
                  options={ISO_OPTIONS}
                  value={bodyDraft.isoMode}
                  onChange={(v) => updateBody({ ...bodyDraft, isoMode: v })}
                />
                {bodyDraft.isoMode === "locked" && (
                  <div className="mt-1 flex flex-col gap-1">
                    <FieldLabel htmlFor="iso-value">Locked at</FieldLabel>
                    <NumberField
                      id="iso-value"
                      value={bodyDraft.isoValue}
                      onChange={(v) => updateBody({ ...bodyDraft, isoValue: v })}
                      placeholder="e.g. 100"
                      inputMode="numeric"
                      error={errorFor("isoValue")}
                    />
                    <FieldError id="iso-value-error" message={errorFor("isoValue")} />
                  </div>
                )}
                {bodyDraft.isoMode === "capped" && (
                  <div className="mt-1 flex flex-col gap-1">
                    <FieldLabel htmlFor="iso-max">Highest ISO</FieldLabel>
                    <NumberField
                      id="iso-max"
                      value={bodyDraft.isoMax}
                      onChange={(v) => updateBody({ ...bodyDraft, isoMax: v })}
                      placeholder="e.g. 3200"
                      inputMode="numeric"
                      error={errorFor("isoMax")}
                    />
                    <FieldError id="iso-max-error" message={errorFor("isoMax")} />
                  </div>
                )}
                {bodyDraft.isoMode !== "auto" && (
                  <p className="text-[13px] leading-5 text-text-muted">{ISO_NOTE}</p>
                )}
              </div>
            </div>
          </StepFrame>
        )}

        {step === 2 && (
          <StepFrame
            heading="Which lenses?"
            helper="Type a lens as you'd say it. We'll fill in what the name tells us — check it, and leave anything you don't know blank."
            onBack={() => setStep(1)}
            primaryLabel="Continue"
            onPrimary={handleLensesContinue}
          >
            <div className="flex flex-col gap-3">
              {lenses.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {lenses.map((lens, i) => (
                    <LensCard
                      key={lens.key}
                      draft={lens}
                      index={i}
                      count={lenses.length}
                      error={lensErrors[lens.key] ?? null}
                      onChange={updateLens}
                      onRemove={() => setLenses((prev) => prev.filter((l) => l.key !== lens.key))}
                      onMove={(dir) => setLenses((prev) => moveItem(prev, i, i + dir))}
                    />
                  ))}
                </ul>
              )}
              {atLensLimit ? (
                <p className="text-[13px] leading-5 text-text-muted">
                  That&rsquo;s the most lenses a profile can hold.
                </p>
              ) : (
                <AutocompleteField
                  id="camera-lens"
                  value={lensQuery}
                  onChange={setLensQuery}
                  onCommit={addLens}
                  pool={availableLensPool}
                  placeholder={lenses.length > 0 ? "Add another lens" : "e.g. RF 50mm f/1.8"}
                  sheetTitle="Choose a lens"
                />
              )}
            </div>
          </StepFrame>
        )}

        {step === 3 && payload && (
          <StepFrame
            heading="Does this look right?"
            helper="Nothing is saved until you confirm."
            onBack={() => setStep(2)}
            primaryLabel={saveError ? "Try again" : "Save and start shooting"}
            onPrimary={handleSave}
            primaryPending={saving}
            primaryPendingLabel="Saving…"
          >
            <div className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface-2 p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-muted">Your profile</span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className={`pw-pressable min-h-[44px] text-sm text-text underline underline-offset-2 transition-colors duration-200 hover:text-text-muted ${focusRing}`}
                >
                  Edit
                </button>
              </div>

              <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px] leading-5">
                <dt className="text-text-muted">Camera</dt>
                <dd className="break-words text-text">{payload.body ?? <span className="text-text-dim">Not set</span>}</dd>
                <dt className="text-text-muted">Crop factor</dt>
                <dd className="font-mono text-text">
                  {payload.structured.cropFactor ?? <span className="font-sans text-text-dim">Unknown</span>}
                </dd>
                <dt className="text-text-muted">Stabilisation</dt>
                <dd className="text-text">
                  {bodyDraft.ibis === "no"
                    ? "No"
                    : bodyDraft.ibis === "yes"
                      ? payload.structured.ibisStops !== null
                        ? `${payload.structured.ibisStops} stops`
                        : "Yes"
                      : <span className="text-text-dim">Unknown</span>}
                </dd>
                <dt className="text-text-muted">ISO</dt>
                <dd className="text-text">{formatIsoSummary(payload.structured)}</dd>
              </dl>

              <div className="border-t border-border pt-4">
                <span className="text-xs font-medium uppercase tracking-wide text-text-dim">
                  Lenses
                </span>
                {payload.structured.lenses.length > 0 ? (
                  <ol className="mt-2 flex flex-col gap-1 text-[13px] leading-5">
                    {payload.structured.lenses.map((lens, i) => (
                      <li key={`${i}-${lens.label}`} className="flex min-w-0 flex-col sm:flex-row sm:gap-3">
                        <span className="min-w-0 truncate text-text" title={lens.label}>{lens.label}</span>
                        <span className="flex-shrink-0 text-text-muted">{formatLensSpec(lens)}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-text-muted">None added</p>
                )}
              </div>
            </div>

            {saveError && (
              <div role="alert" className="mt-4 rounded-[14px] border border-danger/40 bg-danger/10 p-4">
                <p className="text-sm text-danger">
                  Couldn&rsquo;t save your profile. Everything you entered is still here — try again.
                </p>
              </div>
            )}
          </StepFrame>
        )}
      </div>
    </main>
  );
}
