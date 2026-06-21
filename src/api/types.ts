// Per arch-spec-v3.1.md §2.5. Inputs into the classifier — not part of the
// OrchestrateResult contract.

export type CameraProfile = {
  body: string | null;
  lenses: string[] | null;
  flash: string | null;
  notes: string | null;
};

export type PriorContext = {
  user_msg: string;
  assistant_summary: string;
};
