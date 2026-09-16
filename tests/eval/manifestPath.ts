// Where the synthetic manifest lives, resolved from this file rather than the
// process cwd so the tests run the same from the repo root or an IDE.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseManifest } from "../../scripts/eval-exposure";
import type { CorpusEntry } from "../../scripts/corpus/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURE_MANIFEST_PATH = path.join(HERE, "fixtures", "manifest.json");

export function loadFixtureManifest(): CorpusEntry[] {
  return parseManifest(JSON.parse(readFileSync(FIXTURE_MANIFEST_PATH, "utf8")));
}
