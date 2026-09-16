// Schema surface of the corpus manifest, for consumers outside this folder.
//
// The definitions live in ./manifest.ts and are only re-exported here — this
// file declares nothing of its own, so there is still exactly one definition of
// CorpusEntry. It exists because the eval harness imports the schema as
// `scripts/corpus/types`, and the schema is what it should depend on, not the
// ingest tooling sitting next to it.
export type {
  CorpusEntry,
  CorpusDraftEntry,
  CorpusManifest,
  CorpusExif,
  GroundTruthSource,
  GroundTruthConfidence,
  LightConditionId,
  NeedsLabel,
  ConditionAxis,
  ConditionPlacement,
} from "./manifest";
