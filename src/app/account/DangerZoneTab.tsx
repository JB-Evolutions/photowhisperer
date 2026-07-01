"use client";

import { useState } from "react";
import Button from "@/components/shared/Button";
import { useToastContext } from "@/components/app/useToast";

export default function DangerZoneTab() {
  const showToast = useToastContext();
  const [exportPending, setExportPending] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExportPending(true);
    setExportError(null);
    try {
      const res = await fetch("/api/account/export");
      if (res.status === 401) {
        setExportError("Your session expired — refresh the page and try again.");
        return;
      }
      if (!res.ok) {
        setExportError("Couldn't prepare your export — try again.");
        return;
      }
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

  return (
    <div className="flex max-w-lg flex-col gap-8 px-6 py-8">
      <h2 className="font-display text-base text-text">Danger Zone</h2>

      <section className="flex flex-col gap-4 rounded-[12px] border border-warning p-6">
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
          {exportError && (
            <p role="alert" className="text-sm text-danger">{exportError}</p>
          )}
        </div>
      </section>

      {/* Delete account — 9.9b-6 */}
    </div>
  );
}
