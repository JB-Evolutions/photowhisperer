import Nav from "@/components/shared/Nav";
import Button from "@/components/shared/Button";
import MarketingShell from "@/components/marketing/MarketingShell";
import { getMarketingAuthState } from "@/lib/auth-state";

export default async function NotFound() {
  const { isLoggedIn } = await getMarketingAuthState();

  // TODO(Phase 10): log this 404 (with the requested URL) to Sentry/analytics
  // once that's wired up. Broken inbound links from our own marketing should
  // be fixed at the source.

  return (
    <>
      <Nav />
      <MarketingShell>
        <main className="flex min-h-[60vh] items-center justify-center px-8 py-24">
          <div className="flex w-full max-w-[480px] flex-col items-center rounded-[20px] border border-border bg-surface p-10 text-center">
            <h1 className="font-display text-3xl text-text">
              Off the focal plane
            </h1>
            <p className="mt-3 text-base text-text-muted">
              That page doesn&apos;t exist.
            </p>
            <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                href="/"
                variant="primary"
                className="w-full justify-center sm:w-auto"
              >
                Back to home
              </Button>
              {isLoggedIn && (
                <Button
                  href="/app"
                  variant="outline"
                  className="w-full justify-center sm:w-auto"
                >
                  Back to app
                </Button>
              )}
            </div>
            <p className="mt-6 text-sm text-text-dim">
              If you followed a link from us, sorry. Let us know at{" "}
              <a
                href="mailto:support@photographywhisperer.com"
                className="underline hover:text-text"
              >
                support@photographywhisperer.com
              </a>
              .
            </p>
          </div>
        </main>
      </MarketingShell>
    </>
  );
}
