import Button from "@/components/shared/Button";
import { getMarketingAuthState } from "@/lib/auth-state";
import { TIER_LIMITS, TIER_PRICES_USD, type Tier } from "@/lib/quota";

interface TierCardConfig {
  tier: Tier;
  name: string;
  headline: string;
  sub?: string;
  cta: string;
  featured?: boolean;
}

const TIERS: TierCardConfig[] = [
  {
    tier: "snapshot",
    name: "Snapshot",
    headline: `Try ${TIER_LIMITS.snapshot} free settings/month`,
    cta: "Start free",
  },
  {
    tier: "portrait",
    name: "Portrait",
    headline: `${TIER_LIMITS.portrait} settings/month`,
    cta: "Get Portrait",
    featured: true,
  },
  {
    tier: "studio",
    name: "Studio",
    headline: "Unlimited settings",
    sub: "2,000/mo, then extra credits",
    cta: "Get Studio",
  },
];

function signupHref(tier: Tier): string {
  return tier === "snapshot" ? "/signup" : `/signup?tier=${tier}`;
}

function CurrentPlanBadge() {
  return (
    <span
      aria-disabled="true"
      className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-[10px] border border-border-strong bg-transparent px-5 py-2.5 text-sm font-medium tracking-[0.01em] text-text-dim"
    >
      Current plan
    </span>
  );
}

export default async function PricingTiers() {
  const { isLoggedIn, tier: activeTier } = await getMarketingAuthState();

  return (
    <section id="pricing" data-section="pricing" className="py-24">
      <div className="mx-auto max-w-[1280px] px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {TIERS.map((card) => {
            const isCurrentPlan = isLoggedIn && activeTier === card.tier;

            return (
              <div
                key={card.tier}
                className={`relative flex flex-col rounded-[20px] border border-border bg-surface p-8 ${
                  card.featured ? "pw-tier-featured" : ""
                }`}
              >
                {card.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-medium tracking-[0.02em] text-[var(--tile-text-on-accent)]">
                    Most popular
                  </span>
                )}

                <h3 className="font-display text-2xl text-text">{card.name}</h3>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-mono text-4xl text-text">
                    ${TIER_PRICES_USD[card.tier]}
                  </span>
                  <span className="font-mono text-sm text-text-dim">/mo</span>
                </div>

                <p className="mt-2 text-sm text-text-muted">{card.headline}</p>
                {card.sub && (
                  <p className="mt-1 font-mono text-sm text-text-muted">{card.sub}</p>
                )}

                <div className="mt-8">
                  {isCurrentPlan ? (
                    // TODO: Billing page not built yet (no page.tsx for /account/billing).
                    // When it exists, consider linking this badge to billing for plan
                    // management instead of leaving it as a static non-interactive state.
                    <CurrentPlanBadge />
                  ) : (
                    <Button
                      href={signupHref(card.tier)}
                      variant={card.featured ? "primary" : "outline"}
                      className="w-full justify-center"
                    >
                      {card.cta}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-text-dim">
          Need more? Buy extra credits anytime from your billing page.
        </p>
      </div>
    </section>
  );
}
