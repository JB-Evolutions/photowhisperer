import type { ReactNode } from "react";
import Spotlight from "@/components/marketing/Spotlight";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import "@/components/marketing/marketing.css";

export default function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="marketing-shell">
      <Spotlight />
      {children}
      <MarketingFooter />
    </div>
  );
}
