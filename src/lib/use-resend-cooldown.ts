"use client";

import { useEffect, useRef, useState } from "react";

const COOLDOWN_SECONDS = 30;
const STORAGE_PREFIX = "pw-resend-cooldown:";

function readRemainingSeconds(key: string): number {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return 0;
    const endsAt = Number(raw);
    const remaining = Math.ceil((endsAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  } catch {
    return 0;
  }
}

// key scopes the cooldown to a specific email/route so a refresh resumes the
// countdown instead of silently resetting Supabase's own rate limit window.
export function useResendCooldown(key: string) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function tick(key: string) {
    const remaining = readRemainingSeconds(key);
    setSecondsLeft(remaining);
    if (remaining <= 0) {
      clearTimer();
      try {
        sessionStorage.removeItem(STORAGE_PREFIX + key);
      } catch {}
    }
  }

  useEffect(() => {
    tick(key);
    intervalRef.current = setInterval(() => tick(key), 1000);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function start() {
    clearTimer();
    try {
      sessionStorage.setItem(
        STORAGE_PREFIX + key,
        String(Date.now() + COOLDOWN_SECONDS * 1000)
      );
    } catch {}
    tick(key);
    intervalRef.current = setInterval(() => tick(key), 1000);
  }

  const isCoolingDown = secondsLeft > 0;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const label = isCoolingDown
    ? `Resend in ${minutes}:${seconds.toString().padStart(2, "0")}`
    : null;

  return { isCoolingDown, secondsLeft, label, start };
}
