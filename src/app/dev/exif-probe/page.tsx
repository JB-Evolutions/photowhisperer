"use client";

// Throwaway measurement tool: how each file-input variant behaves on real
// devices (especially iOS standalone PWAs). Delete once the findings are in.
import { useState, useSyncExternalStore, type ChangeEvent } from "react";
import exifr from "exifr";
import { EXIFR_OPTIONS } from "@/lib/image/exif";
import { exifExposureFromRaw } from "@/lib/exposure/exif";
import { evFromExif } from "@/lib/exposure/ev";
import { isHdrSuspect } from "@/lib/exposure/hdr";
import type { RawExif } from "@/lib/exposure/types";

type InputVariant = {
  id: "A" | "B" | "C" | "D";
  label: string;
  accept?: string;
  capture?: "environment";
};

const VARIANTS: InputVariant[] = [
  { id: "A", label: "Take photo (capture attr)", accept: "image/*", capture: "environment" },
  { id: "B", label: "Library (accept image/*)", accept: "image/*" },
  { id: "C", label: "Library (explicit types)", accept: "image/jpeg,image/png,image/webp" },
  { id: "D", label: "Library (unrestricted)" },
];

const EXIF_FIELDS = [
  "FNumber",
  "ExposureTime",
  "ISO",
  "ISOSpeedRatings",
  "ExposureCompensation",
  "ExposureBiasValue",
  "Orientation",
  "CustomRendered",
  "SceneCaptureType",
  "CompositeImage",
  "Make",
  "Model",
] as const;

type ProbeResult = {
  input: InputVariant["id"];
  probedAt: string;
  file: { name: string; type: string; size: number };
  exifParsed: boolean;
  exifError: string | null;
  fields: Record<string, unknown>;
  ev: string | null;
  evNote: string | null;
  hdrSuspect: boolean;
  bitmapOk: boolean;
  bitmapError: string | null;
  width: number | null;
  height: number | null;
};

type Diagnostics = {
  userAgent: string;
  displayModeStandalone: boolean;
  navigatorStandalone: boolean | undefined;
};

let diagnosticsCache: Diagnostics | null = null;
function readDiagnostics(): Diagnostics {
  if (!diagnosticsCache) {
    const nav = navigator as Navigator & { standalone?: boolean };
    diagnosticsCache = {
      userAgent: nav.userAgent,
      displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
      navigatorStandalone: nav.standalone,
    };
  }
  return diagnosticsCache;
}
const noopSubscribe = () => () => {};

function errorMessage(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

async function probeFile(file: File, input: InputVariant["id"]): Promise<ProbeResult> {
  // EXIF first, from the original File — nothing has touched the pixels yet.
  let raw: RawExif | null = null;
  let exifError: string | null = null;
  try {
    const out: unknown = await exifr.parse(file, EXIFR_OPTIONS);
    if (out && typeof out === "object" && Object.keys(out).length > 0) raw = out as RawExif;
  } catch (err) {
    exifError = errorMessage(err);
  }

  const fields: Record<string, unknown> = {};
  for (const key of EXIF_FIELDS) fields[key] = raw?.[key];

  let ev: string | null = null;
  let evNote: string | null = null;
  const exposure = exifExposureFromRaw(raw);
  if (exposure) {
    try {
      ev = evFromExif(exposure).toFixed(2);
    } catch (err) {
      evNote = errorMessage(err);
    }
  } else {
    evNote = "FNumber / ExposureTime / ISO incomplete";
  }

  let bitmapOk = false;
  let bitmapError: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    bitmapOk = true;
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close();
  } catch (err) {
    bitmapError = errorMessage(err);
  }

  return {
    input,
    probedAt: new Date().toISOString(),
    file: { name: file.name, type: file.type, size: file.size },
    exifParsed: raw !== null,
    exifError,
    fields,
    ev,
    evNote,
    hdrSuspect: isHdrSuspect(raw),
    bitmapOk,
    bitmapError,
    width,
    height,
  };
}

