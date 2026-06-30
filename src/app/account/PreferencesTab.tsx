"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { useToastContext } from "@/components/app/useToast";
import type { TabActions } from "./AccountSettings";

interface PrefsSnapshot {
  focalLength: number | null;
  productEmails: boolean;
}

interface PreferencesTabProps {
  onDirtyChange: (dirty: boolean) => void;
  registerActions: (actions: TabActions | null) => void;
}

type LoadState = "loading" | "ok" | "error";

export default function PreferencesTab({ onDirtyChange, registerActions }: PreferencesTabProps) {
  const showToast = useToastContext();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [focalLength, setFocalLength] = useState<number | null>(null);
  const [focalInput, setFocalInput] = useState("");
  const [focalError, setFocalError] = useState<string | null>(null);
  const [productEmails, setProductEmails] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const savedRef = useRef<PrefsSnapshot | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const discardRef = useRef<() => void>(() => {});

  // ─── Load ────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const res = await fetch("/api/preferences");
      if (!res.ok) { setLoadState("error"); return; }
      const raw = await res.json() as {
        default_focal_length_mm: number | null;
        product_emails_opt_in: boolean;
      };
      const snap: PrefsSnapshot = {
        focalLength: raw.default_focal_length_mm,
        productEmails: raw.product_emails_opt_in,
      };
      savedRef.current = snap;
      setFocalLength(snap.focalLength);
      setFocalInput(snap.focalLength !== null ? String(snap.focalLength) : "");
      setProductEmails(snap.productEmails);
      setLoadState("ok");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── Dirty tracking ──────────────────────────────────────────────────────
  // Compare focalInput (raw string) against the saved value's canonical string
  // form — not focalLength (parsed). This catches invalid-input states where
  // focalLength is null but focalInput has text, ensuring the SaveBar always
  // appears when there is visible-but-unsaved content in the field.

  useEffect(() => {
    if (!savedRef.current) return;
    const savedFocalStr = savedRef.current.focalLength !== null
      ? String(savedRef.current.focalLength) : "";
    onDirtyChange(
      focalInput !== savedFocalStr ||
      productEmails !== savedRef.current.productEmails
    );
  }, [focalInput, productEmails, onDirtyChange]);

  // ─── Focal input handling ─────────────────────────────────────────────────

  function handleFocalChange(raw: string) {
    setFocalInput(raw);
    setFocalError(null);
    if (raw.trim() === "") {
      setFocalLength(null);
      return;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 8 || n > 1200) {
      setFocalError("Enter a whole number between 8 and 1200, or leave blank to clear.");
      setFocalLength(null);
      return;
    }
    setFocalLength(n);
  }

  // ─── Save / Discard ──────────────────────────────────────────────────────
  // Assigned every render; stable wrappers registered once on mount delegate
  // to these refs — avoids stale closures on second save after tab-switch.

  saveRef.current = async () => {
    // Guard: focalInput has text but parsed to null means invalid value.
    // SaveBar is visible in this state (dirty tracking catches focalInput divergence),
    // so the user can reach Save and get this error.
    if (focalInput.trim() !== "" && focalLength === null) {
      setSaveError("Fix the focal length value before saving.");
      throw new Error("invalid focal");
    }
    setSaveError(null);

    let res: Response;
    try {
      res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_focal_length_mm: focalLength,
          product_emails_opt_in: productEmails,
        }),
      });
    } catch {
      setSaveError("Couldn't reach the server — check your connection and try again.");
      throw new Error("network failure");
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>;
      const msg = typeof err.message === "string" ? err.message : "Couldn't save — try again?";
      setSaveError(msg);
      throw new Error(msg);
    }

    const updated = await res.json() as {
      default_focal_length_mm: number | null;
      product_emails_opt_in: boolean;
    };
    const snap: PrefsSnapshot = {
      focalLength: updated.default_focal_length_mm,
      productEmails: updated.product_emails_opt_in,
    };
    savedRef.current = snap;
    setFocalLength(snap.focalLength);
    setFocalInput(snap.focalLength !== null ? String(snap.focalLength) : "");
    setProductEmails(snap.productEmails);
    onDirtyChange(false);
    showToast("Preferences saved");
  };

  discardRef.current = () => {
    if (!savedRef.current) return;
    const s = savedRef.current;
    setFocalLength(s.focalLength);
    setFocalInput(s.focalLength !== null ? String(s.focalLength) : "");
    setFocalError(null);
    setProductEmails(s.productEmails);
    setSaveError(null);
    onDirtyChange(false);
  };

  // Register stable wrappers once on mount; cleanup on unmount.
  useEffect(() => {
    registerActions({
      save: () => saveRef.current(),
      discard: () => discardRef.current(),
    });
    return () => registerActions(null);
  }, [registerActions]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex max-w-lg flex-col gap-8 px-6 py-8">
      <h2 className="font-display text-base text-text">Preferences</h2>

      {/* Appearance — ThemeToggle self-manages; no save/discard wiring needed */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-text">Appearance</span>
            <span className="text-sm text-text-dim">Saved to this browser.</span>
          </div>
          <ThemeToggle />
        </div>
      </section>

      {/* Focal length + email opt-in — gated on loadState.
          Controls absent on error/loading so user can't save over unloaded data. */}
      <section className="flex flex-col gap-6 border-t border-border pt-6">

        {loadState === "loading" && (
          <>
            <div className="h-[52px] animate-pulse rounded-[10px] bg-surface-2" />
            <div className="h-[52px] animate-pulse rounded-[10px] bg-surface-2" />
          </>
        )}

        {loadState === "error" && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-text-muted">Couldn&rsquo;t load preferences.</span>
            <button
              type="button"
              onClick={load}
              className="rounded text-sm text-accent transition-colors duration-[250ms] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]"
            >
              Retry
            </button>
          </div>
        )}

        {loadState === "ok" && (
          <>
            {/* Default focal length */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pref-focal-length" className="text-sm font-medium text-text">
                Default focal length (mm)
              </label>
              <input
                id="pref-focal-length"
                type="number"
                min={8}
                max={1200}
                step={1}
                value={focalInput}
                onChange={(e) => handleFocalChange(e.target.value)}
                placeholder="e.g. 50"
                className="min-h-[52px] rounded-[10px] border border-border-strong bg-surface px-4 text-base text-text outline-none transition-colors focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              {focalError ? (
                <p role="alert" className="text-sm text-danger">{focalError}</p>
              ) : (
                <p className="text-sm text-text-dim">
                  Applied when no focal length cue is in your prompt.
                </p>
              )}
            </div>

            {/* Product emails opt-in — honest copy: no emails send yet */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-text">Get product updates by email</span>
                <span className="text-sm text-text-dim">
                  We&rsquo;ll apply this preference when product emails are introduced.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={productEmails}
                onClick={() => setProductEmails((v) => !v)}
                className={[
                  "relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] focus-visible:ring-offset-2",
                  productEmails ? "bg-accent" : "bg-border-strong",
                ].join(" ")}
              >
                <span
                  className={[
                    "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                    productEmails ? "translate-x-5" : "translate-x-0",
                  ].join(" ")}
                />
                <span className="sr-only">{productEmails ? "On" : "Off"}</span>
              </button>
            </div>

            {saveError && (
              <p role="alert" className="text-sm text-danger">{saveError}</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
