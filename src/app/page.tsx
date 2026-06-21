import Nav from "@/components/shared/Nav";
import Button from "@/components/shared/Button";
import MarketingShell from "@/components/marketing/MarketingShell";
import AppShowcase from "@/components/marketing/AppShowcase";
import PricingTiers from "@/components/marketing/PricingTiers";
import FaqAccordion from "@/components/marketing/FaqAccordion";
import { getMarketingAuthState } from "@/lib/auth-state";
import { TIER_LIMITS } from "@/lib/quota";

const FEATURES = [
  {
    title: "Works for any camera",
    body: "Mirrorless, DSLR, or a phone with manual controls — we speak in ISO, aperture, shutter speed, and white balance, not brand-specific menus.",
    icon: <CameraIcon />,
  },
  {
    title: "Calculates real exposure math, not vibes",
    body: "Every recommendation is grounded in the actual exposure triangle for your scene's light, not a guess dressed up in confident language.",
    icon: <GaugeIcon />,
  },
  {
    title: "Built for the field",
    body: "Describe a scene in seconds — from a trailhead, a sideline, or a dim reception hall — and get settings back before you've missed the shot.",
    icon: <CompassIcon />,
  },
];

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4 7.5 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.5L15 4Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 14 15.5 9" />
      <path d="M3.5 14a8.5 8.5 0 1 1 17 0" />
      <path d="M3.5 14h17" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m14.5 9.5-2 5-5 2 2-5Z" />
    </svg>
  );
}

export default async function Home() {
  const { isLoggedIn } = await getMarketingAuthState();

  return (
    <>
      <Nav />
      <MarketingShell>
        <main>
          <section id="hero" data-section="hero" className="px-8 py-24 sm:py-32">
            <div className="mx-auto flex max-w-[800px] flex-col items-center text-center">
              <h1 className="font-display text-[36px] leading-[1.1] text-text sm:text-[64px]">
                Describe the scene.
                <br />
                Get the camera settings.
              </h1>
              <p className="mt-6 max-w-[560px] text-base text-text-muted sm:text-lg">
                Tell us the light and the subject — we hand back ISO, aperture,
                shutter speed, and white balance, with the reasoning behind each.
              </p>
              <div className="mt-9 w-full sm:w-auto">
                {isLoggedIn ? (
                  <Button href="/app" variant="primary" size="lg" className="w-full justify-center sm:w-auto">
                    New scene
                  </Button>
                ) : (
                  <Button href="/auth/signup" variant="primary" size="lg" className="w-full justify-center sm:w-auto">
                    Get my settings
                  </Button>
                )}
              </div>
              {!isLoggedIn && (
                <p className="mt-4 text-sm text-text-dim">
                  Try {TIER_LIMITS.snapshot} free settings, no card required
                </p>
              )}
            </div>
          </section>

          <section id="features" data-section="features" className="px-8 py-24">
            <div className="mx-auto max-w-[1280px]">
              <div className="grid grid-cols-1 gap-12 sm:grid-cols-3 sm:gap-8">
                {FEATURES.map((feature) => (
                  <div key={feature.title} className="flex flex-col">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border-accent text-accent">
                      {feature.icon}
                    </span>
                    <h3 className="mt-5 font-display text-xl text-text">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm leading-[1.6] text-text-muted">
                      {feature.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <AppShowcase />
          <PricingTiers />
          <FaqAccordion />
        </main>
      </MarketingShell>
    </>
  );
}
