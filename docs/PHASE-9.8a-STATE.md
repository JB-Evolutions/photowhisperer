# Phase 9.8a State Checkpoint

## DONE

- **FILE 1** (`42b1a96`): `SettingsRequestBody` exported from `src/lib/settings.ts`
- **FILE 2** (`e6f25a3`): `requestSettings` widened — `priorContext?` is 3rd param, `signal` stays last (4th). Body guard: `prior_context` only attached when `priorContext` provided AND `priorContext.assistant_summary` truthy. `SessionView.tsx` call site updated to `requestSettings(text, sessionId, undefined, controller.signal)` — FILE 3 replaces `undefined`.

## FILE 3 TODO — SessionView.tsx

### New refs (alongside lastConditions / inFlightConditions, lines 38–39)

```ts
const lastSceneSummary = useRef<string | null>(null);
const clarificationOriginRef = useRef<string | null>(null);
const pendingPriorContextRef = useRef<{ user_msg: string; assistant_summary: string } | null>(null);
```

### lastSceneSummary semantics
Set in `ok` branch only: `lastSceneSummary.current = result.scene_summary ?? null`

### clarificationOriginRef semantics
Anchors the scene that opened a clarification chain.
- Set to `text` ONLY when `clarificationOriginRef.current === null` on `clarification_required`
- Cleared (`= null`) in terminal block on `ok || error` ONLY
- NOT cleared on `invalid_input` or `rate_limited` (chain still live)

### pendingPriorContextRef semantics
- **Consumed + nulled** at TOP of `send()`, before `await`:
  ```ts
  const priorContext = pendingPriorContextRef.current;
  pendingPriorContextRef.current = null;
  ```
- **Armed AFTER await:**
  - `clarification_required` → `{ user_msg: clarificationOriginRef.current, assistant_summary: "Clarifying question I asked: " + result.question }`
  - Refine tap → `{ user_msg: lastConditions.current, assistant_summary: lastSceneSummary.current }` — only if `lastSceneSummary.current` non-null; if null, leave ref null (prior_context omitted by settingsClient guard)
- `send()` passes consumed value: `requestSettings(text, sessionId, priorContext ?? undefined, controller.signal)`

### Branch order after await (terminal clears)
```
ok     → set lastSceneSummary; terminal: clear clarificationOriginRef
error  → terminal: clear clarificationOriginRef
invalid_input → NO clear (chain live)
rate_limited  → early return (never reaches terminal block; chain live)
clarification_required → arm clarificationOriginRef (if null) + arm pendingPriorContextRef
```

## 3d — Composer reach (AppShell owns composerValue / composerRef)

- Extend `SessionViewHandle`: add `clearPendingRefinement: () => void`
- Add `onPreFillComposer?: (text: string) => void` to `SessionViewProps`
- AppShell wires: `onPreFillComposer={(text) => { setComposerValue(text); composerRef.current?.focus(); }}`
- AppShell adds: `useEffect(() => { if (!composerValue.startsWith("Same scene but ")) { sessionViewRef.current?.clearPendingRefinement(); } }, [composerValue])`
- Refine `onClick`: calls `onPreFillComposer?.("Same scene but ")` + arms `pendingPriorContextRef`. Does NOT send.

## Cap (arch §4.2)
Single-slot refs — overwritten each turn, never accumulate.

## Runtime checks (after tsc, before commit)
1. Network tab: Refine send → `conditions` = new text only; `prior_context` present with correct `user_msg` + `assistant_summary`
2. No `scene_summary` case: `prior_context` omitted entirely (not `assistant_summary: ""`)
3. Model output reflects refinement (context continuity end-to-end)
