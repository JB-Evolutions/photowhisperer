"use client";

import { useState } from "react";
import Button from "@/components/shared/Button";

export default function RestoreButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRestore() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/restore", { method: "POST" });
      if (res.status === 403) {
        setError(
          "The recovery window has passed — your account can no longer be restored."
        );
        return;
      }
      if (!res.ok) {
        setError("Couldn't restore your account — try again.");
        return;
      }
      // Hard-nav so proxy re-evaluates with deleted_at now null and allows through.
      window.location.href = "/app";
    } catch {
      setError(
        "Couldn't reach the server — check your connection and try again."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="primary"
        onClick={handleRestore}
        pending={pending}
        pendingLabel="Restoring…"
        disabled={pending}
      >
        Recover my account
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
