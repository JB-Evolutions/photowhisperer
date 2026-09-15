"use client";

import { useCallback, useState } from "react";
import PhotoOverlay from "@/components/app/PhotoOverlay";

// src is null while the photo is still being prepared for a sent message.
export type UserMessagePhoto = { src: string | null; name: string | null };

interface UserMessageProps {
  text: string;
  photo?: UserMessagePhoto | null;
}

export default function UserMessage({ text, photo }: UserMessageProps) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const closeOverlay = useCallback(() => setOverlayOpen(false), []);
  const alt = photo?.name ? `Your photo, ${photo.name}` : "Your photo";

  return (
    <div className="flex justify-end px-4 py-2">
      <div className="flex max-w-[75%] flex-col items-end gap-2">
        {photo && (
          photo.src ? (
            <button
              type="button"
              onClick={() => setOverlayOpen(true)}
              aria-label={`${alt} — open full size`}
              className="block overflow-hidden rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, not an optimisable asset */}
              <img src={photo.src} alt="" className="block h-auto w-full max-w-[200px]" />
            </button>
          ) : (
            <div aria-label={alt} role="img" className="pw-shimmer h-[150px] w-[200px] max-w-full rounded-[12px] bg-surface-3" />
          )
        )}
        {text && (
          <div className="rounded-2xl rounded-br-sm border border-border-accent bg-accent/10 px-4 py-3 text-sm leading-relaxed text-text">
            {text}
          </div>
        )}
      </div>
      {overlayOpen && photo?.src && <PhotoOverlay src={photo.src} alt={alt} onClose={closeOverlay} />}
    </div>
  );
}
