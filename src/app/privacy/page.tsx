import type { Metadata } from "next";
import Nav from "@/components/shared/Nav";
import MarketingShell from "@/components/marketing/MarketingShell";
import { marketingSocial } from "@/lib/seo";

const TITLE = "Privacy Policy | PhotoWhisperer";
const DESCRIPTION = "How PhotoWhisperer collects, uses, and protects your data.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...marketingSocial({
    title: TITLE,
    description: DESCRIPTION,
    path: "/privacy",
  }),
};

// LEGAL COPY BELOW IS PLACEHOLDER. It must be reviewed by qualified counsel
// before launch — it is not legal advice and has not been reviewed by a lawyer.

// PRE-LAUNCH: §4 says users can delete history entries "at any time" and §5
// promises access/export/delete from settings — but session delete/rename is
// deferred to v1.1 and export may not exist. Either ship those features before
// launch or soften this copy to match what's actually available. A privacy
// policy promising data-subject controls that aren't built is real legal
// exposure.

// screen-spec-v1.md §1.3 specs a sticky right-rail TOC (≥1100px) + mobile
// jump-to-section dropdown — deferred, low-traffic page.

const LAST_UPDATED = "June 22, 2026";

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

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <MarketingShell>
        <main className="px-8 py-24">
          <div className="mx-auto max-w-[720px]">
            <h1 className="font-display text-4xl text-text sm:text-5xl">
              Privacy Policy
            </h1>
            <p className="mt-3 font-mono text-sm text-text-dim">
              Last updated: {LAST_UPDATED}
            </p>

            <Section heading="1. What We Collect">
              <p>
                We collect the information you give us directly: your email
                address when you create an account, the scene descriptions
                you submit, your camera profile if you choose to add one
                (camera body, lenses, flash), and basic usage data, like
                which subscription tier you&apos;re on and how many requests
                you&apos;ve made this month.
              </p>
            </Section>

            <Section heading="2. How We Use It">
              <p>
                We use your scene description and camera profile to
                generate camera-setting recommendations. We use your account
                and usage data to run your subscription, enforce monthly
                quotas, and maintain your request history so you can revisit
                past results.
              </p>
            </Section>

            <Section heading="3. Processors and Subprocessors">
              <p>
                We rely on a small number of service providers to operate
                PhotoWhisperer:
              </p>
              <ul className="list-disc pl-5">
                <li>
                  <span className="font-semibold text-text">Supabase</span>{" "}
                  stores your account data, scene history, and
                  subscription/credit records, acting as our data processor.
                </li>
                <li>
                  <span className="font-semibold text-text">Stripe</span>{" "}
                  processes all payments and stores your payment details; we
                  never see or store your full card number.
                </li>
                <li>
                  <span className="font-semibold text-text">Anthropic</span>{" "}
                  processes the scene descriptions you submit to generate
                  your camera-setting recommendations. We don&apos;t share
                  your data with Anthropic, or anyone else, for the purpose
                  of training AI models.
                </li>
                <li>
                  <span className="font-semibold text-text">
                    Google Analytics
                  </span>{" "}
                  processes usage analytics, but only if you accept our
                  cookie banner. See the Cookies section below for details.
                </li>
              </ul>
              <p>
                None of these providers use your data for purposes beyond
                providing their service to us.
              </p>
            </Section>

            <Section heading="4. Data Retention">
              <p>
                Your scene descriptions and the settings we return are
                stored as part of your request history, which you control.
                You can delete entries from your history at any time, and we
                don&apos;t retain scene text beyond what your history
                settings require. If you close your account, we delete your
                stored data within a reasonable period, except where
                we&apos;re required to retain records (for example, for tax
                or legal purposes).
              </p>
            </Section>

            <Section heading="5. Your Rights">
              <p>
                You can access, export, or delete your data at any time from
                your account settings, or by emailing us. If you&apos;re in
                a jurisdiction with specific data-protection rights (like the
                GDPR or CCPA), we&apos;ll honor requests consistent with
                those rights.
              </p>
            </Section>

            <Section heading="6. Cookies">
              <p>
                We use a minimal set of cookies needed to keep you signed in
                and remember your session. These are strictly necessary and
                aren&apos;t affected by the cookie choice described below.
              </p>
              <p>
                We also use Google Analytics 4 to understand how the site is
                used. Analytics is loaded with Google&apos;s Consent Mode,
                which defaults to denied. No analytics cookies are set
                until you accept via the cookie banner. Before you&apos;ve
                made a choice, or if you decline, Google may still receive
                basic, cookieless pings it uses to model aggregate usage,
                but no analytics cookie is set on your device. If you
                accept, Google Analytics sets cookies and collects usage
                data, such as pages viewed, approximate location derived
                from your IP address, and device/browser type, to help us
                understand how PhotoWhisperer is used. We don&apos;t
                deliberately send Google any personal information, like your
                email address or scene descriptions.
              </p>
              <p>
                You can change your choice at any time using the &quot;Cookie
                settings&quot; link in the footer. For more on how Google
                handles this data, see{" "}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text underline hover:text-accent"
                >
                  Google&apos;s Privacy Policy
                </a>
                .
              </p>
            </Section>

            <Section heading="7. Contact">
              <p>
                Questions about this Privacy Policy or your data? Email us
                at{" "}
                <a
                  href="mailto:support@photographywhisperer.com"
                  className="text-text underline hover:text-accent"
                >
                  support@photographywhisperer.com
                </a>
                .
              </p>
            </Section>
          </div>
        </main>
      </MarketingShell>
    </>
  );
}
