"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { IMAGE_ACCEPT } from "@/lib/image/limits";
import { isOnline } from "@/lib/image/composer";

// ─── ACTION SHEET ORDER ────────────────────────────────────────────────
// The order the photo sources appear in the sheet. Change it here only.
//
// Library first, deliberately. On iOS a capture="environment" input strips EXIF
// from the photo it returns, whatever the accept value and whatever the camera
// format setting — there is no workaround. A library photo keeps its exposure
// metadata and resolves at tier 1; a captured one has nothing to measure and
// falls to tier 2/3. Leading with the library steers people to the path that
// produces the better answer.
export const PHOTO_SOURCE_ORDER = ["library", "camera"] as const;
// ───────────────────────────────────────────────────────────────────────

type PhotoSource = (typeof PHOTO_SOURCE_ORDER)[number];

const SOURCE_LABELS: Record<PhotoSource, string> = {
  camera: "Take a photo",
  library: "Choose from library",
};

// Only the camera row carries a hint, and only because the EXIF strip described
// above has no workaround we can apply for the user — the best we can do is say
// out loud what produces a better reading. Guidance, not a warning: a capture
// still works, it just measures less.
export const SOURCE_HINTS: Partial<Record<PhotoSource, string>> = {
  camera: "For the most accurate reading, shoot in your Camera app and pick it from your library.",
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]";

export interface PhotoPickerHandle {
  openSheet: () => void;
}

interface PhotoPickerProps {
  disabled?: boolean;
  // Called synchronously before a picker opens — iOS may relaunch the PWA.
  onBeforeOpen: () => void;
  onFile: (file: File) => void;
  onOffline: () => void;
}

function SourceIcon({ source }: { source: PhotoSource }) {
  return source === "camera" ? (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 text-text-muted">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 text-text-muted">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

const PhotoPicker = forwardRef<PhotoPickerHandle, PhotoPickerProps>(function PhotoPicker(
  { disabled = false, onBeforeOpen, onFile, onOffline },
  ref,
) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // The mobile sheet is position:fixed, which resolves against the layout
  // viewport — unchanged by the keyboard — so it would otherwise open behind it.
  const { bottomInset } = useVisualViewport();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  function openSheet() {
    if (disabled) return;
    if (!isOnline()) {
      onOffline();
      return;
    }
    setSheetOpen(true);
  }

  useImperativeHandle(ref, () => ({ openSheet }));

  function closeSheet(returnFocus: boolean) {
    setSheetOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  useEffect(() => {
    if (!sheetOpen) return;
    sheetRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (sheetRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setSheetOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [sheetOpen]);

  function openSource(source: PhotoSource) {
    setSheetOpen(false);
    if (!isOnline()) {
      onOffline();
      return;
    }
    onBeforeOpen();
    (source === "camera" ? cameraInputRef : libraryInputRef).current?.click();
  }

  // A focused file input activated from the keyboard opens the picker
  // without going through openSource.
  function handleInputClick(e: MouseEvent<HTMLInputElement>) {
    if (!isOnline()) {
      e.preventDefault();
      onOffline();
      return;
    }
    onBeforeOpen();
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so choosing the same file again still fires change.
    e.target.value = "";
    if (!file) return;
    if (!isOnline()) {
      onOffline();
      return;
    }
    onFile(file);
  }

  function handleMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeSheet(true);
      return;
    }
    if (e.key === "Tab") {
      closeSheet(false);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const i = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    items[(i + step + items.length) % items.length]?.focus();
  }

  return (
    <div className="relative flex-shrink-0 self-center">
      <input
        ref={cameraInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        capture="environment"
        aria-label="Take a photo"
        disabled={disabled}
        onClick={handleInputClick}
        onChange={handleChange}
        className="peer/camera sr-only"
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        aria-label="Choose a photo from your library"
        disabled={disabled}
        onClick={handleInputClick}
        onChange={handleChange}
        className="peer/library sr-only"
      />
      <button
        ref={buttonRef}
        type="button"
        aria-label="Add a photo"
        aria-haspopup="menu"
        aria-expanded={sheetOpen}
        disabled={disabled}
        onClick={() => (sheetOpen ? closeSheet(false) : openSheet())}
        className={[
          "pw-pressable flex h-11 w-11 items-center justify-center rounded-xl text-text-muted",
          "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-surface-2 hover:text-text",
          "disabled:cursor-not-allowed disabled:opacity-40",
          focusRing,
          "peer-focus-visible/camera:ring-2 peer-focus-visible/camera:ring-[var(--border-accent)]",
          "peer-focus-visible/library:ring-2 peer-focus-visible/library:ring-[var(--border-accent)]",
        ].join(" ")}
      >
        <SourceIcon source="camera" />
      </button>

      {sheetOpen && (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-40 bg-bg/60 md:hidden" />
          <div
            ref={sheetRef}
            role="menu"
            aria-label="Add a photo"
            onKeyDown={handleMenuKeyDown}
            /* The inset rides in a custom property rather than an inline
               `bottom` so the md: variant can still take over on desktop,
               where the sheet is absolutely positioned above the trigger and
               the visual viewport is irrelevant. It is 0px on browsers without
               visualViewport, which is the old bottom-0 behaviour exactly. */
            style={{ "--pw-vv-bottom": `${bottomInset}px` } as CSSProperties}
            className={[
              "pw-expand-in fixed inset-x-0 bottom-[var(--pw-vv-bottom,0px)] z-50 flex flex-col gap-1 rounded-t-2xl border-t border-border bg-surface p-2",
              "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
              "md:absolute md:inset-x-auto md:bottom-full md:left-0 md:mb-2 md:w-[240px] md:rounded-2xl md:border md:pb-2",
            ].join(" ")}
          >
            {PHOTO_SOURCE_ORDER.map((source) => (
              <button
                key={source}
                type="button"
                role="menuitem"
                onClick={() => openSource(source)}
                className={[
                  "pw-pressable flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-left text-base text-text",
                  "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-surface-2",
                  focusRing,
                ].join(" ")}
              >
                <SourceIcon source={source} />
                <span className="flex min-w-0 flex-col">
                  {SOURCE_LABELS[source]}
                  {SOURCE_HINTS[source] ? (
                    <span className="mt-0.5 text-xs leading-snug text-text-muted">{SOURCE_HINTS[source]}</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

export default PhotoPicker;
