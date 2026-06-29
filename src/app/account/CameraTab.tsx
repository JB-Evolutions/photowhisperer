"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import AutocompleteField from "@/app/onboarding/camera/AutocompleteField";
import { BODY_SUGGESTIONS, LENS_SUGGESTIONS } from "@/app/onboarding/camera/suggestions";
import TextField from "@/components/shared/TextField";
import { useToastContext } from "@/components/app/useToast";
import type { TabActions } from "./AccountSettings";

type FlashValue = "" | "none" | "speedlight" | "studio";

interface ProfileSnapshot {
  body: string;
  lenses: string[];
  flash: FlashValue;
  notes: string;
}

function normalize(raw: {
  body: string | null;
  lenses: string[] | null;
  flash: string | null;
  notes: string | null;
}): ProfileSnapshot {
  return {
    body: raw.body ?? "",
    lenses: raw.lenses ?? [],
    flash: (raw.flash ?? "") as FlashValue,
    notes: raw.notes ?? "",
  };
}

interface CameraTabProps {
  onDirtyChange: (dirty: boolean) => void;
  registerActions: (actions: TabActions | null) => void;
}

export default function CameraTab({ onDirtyChange, registerActions }: CameraTabProps) {
  const showToast = useToastContext();

  const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading");
  const [body, setBody] = useState("");
  const [lenses, setLenses] = useState<string[]>([]);
  const [lensQuery, setLensQuery] = useState("");
  const [flash, setFlash] = useState<FlashValue>("");
  const [notes, setNotes] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const savedRef = useRef<ProfileSnapshot | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const discardRef = useRef<() => void>(() => {});

  // ─── Load ────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const res = await fetch("/api/camera-profile");
      if (!res.ok) { setLoadState("error"); return; }
      const raw = await res.json() as {
        body: string | null;
        lenses: string[] | null;
        flash: string | null;
        notes: string | null;
      };
      const snap = normalize(raw);
      savedRef.current = snap;
      setBody(snap.body);
      setLenses(snap.lenses);
      setFlash(snap.flash);
      setNotes(snap.notes);
      setLoadState("ok");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── Dirty tracking ───────────────────────────────────────────────────────
  // lensQuery.trim() !== "" counts as dirty: typed-but-uncommitted text is an
  // unsaved change, so DirtyGuard fires if the user tries to switch tabs.

  useEffect(() => {
    if (!savedRef.current) return;
    const s = savedRef.current;
    const dirty =
      body !== s.body ||
      flash !== s.flash ||
      notes !== s.notes ||
      lensQuery.trim() !== "" ||
      JSON.stringify(lenses) !== JSON.stringify(s.lenses);
    onDirtyChange(dirty);
  }, [body, lenses, lensQuery, flash, notes, onDirtyChange]);

  // ─── Save / Discard ───────────────────────────────────────────────────────
  // Updated each render via ref so AccountSettings always calls the latest
  // closure through the stable wrappers registered once on mount.

  saveRef.current = async () => {
    setSaveError(null);

    // Compute finalLenses locally — no setState before the await.
    // If the PUT fails, lenses/lensQuery state is untouched.
    const pendingLens = lensQuery.trim();
    const finalLenses =
      pendingLens && !lenses.includes(pendingLens)
        ? [...lenses, pendingLens]
        : lenses;

    const res = await fetch("/api/camera-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: body.trim() || null,
        lenses: finalLenses.length > 0 ? finalLenses : null,
        flash: flash || null,
        notes: notes.trim() || null,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>;
      const msg = typeof err.message === "string" ? err.message : "Couldn't save — try again?";
      setSaveError(msg);
      throw new Error(msg);
    }

    const updated = await res.json() as {
      body: string | null;
      lenses: string[] | null;
      flash: string | null;
      notes: string | null;
    };
    const snap = normalize(updated);
    savedRef.current = snap;
    // Sync all four fields from server echo — source of truth after successful PUT.
    setBody(snap.body);
    setLenses(snap.lenses);
    setFlash(snap.flash);
    setNotes(snap.notes);
    setLensQuery("");
    onDirtyChange(false);
    showToast("Camera profile saved");
  };

  discardRef.current = () => {
    if (!savedRef.current) return;
    const s = savedRef.current;
    setBody(s.body);
    setLenses(s.lenses);
    setLensQuery("");
    setFlash(s.flash);
    setNotes(s.notes);
    setSaveError(null);
    onDirtyChange(false);
  };

  // Register stable wrappers once on mount; cleanup on unmount.
  // Wrappers delegate to saveRef/discardRef so they never go stale.
  // LIVE TEST REQUIRED: after saving, switch away and back to Camera,
  // edit, and save again — confirm PUT fires the second time too.
  useEffect(() => {
    registerActions({
      save: () => saveRef.current(),
      discard: () => discardRef.current(),
    });
    return () => registerActions(null);
  }, [registerActions]);

  // ─── Lens helpers ─────────────────────────────────────────────────────────

  function addLens(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLenses((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setLensQuery("");
  }

  function removeLens(lens: string) {
    setLenses((prev) => prev.filter((l) => l !== lens));
  }

  const availableLenses = LENS_SUGGESTIONS.filter((l) => !lenses.includes(l));

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loadState === "loading") {
    return (
      <div className="flex max-w-lg flex-col gap-6 px-6 py-8">
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-[52px] animate-pulse rounded-[10px] bg-surface-2" />
        ))}
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex items-center gap-3 px-6 py-8">
        <span className="text-sm text-text-muted">Couldn&rsquo;t load camera profile.</span>
        <button
          type="button"
          onClick={load}
          className="rounded text-sm text-accent transition-colors duration-[250ms] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-6 px-6 py-8">
      <h2 className="font-display text-base text-text">Camera</h2>

      {/* Body */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="camera-body" className="text-sm font-medium text-text-muted">
          Camera body
        </label>
        <AutocompleteField
          id="camera-body"
          value={body}
          onChange={setBody}
          onCommit={setBody}
          pool={BODY_SUGGESTIONS}
          placeholder="e.g. Canon R6"
          sheetTitle="Choose your camera"
        />
      </div>

      {/* Lenses */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="camera-lens" className="text-sm font-medium text-text-muted">
          Lenses
        </label>
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
          pool={availableLenses}
          placeholder="e.g. RF 50mm f/1.8"
          sheetTitle="Choose a lens"
        />
      </div>

      {/* Flash — classes match TextField: same border, bg, height, focus treatment */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="camera-flash" className="text-sm font-medium text-text-muted">
          Flash
        </label>
        <select
          id="camera-flash"
          value={flash}
          onChange={(e) => setFlash(e.target.value as FlashValue)}
          className="min-h-[52px] rounded-[10px] border border-border-strong bg-surface px-4 text-base text-text outline-none transition-colors focus:border-accent"
        >
          <option value="">Not specified</option>
          <option value="none">None</option>
          <option value="speedlight">Speedlight</option>
          <option value="studio">Studio strobe</option>
        </select>
      </div>

      {/* Notes — multiline */}
      <TextField
        id="camera-notes"
        label="Notes"
        value={notes}
        onChange={setNotes}
        multiline
        rows={3}
        placeholder="e.g. I always shoot handheld in low light"
        helpText="Additional context the AI will factor into every recommendation."
      />

      {/* Disclosure */}
      <details className="text-sm text-text-dim">
        <summary className="cursor-pointer select-none transition-colors duration-[250ms] hover:text-text-muted">
          What is this used for?
        </summary>
        <p className="mt-2 pl-4">
          We send your gear to the AI on each request to keep recommendations executable on your kit.
        </p>
      </details>

      {saveError && (
        <p role="alert" className="text-sm text-danger">{saveError}</p>
      )}
    </div>
  );
}