function formatValue(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "number" && value > 0 && value < 1) return `${value} (1/${Math.round(1 / value)})`;
  return JSON.stringify(value);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-44 shrink-0 text-text-dim">{label}</dt>
      <dd className="min-w-0 break-all text-text">{value}</dd>
    </div>
  );
}

function ResultCard({ result }: { result: ProbeResult }) {
  const variant = VARIANTS.find((v) => v.id === result.input);
  return (
    <article className="rounded-xl border border-border bg-surface p-4 font-mono text-xs leading-relaxed">
      <p className="mb-3 text-accent">
        {result.input}) {variant?.label}
      </p>
      <dl className="flex flex-col gap-1">
        <Row label="file.name" value={result.file.name} />
        <Row label="file.type" value={result.file.type || "(empty)"} />
        <Row label="file.size" value={`${result.file.size} bytes`} />
        <Row label="exifr parsed anything" value={result.exifParsed ? "yes" : "no"} />
        {result.exifError && <Row label="exifr error" value={result.exifError} />}
        {EXIF_FIELDS.map((key) => (
          <Row key={key} label={key} value={formatValue(result.fields[key])} />
        ))}
        <Row label="EV (settings, ISO 100)" value={result.ev ?? `— (${result.evNote})`} />
        <Row label="isHdrSuspect" value={String(result.hdrSuspect)} />
        <Row label="createImageBitmap" value={result.bitmapOk ? "ok" : `failed — ${result.bitmapError}`} />
        <Row
          label="dimensions (from-image)"
          value={result.width !== null ? `${result.width} × ${result.height}` : "—"}
        />
      </dl>
    </article>
  );
}

export default function ExifProbePage() {
  const diagnostics = useSyncExternalStore(noopSubscribe, readDiagnostics, () => null);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [pending, setPending] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleChange(variant: InputVariant, event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = ""; // allow re-selecting the same file
    for (const file of files) {
      setPending((n) => n + 1);
      try {
        const result = await probeFile(file, variant.id);
        setResults((prev) => [result, ...prev]);
      } finally {
        setPending((n) => n - 1);
      }
    }
  }

  const json = JSON.stringify({ diagnostics, results }, null, 2);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(json);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="font-display text-2xl text-text">EXIF probe</h1>

      <section className="rounded-xl border border-border bg-surface-2 p-4 font-mono text-xs leading-relaxed">
        {diagnostics ? (
          <dl className="flex flex-col gap-1">
            <Row label="navigator.userAgent" value={diagnostics.userAgent} />
            <Row label="display-mode: standalone" value={String(diagnostics.displayModeStandalone)} />
            <Row label="navigator.standalone" value={String(diagnostics.navigatorStandalone)} />
          </dl>
        ) : (
          <p className="text-text-dim">Reading diagnostics…</p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        {VARIANTS.map((variant) => (
          <label key={variant.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
            <span className="text-sm text-text">
              {variant.id}) {variant.label}
            </span>
            <span className="font-mono text-xs text-text-dim">
              accept={variant.accept ? `"${variant.accept}"` : "(none)"}
              {variant.capture ? ` capture="${variant.capture}"` : ""}
            </span>
            <input
              type="file"
              accept={variant.accept}
              capture={variant.capture}
              onChange={(e) => handleChange(variant, e)}
              className="text-base text-text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-bg"
            />
          </label>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={copyAll}
          disabled={results.length === 0}
          className="rounded-lg border border-border-accent bg-surface-2 px-4 py-2 text-sm text-accent disabled:opacity-40"
        >
          Copy all results as JSON
        </button>
        {pending > 0 && <span className="text-sm text-text-dim">Probing…</span>}
        {copyState === "copied" && <span className="text-sm text-text-muted">Copied</span>}
      </div>

      {copyState === "failed" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-warning">Clipboard unavailable — select and copy manually:</p>
          <pre className="max-h-80 overflow-auto rounded-xl border border-border bg-surface p-4 font-mono text-xs text-text select-all">
            {json}
          </pre>
        </div>
      )}

      <section className="flex flex-col gap-4">
        {results.map((result) => (
          <ResultCard key={`${result.probedAt}-${result.file.name}`} result={result} />
        ))}
      </section>
    </main>
  );
}
