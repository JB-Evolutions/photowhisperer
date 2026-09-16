// Validate a corpus manifest before the eval harness ever reads it.
//
//   pnpm tsx scripts/corpus/validate.ts <manifest.json>
//
// Exits non-zero on any error, with a per-entry report. Warnings and the
// stratification summary always print and never fail the run on their own.
import { readFileSync } from "node:fs";
import {
  CONDITION_IDS,
  CONDITION_PLACEMENT,
  isLightConditionId,
  isSubjectAxis,
  referenceEv100,
  type CorpusDraftEntry,
  type CorpusManifest,
  type LightConditionId,
} from "./manifest";

// How far an entry's ground truth may sit from the table before the pair is
// worth a human look. Not an error: either the label is wrong or the table
// needs tuning, and only a person can say which.
export const EV_GAP_WARN_STOPS = 3;

// Below this, a condition cannot carry a shipping decision on its own.
export const UNDERPOWERED_N = 10;

export type Issue = {
  level: "error" | "warning";
  code: string;
  message: string;
};

export type EntryReport = {
  id: string;
  file: string;
  issues: Issue[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateEntry(entry: CorpusDraftEntry): Issue[] {
  const issues: Issue[] = [];
  const { condition, indoor, subjectLit, groundTruth } = entry;

  // 1. Condition must be a key of LIGHT_CONDITION_EV. Hard error — every EV
  //    derived against an unknown label is meaningless.
  if (!isLightConditionId(condition)) {
    issues.push({
      level: "error",
      code: "condition_unknown",
      message: condition === null
        ? "condition is unlabelled"
        : `condition ${JSON.stringify(condition)} is not a key of LIGHT_CONDITION_EV `
          + `(valid: ${CONDITION_IDS.join(", ")})`,
    });
  } else {
    // 2. subjectLit must agree with the condition's axis.
    const expectedSubjectLit = isSubjectAxis(condition);
    if (subjectLit !== expectedSubjectLit) {
      issues.push({
        level: "error",
        code: "subject_lit_mismatch",
        message: `subjectLit is ${JSON.stringify(subjectLit)} but ${condition} is on the `
          + `${expectedSubjectLit ? "subject-brightness" : "ambient"} axis, so it must be `
          + `${expectedSubjectLit}`,
      });
    }

    // 3. indoor must agree with where the condition can occur.
    const placement = CONDITION_PLACEMENT[condition];
    if (typeof indoor !== "boolean") {
      issues.push({
        level: "error",
        code: "indoor_unset",
        message: `indoor is ${JSON.stringify(indoor)}; it must be true or false`,
      });
    } else if (placement === "indoor" && !indoor) {
      issues.push({
        level: "error",
        code: "indoor_mismatch",
        message: `indoor is false but ${condition} is an indoor condition`,
      });
    } else if (placement === "outdoor" && indoor) {
      issues.push({
        level: "error",
        code: "indoor_mismatch",
        message: `indoor is true but ${condition} is an outdoor condition`,
      });
    }
  }

  // 4. Ground truth EV must exist. An entry without one teaches nothing.
  const ev100 = groundTruth?.ev100 ?? null;
  if (typeof ev100 !== "number" || !Number.isFinite(ev100)) {
    issues.push({
      level: "error",
      code: "ev100_absent",
      message: "groundTruth.ev100 is absent — meter this frame or drop it",
    });
  }

  // 5. An auto-judged frame that was judged off cannot also be high confidence:
  //    the judgement is the uncertain part.
  if (
    groundTruth?.source === "exif_auto_judged"
    && groundTruth.confidence === "high"
    && Math.abs(groundTruth.judgedOffStops ?? 0) > 0
  ) {
    issues.push({
      level: "error",
      code: "auto_judged_overconfident",
      message: `source is exif_auto_judged with judgedOffStops `
        + `${groundTruth.judgedOffStops}, so confidence cannot be "high" — `
        + `use "medium", or re-shoot as exif_manual`,
    });
  }

  // WARNING: ground truth far from the table. Naming both numbers is the point
  // — the gap is the signal.
  if (
    isLightConditionId(condition)
    && typeof ev100 === "number"
    && Number.isFinite(ev100)
  ) {
    const reference = referenceEv100(condition);
    const gap = ev100 - reference;
    if (Math.abs(gap) > EV_GAP_WARN_STOPS) {
      issues.push({
        level: "warning",
        code: "ev100_far_from_table",
        message: `ground truth ev100 ${ev100} vs LIGHT_CONDITION_EV[${condition}] `
          + `${reference} — ${gap > 0 ? "+" : ""}${Math.round(gap * 100) / 100} stops. `
          + `Either the label is wrong or the EV table needs tuning.`,
      });
    }
  }

  return issues;
}

export type Stratification = {
  perCondition: { condition: string; n: number; underpowered: boolean }[];
  indoor: number;
  outdoor: number;
  unset: number;
  total: number;
};

export function stratify(entries: readonly CorpusDraftEntry[]): Stratification {
  const counts = new Map<string, number>();
  for (const id of CONDITION_IDS) counts.set(id, 0);

  let indoor = 0;
  let outdoor = 0;
  let unset = 0;

  for (const entry of entries) {
    const key = isLightConditionId(entry.condition)
      ? (entry.condition as LightConditionId)
      : "<unlabelled>";
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (entry.indoor === true) indoor++;
    else if (entry.indoor === false) outdoor++;
    else unset++;
  }

  const perCondition = [...counts.entries()]
    .map(([condition, n]) => ({
      condition,
      n,
      underpowered: condition !== "<unlabelled>" && n < UNDERPOWERED_N,
    }))
    .sort((a, b) => b.n - a.n || (a.condition < b.condition ? -1 : 1));

  return { perCondition, indoor, outdoor, unset, total: entries.length };
}

export function validateManifest(manifest: CorpusManifest): EntryReport[] {
  return manifest.entries.map((entry) => ({
    id: entry.id,
    file: entry.file,
    issues: validateEntry(entry),
  }));
}

function readManifest(file: string): CorpusManifest {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed.entries)) {
    throw new Error(`${file}: not a corpus manifest (no "entries" array)`);
  }
  return parsed as unknown as CorpusManifest;
}

