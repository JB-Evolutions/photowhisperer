import type { ReactNode } from "react";

export default function PricingScrollTrack({ children }: { children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label="Pricing tiers"
      className="flex flex-col gap-6 pt-4 pb-2 md:grid md:grid-cols-3 md:gap-8 md:pt-0"
    >
      {children}
    </div>
  );
}
