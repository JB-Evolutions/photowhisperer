import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import Nav from "@/components/shared/Nav";
import Button from "@/components/shared/Button";
import MarketingShell from "@/components/marketing/MarketingShell";
import { marketingSocial } from "@/lib/seo";
import { getMarketingAuthState } from "@/lib/auth-state";

const TITLE = "How it works | PhotographyWhisperer";
const DESCRIPTION =
  "How to describe a scene, read back the ISO, aperture, shutter speed, and white balance you get, and dial them into your camera.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...marketingSocial({ title: TITLE, description: DESCRIPTION, path: "/how-it-works" }),
};

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-2xl text-text">{heading}</h2>
      <div className="mt-3 flex flex-col gap-3 text-[17px] leading-[1.65] text-text-muted">
        {children}
      </div>
    </section>
  );
}

function StepCard({
  number,
  heading,
  children,
}: {
  number: number;
  heading: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-accent font-mono text-sm text-accent">
        {number}
      </span>
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-text">{heading}</h2>
        {children}
      </div>
    </li>
  );
}

function ReferenceGroup({
  label,
  rows,
  caption,
}: {
  label: string;
  rows: { value: string; desc: string }[];
  caption?: string;
}) {
  return (
    <div>
      <span className="text-[11px] uppercase tracking-[0.08em] text-text-muted">
        {label}
      </span>
      <dl className="mt-2 flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.value} className="flex items-baseline gap-3">
            <dt className="font-mono text-sm text-text">{row.value}</dt>
            <dd className="text-sm text-text-muted">{row.desc}</dd>
          </div>
        ))}
      </dl>
      {caption ? (
        <p className="mt-2 text-xs text-text-muted">{caption}</p>
      ) : null}
    </div>
  );
}

function ReferencePanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-border bg-surface p-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{children}</div>
    </div>
  );
}

