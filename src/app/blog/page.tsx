import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/shared/Nav";
import MarketingShell from "@/components/marketing/MarketingShell";
import { BLOG_POSTS } from "@/content/blog";
import { marketingSocial } from "@/lib/seo";

const TITLE = "Blog | PhotographyWhisperer";
const DESCRIPTION =
  "Camera settings guides for specific, hard-light situations: indoor sports, night street photography, and low-light wedding receptions.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...marketingSocial({ title: TITLE, description: DESCRIPTION, path: "/blog" }),
};

function formatDate(dateString: string): string {
  return new Date(`${dateString}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function BlogIndexPage() {
  return (
    <>
      <Nav />
      <MarketingShell>
        <main>
          <section className="px-8 pt-24 sm:pt-32">
            <div className="mx-auto flex max-w-[800px] flex-col items-center text-center">
              <h1 className="font-display text-4xl text-text sm:text-5xl">
                Blog
              </h1>
              <p className="mt-6 max-w-[560px] text-base text-text-muted sm:text-lg">
                Camera settings guides for specific, hard-light situations,
                real ISO ranges, apertures, and shutter speeds, not general
                advice.
              </p>
            </div>
          </section>

          <section className="px-8 py-24">
            <div className="mx-auto flex max-w-[720px] flex-col gap-6">
              {BLOG_POSTS.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="rounded-[14px] border border-border bg-surface p-8 transition-colors hover:border-border-accent"
                >
                  <p className="font-mono text-sm text-text-dim">
                    {formatDate(post.publishedAt)}
                  </p>
                  <h2 className="mt-2 font-display text-2xl text-text">
                    {post.title}
                  </h2>
                  <p className="mt-2 text-[17px] leading-[1.65] text-text-muted">
                    {post.excerpt}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </main>
      </MarketingShell>
    </>
  );
}