function main(): void {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: pnpm tsx scripts/corpus/validate.ts <manifest.json>");
    process.exitCode = 1;
    return;
  }

  const manifest = readManifest(file);
  const reports = validateManifest(manifest);

  let errors = 0;
  let warnings = 0;

  for (const report of reports) {
    if (report.issues.length === 0) continue;
    console.log(`\n${report.file}  [${report.id}]`);
    for (const issue of report.issues) {
      if (issue.level === "error") errors++;
      else warnings++;
      console.log(`  ${issue.level.toUpperCase().padEnd(7)} ${issue.code}: ${issue.message}`);
    }
  }

  const strat = stratify(manifest.entries);
  console.log(`\nStratification (${strat.total} entries)`);
  console.log("  per condition:");
  for (const row of strat.perCondition) {
    // Conditions with no frames are summarised on their own line below rather
    // than padding the table with zeroes.
    if (row.n === 0) continue;
    const flag = row.underpowered ? `  UNDERPOWERED (n < ${UNDERPOWERED_N})` : "";
    console.log(`    ${row.condition.padEnd(18)} ${String(row.n).padStart(4)}${flag}`);
  }
  console.log(`  indoor/outdoor: ${strat.indoor} indoor / ${strat.outdoor} outdoor`
    + (strat.unset > 0 ? ` / ${strat.unset} unset` : ""));

  const underpowered = strat.perCondition.filter((r) => r.underpowered && r.n > 0);
  if (underpowered.length > 0) {
    console.log(`  ${underpowered.length} condition(s) below n=${UNDERPOWERED_N} — `
      + "not enough to carry a shipping decision on their own.");
  }
  const empty = strat.perCondition.filter((r) => r.n === 0);
  if (empty.length > 0) {
    console.log(`  ${empty.length} condition(s) with no frames at all: `
      + `${empty.map((r) => r.condition).join(", ")}`);
  }

  console.log(`\n${errors} error(s), ${warnings} warning(s) across ${reports.length} entries.`);
  if (errors > 0) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("validate.ts")) {
  try {
    main();
  } catch (err) {
    console.error(`validate failed: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
