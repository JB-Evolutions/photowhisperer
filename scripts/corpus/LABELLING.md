# Corpus labelling — field procedure

One page. Read it before the shoot, keep it open during it.

The corpus exists to answer one question: **does the app read the light
correctly?** Every frame needs a ground-truth scene EV at ISO 100 that was
arrived at *independently* of the code being tested.

## 1. What to shoot, and how

**Shoot these in MANUAL, with `source: "exif_manual"`:**

`moon_subject` · `fireworks` · `stage_lit` · `neon_signage` · strong backlight ·
snow

These are the hard cases, and they are hard for the same reason: the camera's
meter is wrong about them. Point a matrix meter at the moon and it exposes the
black sky; point it at snow and it renders it grey. If you let the camera choose,
the EXIF records the meter's mistake, not the light — and ground truth built from
that mistake cannot tell you whether the app got it right.

So: dial the exposure yourself, check the result on the back of the camera,
and set `source: "exif_manual"` on the entry. The settings in the EXIF are then
yours, deliberate, and worth trusting.

**Everything else: bulk-ingest and judge.** Shoot it however you normally would,
run `ingest.ts` over the folder, and judge each frame by eye (§3). Those entries
keep the default `source: "exif_auto_judged"`.

## 2. Mix: ~60 indoor / ~40 outdoor per 100 frames

Indoor is the only open question. The app already refuses to trust a scene-class
estimate indoors (`INDOOR_CONDITIONS` in `src/lib/exposure/ev.ts`) because
interiors span roughly EV 4–9 with nothing visible to tell them apart. That is
the range the corpus has to resolve, so it gets the bulk of the frames.

Outdoor needs only a baseline to compare against — daylight is well-behaved and
the table is already close. Forty frames is enough to prove nothing regressed.

Within the indoor 60, spread across `indoor_window`, `indoor_artificial`,
`indoor_dim` and `candlelit` rather than shooting sixty frames of one room.
`validate.ts` flags any condition with **n < 10** as underpowered, and a
condition below that line cannot carry a shipping decision on its own.

`candlelit` counts as indoor here, matching the app's own grouping. If you shoot
a candlelit outdoor table, note it in `notes` and expect `validate.ts` to
complain — that disagreement is worth a conversation, not a silent override.
`stage_lit` and `neon_signage` are accepted either way.

## 3. Judging `judgedOffStops`

On a **calibrated display**, not the camera's rear screen and not a phone.

`judgedOffStops` describes **the frame**, and it is **signed**:

| Value  | Meaning                          |
|--------|----------------------------------|
| `-1`   | frame is 1 stop **under**exposed |
| `-0.5` | half a stop under                |
| `0`    | correctly exposed                |
| `+0.5` | half a stop over                 |
| `+1`   | 1 stop **over**exposed           |

Those five values are the whole vocabulary. Do not write `-0.3` or `-1.25`; eye
judgement is not that precise and pretending otherwise puts false precision into
the ground truth.

**Discard anything worse than 2 stops off — do not label it.** Past two stops you
are no longer judging exposure, you are guessing at a rescue, and the guess will
be wrong in a way that quietly poisons the eval. Delete the frame and reshoot it.

If you genuinely cannot call it, use `confidence: "low"` rather than inventing a
number — but a corpus full of `low` is a corpus that proves nothing.

## 4. Confidence

- `high` — you shot it in manual and you know what the light was, or you metered
  it. An `exif_auto_judged` entry with a non-zero `judgedOffStops` may **not** be
  `high`; the judgement is the uncertain part, and `validate.ts` errors on it.
- `medium` — the ingest default. Auto-exposed, judged by eye, looks right.
- `low` — something is off and you could not resolve it. Expect it to be excluded.

## 5. Exposure compensation

If you dial in exposure compensation, that is fine — **do not adjust for it when
labelling**. The bias is already baked into the aperture, shutter and ISO the
camera actually used. It is read and recorded on the entry for audit, and never
added to the EV. Judge the frame you see; the number takes care of itself.

## 6. The loop

```sh
pnpm tsx scripts/corpus/ingest.ts   <photo-dir> --out scripts/corpus/manifest.json
# …label the entries by hand…
pnpm tsx scripts/corpus/validate.ts scripts/corpus/manifest.json
```

`--out` defaults to `<photo-dir>/manifest.json`, but pass it explicitly as above:
`scripts/corpus/manifest.json` is where the eval harness looks by default. **Commit
the manifest, not the photos** — the manifest is the artefact the evals read, and
`file` paths in it are relative to the photo directory, which stays wherever you
keep it.

Re-run `ingest.ts` as often as you like. It is keyed on the SHA-256 of the file
bytes, so it **preserves every hand-entered field** on entries it has seen before
and refreshes only the EXIF block. Renaming or moving a photo keeps its labels.
Adding photos to the folder adds entries. **Labelling work is never destroyed.**

Frames whose aperture/shutter/ISO could not all be read land in `needs_labels`
with a null `ev100`. They need a meter reading — or deleting.

`validate.ts` exits non-zero on any error and prints a stratification summary
every run. Two things in its output are worth reading carefully:

- **`ev100_far_from_table` warnings.** The entry's ground truth is more than 3
  stops from `LIGHT_CONDITION_EV[condition]`. It names both numbers. That gap
  means either the label is wrong or the EV table needs tuning — decide which,
  every time. Do not let them accumulate unread.

  **On a real frame this warning is always a real signal — never write one off.**
  A nine-stop gap on a photograph is telling you something loud: most often the
  condition is mislabelled (an `indoor_dim` frame tagged `stage_lit` will read
  about nine stops low), and occasionally that the table's entry for that
  condition is wrong. Both are worth knowing. Chase every one to a conclusion and
  put the conclusion in `notes`.

  The one case where the warning means nothing is the synthetic JPEGs in
  `__tests__/exif-fixture.ts`, whose EXIF is hand-assembled from arbitrary
  numbers to exercise the parser. Those bytes exist only inside the test suite
  and never enter a manifest. **If you are looking at a warning from
  `validate.ts` on the corpus, you are looking at a real photograph.**

- **`UNDERPOWERED` conditions.** Shoot more, or accept that the app's behaviour
  in that condition is untested.

## 7. Ground truth is computed independently, on purpose

`scripts/corpus/ev.ts` derives EV from first principles and imports **nothing**
from `src/lib/exposure`. That is deliberate. `evFromExif` and `resolveSceneEv`
are the code the eval harness exists to test; if ground truth were computed with
them, the harness would agree with them by construction and an error in either
would be invisible. Never "simplify" `ev.ts` by importing the app's version.

`LIGHT_CONDITION_EV` in `src/lib/contract/types.ts` stays the single source of
truth for what conditions exist and what EV each sits at. Nothing under
`scripts/corpus/` restates an EV number.
