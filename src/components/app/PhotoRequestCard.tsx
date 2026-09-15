"use client";

// Photo-specific failures that never charged anything: the body was too large,
// the account lacked the units a photo request needs, or the photo could not
// be prepared. Inline in the thread — never a toast or modal.
import Button from "@/components/shared/Button";
import { ATTACHMENT_ERROR_COPY, type ThreadResponse } from "@/components/app/photoAttachment";

export type PhotoRequestResponse = Extract<
  ThreadResponse,
  { status: "payload_too_large" | "quota_exhausted" | "photo_failed" }
>;

function requests(n: number): string {
  return `${n} request${n === 1 ? "" : "s"}`;
}

function copyFor(response: PhotoRequestResponse): { heading: string; body: string } {
  switch (response.status) {
    case "payload_too_large":
      return {
        heading: "That photo was too large to send",
        body: "Nothing was used. Send your description on its own, or try a smaller photo.",
      };
    case "quota_exhausted":
      return {
        heading: "Not enough left for a photo",
        body: `Sending a photo counts as ${requests(response.units_required)}, and you have ${response.units_available} left — so nothing was used. You can still send your description without the photo.`,
      };
    case "photo_failed":
      return {
        heading: "Couldn't read that photo",
        body: ATTACHMENT_ERROR_COPY[response.kind],
      };
  }
}

interface PhotoRequestCardProps {
  response: PhotoRequestResponse;
  // Omitted when there is no text to send on its own.
  onSendWithoutPhoto?: () => void;
  onTryAnotherPhoto?: () => void;
}

export default function PhotoRequestCard({ response, onSendWithoutPhoto, onTryAnotherPhoto }: PhotoRequestCardProps) {
  const { heading, body } = copyFor(response);
  // Another photo would need the same units, so don't offer it for quota.
  const offerAnotherPhoto = onTryAnotherPhoto && response.status !== "quota_exhausted";

  return (
    <div className="rounded-xl border border-warning bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 text-warning">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        <span className="text-sm font-medium text-text">{heading}</span>
      </div>
      <p className="text-sm leading-relaxed text-text-muted">{body}</p>
      {(onSendWithoutPhoto || offerAnotherPhoto) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onSendWithoutPhoto && (
            <Button variant="outline" onClick={onSendWithoutPhoto}>
              Send without the photo
            </Button>
          )}
          {offerAnotherPhoto && (
            <Button variant="ghost" onClick={onTryAnotherPhoto}>
              Try another photo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
