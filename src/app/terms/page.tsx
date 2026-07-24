import type { Metadata } from "next";
import Nav from "@/components/shared/Nav";
import MarketingShell from "@/components/marketing/MarketingShell";
import { marketingSocial } from "@/lib/seo";

const TITLE = "Terms of Service | PhotoWhisperer";
const DESCRIPTION = "The terms that govern your use of PhotoWhisperer.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...marketingSocial({ title: TITLE, description: DESCRIPTION, path: "/terms" }),
};

// LEGAL COPY BELOW IS PLACEHOLDER. It must be reviewed by qualified counsel
// before launch — it is not legal advice and has not been reviewed by a lawyer.

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

export default function TermsPage() {
  return (
    <>
      <Nav />
      <MarketingShell>
        <main className="px-8 py-24">
          <div className="mx-auto max-w-[720px]">
            <h1 className="font-display text-4xl text-text sm:text-5xl">
              Terms of Service
            </h1>
            <p className="mt-3 font-mono text-sm text-text-dim">
              Last updated: {LAST_UPDATED}
            </p>

            <Section heading="1. Acceptance of Terms">
              <p>
                By creating an account or using PhotoWhisperer (&ldquo;the
                Service&rdquo;), you agree to these Terms of Service. If you
                don&apos;t agree, please don&apos;t use the Service.
              </p>
            </Section>

            <Section heading="2. Description of Service">
              <p>
                PhotoWhisperer is a photography settings calculator. You
                describe a shooting scene in natural language, optionally
                with your camera and lens information, and the Service
                returns recommended camera settings, ISO, aperture, shutter
                speed, and white balance, along with the reasoning behind
                them.
              </p>
              <p>
                These recommendations are estimates based on the information
                you provide. They are not a guarantee of a correctly exposed
                photograph, and you remain responsible for verifying settings
                against your own judgment and equipment.
              </p>
            </Section>

            <Section heading="3. Accounts">
              <p>
                You need an account to use the Service. You&apos;re
                responsible for keeping your login credentials secure and for
                any activity that happens under your account. Let us know
                right away if you suspect unauthorized access.
              </p>
            </Section>

            <Section heading="4. Subscriptions and Payment">
              <p>
                PhotoWhisperer offers a free trial tier (Snapshot) and two
                paid subscription tiers (Portrait and Studio), billed
                monthly. Subscriptions renew automatically until canceled.
                You can cancel anytime from your billing page; cancellation
                takes effect at the end of your current billing period, and
                you keep access until then.
              </p>
              <p>
                We also offer one-time extra-credit packs, which don&apos;t
                expire and are used after your monthly quota is exhausted.
                All payments are processed by Stripe; we don&apos;t store
                your card details.
              </p>
            </Section>

            <Section heading="5. Acceptable Use">
              <p>
                Don&apos;t use the Service to violate the law, infringe on
                others&apos; rights, attempt to disrupt or reverse-engineer
                the Service, or submit content that&apos;s abusive, harmful,
                or that you don&apos;t have the right to share.
              </p>
            </Section>

            <Section heading="6. Intellectual Property">
              <p>
                PhotoWhisperer and its branding, design, and underlying
                software are owned by us. The camera-setting recommendations
                generated for you are yours to use freely. You retain
                ownership of any scene descriptions you submit.
              </p>
            </Section>

            <Section heading="7. Disclaimers">
              <p>
                The Service is provided &ldquo;as is.&rdquo;
                Camera-setting recommendations are generated using AI and
                exposure calculations based on the information you provide;
                they may not always be accurate or appropriate for your
                specific situation. We don&apos;t warrant that the Service
                will be uninterrupted, error-free, or that any photograph
                taken using our recommendations will meet your expectations.
              </p>
            </Section>

            <Section heading="8. Limitation of Liability">
              <p>
                To the fullest extent permitted by law, PhotoWhisperer is not
                liable for indirect, incidental, or consequential damages
                arising from your use of the Service, including missed shots
                or unsatisfactory photographs. Our total liability for any
                claim is limited to the amount you paid us in the 12 months
                before the claim arose.
              </p>
            </Section>

            <Section heading="9. Termination">
              <p>
                You can stop using the Service and cancel your account at any
                time. We may suspend or terminate accounts that violate these
                Terms.
              </p>
            </Section>

            <Section heading="10. Changes to These Terms">
              <p>
                We may update these Terms from time to time. If we make
                material changes, we&apos;ll notify you (for example, by
                email or an in-app notice). Continued use of the Service
                after changes take effect means you accept the updated
                Terms.
              </p>
            </Section>

            <Section heading="11. Contact">
              <p>
                Questions about these Terms? Email us at{" "}
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