export default async function HowItWorksPage() {
  const { isLoggedIn } = await getMarketingAuthState();

  return (
    <>
      <Nav />
      <MarketingShell>
        <main className="px-8 py-24">
          <div className="mx-auto max-w-[720px]">
            <h1 className="font-display text-4xl text-text sm:text-5xl">
              How PhotographyWhisperer works
            </h1>
            <p className="mt-6 text-[17px] leading-[1.65] text-text-muted">
              Three steps: describe the scene, read back four numbers, dial
              them into your camera. No app pairing, no brand-specific menus,
              just the standard controls every manual-mode camera has.
            </p>

            <ol className="mt-12 flex flex-col gap-10">
              <StepCard number={1} heading="Describe the scene">
                <div className="flex flex-col gap-3 text-sm leading-[1.65] text-text-muted">
                  <p>
                    Tell us the light and the subject in your own words: what
                    you&apos;re shooting, how much light there is, and
                    whether anything is moving. &ldquo;Kid running across the
                    yard at golden hour&rdquo; or &ldquo;candlelit table at a
                    wedding reception&rdquo; is enough, you don&apos;t need
                    to know f-stops or shutter speed going in.
                  </p>
                  <p>
                    Two details change the answer the most: how much light
                    is actually in the scene, and how fast your subject is
                    moving. Light ranges further than people expect, and
                    each step down below is roughly one stop less light to
                    work with. If you know your camera and lens, mention
                    those too, depth of field and the handholdable shutter
                    floor both shift with focal length.
                  </p>
                </div>
                <ReferencePanel>
                  <ReferenceGroup
                    label="Light (EV)"
                    rows={[
                      { value: "EV 15", desc: "bright sun" },
                      { value: "EV 12", desc: "open shade" },
                      { value: "EV 5-7", desc: "lit indoor room" },
                    ]}
                    caption="Bright sun is the basis of the sunny-16 rule: f/16 at 1/ISO."
                  />
                  <ReferenceGroup
                    label="Motion (shutter speed)"
                    rows={[
                      { value: "1/125s", desc: "walking" },
                      { value: "1/500s", desc: "running kid or dog" },
                      { value: "1/1000s+", desc: "fast sport or birds in flight" },
                    ]}
                  />
                </ReferencePanel>
              </StepCard>

              <StepCard number={2} heading="Read the settings">
                <div className="flex flex-col gap-3 text-sm leading-[1.65] text-text-muted">
                  <p>
                    You get back four values: ISO, aperture, shutter speed,
                    and white balance, the same exposure triangle every
                    manual camera uses, plus color temperature. They trade
                    against each other in stops, open the aperture one stop
                    and you can cut the shutter time in half, from 1/125s to
                    1/250s, or halve the ISO instead, and land at the same
                    overall exposure. Each response tells you which of the
                    three we prioritized for your scene and why, rather than
                    handing you a number with no reasoning attached.
                  </p>
                  <p>
                    Aperture sets how much is in focus as much as it sets
                    exposure. ISO is the number most likely to move scene to
                    scene, climbing past the ranges below only when shutter
                    speed matters more than a clean file.
                  </p>
                </div>
                <ReferencePanel>
                  <ReferenceGroup
                    label="Aperture"
                    rows={[
                      { value: "f/1.8-2.8", desc: "single subject, soft background" },
                      { value: "f/4-5.6", desc: "couple or small group" },
                      { value: "f/8-11", desc: "landscape; sharpest for most lenses" },
                      { value: "f/16", desc: "everything in focus, foreground to horizon" },
                    ]}
                  />
                  <ReferenceGroup
                    label="ISO"
                    rows={[
                      { value: "800-1600", desc: "lit city street" },
                      { value: "1600-3200", desc: "dim indoor reception" },
                      { value: "3200-6400", desc: "candlelight or handheld night" },
                    ]}
                  />
                </ReferencePanel>
              </StepCard>

              <StepCard number={3} heading="Dial them in">
                <div className="flex flex-col gap-3 text-sm leading-[1.65] text-text-muted">
                  <p>
                    Set aperture and ISO on your camera as given, then set
                    shutter speed, or let your camera&apos;s manual or
                    aperture-priority mode hold it for you. If you&apos;re
                    shooting without a tripod, keep an eye on the reciprocal
                    rule folded into the shutter speed we give you: roughly
                    1/focal length to avoid handshake blur, about 1/50s on a
                    50mm lens, 1/200s on a 200mm, a couple of stops slower
                    if your lens or body has stabilization.
                  </p>
                  <p>
                    White balance can usually be set from the nearest preset
                    on your camera rather than typed in as a raw Kelvin
                    value, Daylight, Cloudy, Tungsten, or Shade all
                    correspond to a rough color temperature range. Shoot a
                    test frame, check it against the scene, and adjust ISO
                    or shutter speed by a stop if the light was brighter or
                    dimmer than described. The reasoning behind each value
                    is there so you can make that adjustment yourself
                    instead of guessing from scratch next time the light
                    changes.
                  </p>
                </div>
              </StepCard>
            </ol>

            <Section heading="Start with your own scene">
              <p>
                That&apos;s the whole loop: describe what you&apos;re shooting, get four
                numbers with the reasoning behind them, dial them in. Every
                plan runs the same calculator, they differ only in how many
                scenes you can submit each month and how much history you
                keep, see{" "}
                <Link href="/pricing" className="text-text underline hover:text-accent">
                  pricing
                </Link>{" "}
                for the breakdown.
              </p>
              <div className="mt-3 flex justify-center">
                {isLoggedIn ? (
                  <Button href="/app" variant="primary" size="lg">
                    New scene
                  </Button>
                ) : (
                  <Button href="/auth/signup" variant="primary" size="lg">
                    Get my settings
                  </Button>
                )}
              </div>
            </Section>
          </div>
        </main>
      </MarketingShell>
    </>
  );
}
