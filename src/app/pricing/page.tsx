import type { Metadata } from "next";
import { headers } from "next/headers";
import Nav from "@/components/shared/Nav";
import MarketingShell from "@/components/marketing/MarketingShell";
import PricingTiers from "@/components/marketing/PricingTiers";
import FaqAccordion, { type FaqItem } from "@/components/marketing/FaqAccordion";
import JsonLd from "@/components/seo/JsonLd";
import { TIER_DISPLAY_NAMES, TIER_HISTORY_LIMITS, TIER_LIMITS, type Tier } from "@/lib/quota";
import { marketingSocial } from "@/lib/seo";

const TITLE = "Camera Settings Pricing Plans | PhotoWhisperer";
const DESCRIPTION =
  "Compare PhotoWhisperer plans. From 5 free camera setting requests a month to 2,000, pick the tier that matches how often you shoot.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...marketingSocial({
    title: TITLE,
    description: DESCRIPTION,
    path: "/pricing",
  }),
};

type Cell = "check" | "dash" | string;

interface MatrixRow {
  label: string;
  cells: [Cell, Cell, Cell];
}

const TIER_ORDER: Tier[] = ["snapshot", "portrait", "studio"];

function formatHistory(tier: Tier): string {
  const limit = TIER_HISTORY_LIMITS[tier];
  return limit === -1 ? "Unlimited" : `${limit} sessions`;
}

const MATRIX_ROWS: MatrixRow[] = [
  {
    label: "Monthly requests",
    cells: TIER_ORDER.map((tier) => TIER_LIMITS[tier].toLocaleString()) as [
      string,
      string,
      string,
    ],
  },
  {
    label: "Request rollover",
    cells: ["dash", "dash", "dash"],
  },
  {
    label: "History",
    cells: TIER_ORDER.map((tier) => formatHistory(tier)) as [
      string,
      string,
      string,
    ],
  },
  {
    label: "Camera profile editing",
    cells: ["check", "check", "check"],
  },
  // Priority support row intentionally omitted — no support tier exists yet;
  // add when there's a real policy behind it.
  {
    label: "Extra-credit packs",
    cells: ["check", "check", "check"],
  },
];

const PRICING_FAQ_ITEMS: FaqItem[] = [
  {
    question: "What happens if I run out?",
    answer:
      "Buy extra credits anytime, or upgrade your plan for a higher monthly limit.",
  },
  {
    question: "Can I downgrade?",
    answer:
      "Yes, via the customer portal. Your downgrade takes effect at the end of your current billing period.",
  },
];

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mx-auto text-accent"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function MatrixCell({ value }: { value: Cell }) {
  if (value === "check") return <CheckIcon />;
  if (value === "dash") return <span className="text-text-dim">—</span>;
  return <span className="font-mono text-text">{value}</span>;
}

const faqPageSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: PRICING_FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default async function PricingPage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <>
      <JsonLd data={faqPageSchema} nonce={nonce} />
      <Nav />
      <MarketingShell>
        <main>
          <PricingTiers />

          <section className="px-8 py-24">
            <div className="mx-auto max-w-[1280px]">
              <div className="overflow-x-auto rounded-[14px] border border-border">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-4 text-left font-body text-xs uppercase tracking-[0.08em] text-text-dim">
                        Feature
                      </th>
                      {TIER_ORDER.map((tier) => (
                        <th
                          key={tier}
                          className="px-6 py-4 text-center font-display text-base text-text"
                        >
                          {TIER_DISPLAY_NAMES[tier]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MATRIX_ROWS.map((row, rowIndex) => (
                      <tr
                        key={row.label}
                        className={
                          rowIndex % 2 === 1 ? "bg-surface" : undefined
                        }
                      >
                        <td className="px-6 py-4 text-text-muted">
                          {row.label}
                        </td>
                        {row.cells.map((cell, cellIndex) => (
                          <td key={cellIndex} className="px-6 py-4 text-center">
                            <MatrixCell value={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <FaqAccordion items={PRICING_FAQ_ITEMS} />
        </main>
      </MarketingShell>
    </>
  );
}
