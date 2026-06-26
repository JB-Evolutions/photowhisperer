"use client";

// Per screen-spec-v1.md §3.1 (Phase 9.3). Captures body + lenses only —
// flash/notes are settings-only fields, not part of onboarding.
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/shared/Button";
import AutocompleteField from "./AutocompleteField";
import { BODY_SUGGESTIONS, LENS_SUGGESTIONS } from "./suggestions";

type Step = 1 | 2 | 3;

const STEP_LABELS = ["Body", "Lenses", "Done"];

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
      className={`text-sm text-text-dim transition-colors duration-200 hover:text-text-muted ${className}`}
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
  hideSkip?: boolean;
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
  hideSkip,
}: StepFrameProps) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6 sm:flex-none sm:p-10">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="self-start text-sm text-text-muted transition-colors duration-200 hover:text-text"
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

      {!hideSkip && <SkipLink className="text-center sm:hidden" />}
    </div>
  );
}

export default function CameraOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [body, setBody] = useState("");
  const [lenses, setLenses] = useState<string[]>([]);
  const [lensQuery, setLensQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  function addLens(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setLenses((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setLensQuery("");
  }

  function removeLens(lens: string) {
    setLenses((prev) => prev.filter((l) => l !== lens));
  }

  function handleLensesContinue() {
    if (lensQuery.trim().length > 0) addLens(lensQuery);
    setStep(3);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch("/api/camera-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim().length > 0 ? body.trim() : null,
          lenses: lenses.length > 0 ? lenses : null,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      router.push("/app");
    } catch {
      setSaving(false);
      setSaveError(true);
    }
  }

  const availableLensPool = LENS_SUGGESTIONS.filter((lens) => !lenses.includes(lens));

  return (
    <main className="flex min-h-screen items-center justify-center sm:px-6 sm:py-12">
      <div
        className={`relative flex min-h-screen w-full flex-col sm:min-h-0 sm:max-w-[560px] sm:rounded-[24px] sm:border sm:border-border sm:bg-surface ${
          saveError ? "pb-28" : ""
        }`}
      >
        <SkipLink className="absolute right-5 top-5 hidden sm:inline-block" />

        <div className="px-6 pt-8 sm:px-10 sm:pt-10">
          <ProgressDots step={step} />
        </div>

        {step === 1 && (
          <StepFrame
            heading="What do you shoot on?"
            helper="Pick your camera, or type your own — any answer works."
            primaryLabel="Continue"
            onPrimary={() => setStep(2)}
          >
            <AutocompleteField
              id="camera-body"
              value={body}
              onChange={setBody}
              onCommit={setBody}
              pool={BODY_SUGGESTIONS}
              placeholder="e.g. Canon R6"
              sheetTitle="Choose your camera"
            />
          </StepFrame>
        )}

        {step === 2 && (
          <StepFrame
            heading="Which lenses?"
            helper="Add as many as you like — totally optional."
            onBack={() => setStep(1)}
            primaryLabel="Continue"
            onPrimary={handleLensesContinue}
          >
            <div className="flex flex-col gap-3">
              {lenses.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {lenses.map((lens) => (
                    <li key={lens}>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border-accent bg-surface-2 py-1.5 pl-3 pr-2 text-sm text-text">
                        {lens}
                        <button
                          type="button"
                          onClick={() => removeLens(lens)}
                          aria-label={`Remove ${lens}`}
                          className="flex h-5 w-5 items-center justify-center rounded-full text-text-muted transition-colors duration-200 hover:bg-surface-3 hover:text-text"
                        >
                          ×
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <AutocompleteField
                id="camera-lens"
                value={lensQuery}
                onChange={setLensQuery}
                onCommit={addLens}
                pool={availableLensPool}
                placeholder="e.g. RF 50mm f/1.8"
                sheetTitle="Choose a lens"
              />
            </div>
          </StepFrame>
        )}

        {step === 3 && (
          <StepFrame
            heading="You're set."
            primaryLabel="Start shooting"
            onPrimary={handleSave}
            primaryPending={saving}
            primaryPendingLabel="Saving…"
            hideSkip={saveError}
          >
            <div className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface-2 p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-muted">Your profile</span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm text-accent transition-colors duration-200 hover:underline"
                >
                  Edit
                </button>
              </div>

              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-text-dim">
                  Camera
                </span>
                <p className="mt-1 font-display text-lg text-text">
                  {body.trim().length > 0 ? body.trim() : "Not set"}
                </p>
              </div>

              <div className="border-t border-border pt-4">
                <span className="text-xs font-medium uppercase tracking-wide text-text-dim">
                  Lenses
                </span>
                {lenses.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {lenses.map((lens) => (
                      <li
                        key={lens}
                        className="rounded-full border border-border-accent bg-surface px-3 py-1 text-sm text-text"
                      >
                        {lens}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-text-muted">None added</p>
                )}
              </div>
            </div>
          </StepFrame>
        )}
      </div>

      {saveError && (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-[420px] flex-col gap-3 rounded-[14px] border border-danger/40 bg-danger/10 p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-danger">Couldn&rsquo;t save your profile.</p>
          <div className="flex items-center gap-3">
            <Button
              size="default"
              variant="outline"
              onClick={handleSave}
              pending={saving}
              pendingLabel="Retrying…"
            >
              Retry
            </Button>
            <Link
              href="/app"
              onClick={setSkippedFlag}
              className="text-sm text-text-muted transition-colors duration-200 hover:text-text"
            >
              Skip for now
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
