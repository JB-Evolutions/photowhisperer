// iOS has historically killed and relaunched standalone PWAs when the file
// picker opens — persist the composer before opening it, restore on mount.
export const COMPOSER_DRAFT_KEY = "pw-composer-draft";

export type ComposerDraft = {
  text: string;
  session_id: string | null;
};

export function saveComposerDraft(draft: ComposerDraft): void {
  try {
    sessionStorage.setItem(COMPOSER_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage can throw in private-browsing modes — losing a draft must never block the picker.
  }
}

export function restoreComposerDraft(): ComposerDraft | null {
  try {
    const stored = sessionStorage.getItem(COMPOSER_DRAFT_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return null;
    const { text, session_id } = parsed as Record<string, unknown>;
    if (typeof text !== "string") return null;
    return { text, session_id: typeof session_id === "string" ? session_id : null };
  } catch {
    return null;
  }
}

export function clearComposerDraft(): void {
  try {
    sessionStorage.removeItem(COMPOSER_DRAFT_KEY);
  } catch {
    // See saveComposerDraft.
  }
}

// Lets the UI block attachment up front instead of hanging until the 30s abort.
export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}
