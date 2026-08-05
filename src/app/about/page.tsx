import type { Metadata } from "next";
import Nav from "@/components/shared/Nav";
import MarketingShell from "@/components/marketing/MarketingShell";
import { marketingSocial } from "@/lib/seo";

const TITLE = "About | PhotographyWhisperer";
const DESCRIPTION =
  "Why PhotographyWhisperer exists: turning manual camera settings into a scene description and four numbers, instead of a lookup table you have to memorize.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...marketingSocial({ title: TITLE, description: DESCRIPTION, path: "/about" }),
};

export default function AboutPage() {
  return (
    <>
      <Nav />
      <MarketingShell>
        <main className="px-8 py-24">
          <div className="mx-auto max-w-[720px]">
            <h1 className="font-display text-4xl text-text sm:text-5xl">
              About PhotographyWhisperer
            </h1>

            <div className="mt-6 flex flex-col gap-5 text-[17px] leading-[1.65] text-text-muted">
              <p>
                PhotographyWhisperer is built by two people:{" "}
                <a
                  href="https://www.linkedin.com/in/jayden-murdie"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text underline hover:text-accent"
                >
                  Jayden Murdie
                </a>
                , a photographer working across marketing and AI
                development, and{" "}
                <a
                  href="https://www.linkedin.com/in/blake-byrne-82777b405"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text underline hover:text-accent"
                >
                  Blake Byrne
                </a>
                , a developer. We kept running into the same problem: manual
                mode is worth learning, but the exposure triangle, ISO,
                aperture, and shutter speed trading against each other in
                stops, is genuinely hard to hold in your head while a moment
                is happening in front of you. Reference charts and rules of
                thumb help, but they're built for a generic scene, not the
                one you're actually standing in.
              </p>
              <p>
                So we built a calculator instead of a chart. Describe what
                you're shooting, the light, the subject, whether it's moving,
                and PhotographyWhisperer works the exposure math for that specific
                scene and hands back ISO, aperture, shutter speed, and white
                balance, with the reasoning behind each one attached. It
                doesn't connect to your camera or take the photo for you; it
                solves the math so you can spend your attention on framing and
                timing instead of arithmetic.
              </p>
              <p>
                The goal isn't to replace the skill of manual shooting, it's
                to shorten the distance between deciding what you want a
                photo to look like and actually dialling in the settings that
                get you there, whether you're new to manual mode or you just
                don't want to do the math on a sideline in the dark.
              </p>
            </div>
          </div>
        </main>
      </MarketingShell>
    </>
  );
}
