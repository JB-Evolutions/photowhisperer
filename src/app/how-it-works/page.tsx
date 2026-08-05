import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/shared/Nav";
import MarketingShell from "@/components/marketing/MarketingShell";
import { marketingSocial } from "@/lib/seo";

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

export default function HowItWorksPage() {
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

            <Section heading="1. Describe the scene">
              <p>
                Tell us the light and the subject in your own words: what
                you&apos;re shooting, how much light there is, and whether
                anything is moving. &ldquo;Kid running across the yard at
                golden hour&rdquo; or &ldquo;candlelit table at a wedding
                reception&rdquo; is enough, you don&apos;t need to know f-stops
                or shutter speed going in.
              </p>
              <p>
                Two details change the answer the most: how much light is
                actually in the scene, and how fast your subject is moving.
                Light ranges further than people expect, bright sun sits
                around EV 15 (the basis of the old sunny-16 rule, f/16 at
                1/ISO), open shade drops to about EV 12, and an ordinarily lit
                indoor room is down around EV 5 to 7, each step being roughly
                one stop less light to work with. Motion matters just as much:
                a person walking needs a shutter speed of about 1/125s to hold
                sharp, a kid or a dog running climbs to around 1/500s, and fast
                sport or birds in flight need 1/1000s or faster. If you know
                your camera and lens, mention those too, depth of field and
                the handholdable shutter floor both shift with focal length.
              </p>
            </Section>

            <Section heading="2. Read the settings">
              <p>
                You get back four values: ISO, aperture, shutter speed, and
                white balance, the same exposure triangle every manual camera
                uses, plus color temperature. They trade against each other in
                stops, open the aperture one stop and you can cut the shutter
                time in half, from 1/125s to 1/250s, or halve the ISO instead,
                and land at the same overall exposure. Each response tells you
                which of the three we prioritized for your scene and why,
                rather than handing you a number with no reasoning attached.
              </p>
              <p>
                Aperture sets how much is in focus as much as it sets
                exposure: f/1.8 to f/2.8 isolates a single portrait subject
                against a soft background, f/4 to f/5.6 keeps a couple or a
                small group sharp, and f/8 to f/11 is where most lenses are
                sharpest and where landscapes typically land, moving to f/16
                when you need everything in focus from a foreground rock to
                the horizon. ISO is the number most likely to move scene to
                scene: roughly 800-1600 for a lit city street, 1600-3200 for a
                dim indoor reception, and 3200-6400 for candlelight or a
                handheld night scene, climbing past 6400 only when the shutter
                speed matters more than a clean file.
              </p>
            </Section>

            <Section heading="3. Dial them in">
              <p>
                Set aperture and ISO on your camera as given, then set shutter
                speed, or let your camera&apos;s manual or aperture-priority mode
                hold it for you. If you&apos;re shooting without a tripod, keep an
                eye on the reciprocal rule folded into the shutter speed we
                give you: roughly 1/focal length to avoid handshake blur,
                about 1/50s on a 50mm lens, 1/200s on a 200mm, a couple of
                stops slower if your lens or body has stabilization.
              </p>
              <p>
                White balance can usually be set from the nearest preset on
                your camera rather than typed in as a raw Kelvin value,
                Daylight, Cloudy, Tungsten, or Shade all correspond to a
                rough color temperature range. Shoot a test frame, check it
                against the scene, and adjust ISO or shutter speed by a stop
                if the light was brighter or dimmer than described. The
                reasoning behind each value is there so you can make that
                adjustment yourself instead of guessing from scratch next
                time the light changes.
              </p>
            </Section>

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
            </Section>
          </div>
        </main>
      </MarketingShell>
    </>
  );
}
