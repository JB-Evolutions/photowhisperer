"use client";

import { useState, useEffect, useRef } from "react";
import Button from "@/components/shared/Button";
import { useToastContext } from "@/components/app/useToast";

// ─── DeleteModal ──────────────────────────────────────────────────────────────

function DeleteModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [confirmText, setConfirmText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { dialogRef.current?.focus(); }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { if (!pending) onClose(); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  // Exact match, case-sensitive, no trim — "delete" and "DELETE " are both rejected.
  const confirmEnabled = confirmText === "DELETE";

  async function handleDelete() {
    if (!confirmEnabled || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        setError(body.message ?? "Couldn't delete your account — try again.");
        return;
      }
      // Hard-nav: server-side signOut already happened in the route;
      // router.push would race with the /account proxy redirect.
      window.location.href = "/auth/signin?deleted=true";
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-account-heading"
        tabIndex={-1}
        className="w-full max-w-sm rounded-[16px] border border-border bg-surface p-6 shadow-xl outline-none"
      >
        <h2 id="delete-account-heading" className="font-display text-lg text-text">
          Delete account
        </h2>
        <div className="mt-2 flex flex-col gap-2 text-sm text-text-muted">
          <p>
            Type{" "}
            <span className="font-mono font-semibold text-text">DELETE</span>{" "}
            to confirm — this is permanent after a 7-day grace period.
          </p>
          <p>
            Your account will be signed out immediately. Sign back in within 7 days
            to recover your account and all your data.
          </p>
        </div>
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); void handleDelete(); }}
          className="mt-4 flex flex-col gap-4"
        >
          <input
            type="text"
            aria-label="Type DELETE to confirm"
            value={confirmText}
            onChange={(e) => { setConfirmText(e.target.value); setError(null); }}
            autoComplete="off"
            spellCheck={false}
            placeholder="DELETE"
            className="min-h-[52px] w-full rounded-[10px] border border-border-strong bg-surface px-4 font-mono text-base text-text outline-none transition-colors focus:border-accent"
          />
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" type="button" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="outline"
              className="!border-danger !text-danger hover:!bg-danger/5"
              disabled={!confirmEnabled || pending}
              pending={pending}
              pendingLabel="Deleting…"
            >
              Delete account
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── DangerZoneTab ────────────────────────────────────────────────────────────

export default function DangerZoneTab() {
  const showToast = useToastContext();
  const [exportPending, setExportPending] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  async function handleExport() {
    setExportPending(true);
    setExportError(null);
    try {
      const res = await fetch("/api/account/export");
      if (res.status === 401) { setExportError("Your session expired — refresh the page and try again."); return; }
      if (!res.ok) { setExportError("Couldn't prepare your export — try again."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "photowhisperer-data.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      showToast("Export downloaded");
    } catch {
      setExportError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setExportPending(false);
    }
  }

  function handleCloseDeleteModal() {
    setShowDeleteModal(false);
    deleteButtonRef.current?.focus();
  }

  return (
    <>
      {showDeleteModal && <DeleteModal onClose={handleCloseDeleteModal} />}

      <div className="flex max-w-lg flex-col gap-8 px-6 py-8">
        <h2 className="font-display text-base text-text">Danger Zone</h2>

        <section className="flex flex-col gap-4 rounded-[12px] border border-warning p-6">

          {/* Export */}
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-text">Export my data</h3>
            <p className="text-sm text-text-muted">
              Download a JSON file with your profile, preferences, camera setup, and all your sessions.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <div>
              <Button
                variant="outline"
                onClick={handleExport}
                pending={exportPending}
                pendingLabel="Preparing…"
                disabled={exportPending}
              >
                Export my data
              </Button>
            </div>
            {exportError && <p role="alert" className="text-sm text-danger">{exportError}</p>}
          </div>

          {/* Delete */}
          <div className="border-t border-border pt-4 flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-text">Delete account</h3>
            <p className="text-sm text-text-muted">
              Permanently delete your account and all your data. You&rsquo;ll have a 7-day grace
              period to recover it before deletion is final.
            </p>
          </div>
          <div>
            <Button
              ref={deleteButtonRef}
              variant="outline"
              className="!border-danger !text-danger hover:!bg-danger/5"
              onClick={() => setShowDeleteModal(true)}
            >
              Delete account
            </Button>
          </div>

        </section>
      </div>
    </>
  );
}
