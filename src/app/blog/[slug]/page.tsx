import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Nav from "@/components/shared/Nav";
import MarketingShell from "@/components/marketing/MarketingShell";
import JsonLd from "@/components/seo/JsonLd";
import { BLOG_POSTS, getPostBySlug } from "@/content/blog";
import { marketingSocial, SITE_URL, SITE_NAME } from "@/lib/seo";

// Inert: this route is forced to render dynamically by the root layout's
// headers() call, so no static shell exists for this list to populate.
export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  const title = `${post.title} | PhotographyWhisperer`;
  return {
    title,
    description: post.description,
    ...marketingSocial({
      title,
      description: post.description,
      path: `/blog/${post.slug}`,
    }),
  };
}

function formatDate(dateString: string): string {
  return new Date(`${dateString}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const url = `${SITE_URL}/blog/${post.slug}`;

  const blogPostingSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    url,
    author: {
      "@type": "Person",
      name: "Jayden Murdie",
      url: "https://www.linkedin.com/in/jayden-murdie",
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
    },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  return (
    <>
      <JsonLd data={blogPostingSchema} nonce={nonce} />
      <JsonLd data={breadcrumbSchema} nonce={nonce} />
      <Nav />
      <MarketingShell>
        <main className="px-8 py-24">
          <div className="mx-auto max-w-[720px]">
            <p className="font-mono text-sm text-text-dim">
              {formatDate(post.publishedAt)} &middot;{" "}
              <a
                href="https://www.linkedin.com/in/jayden-murdie"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-text"
              >
                Jayden Murdie
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.114 20.452H3.558V9h3.556v11.452z" />
                </svg>
              </a>
            </p>
            <h1 className="mt-2 font-display text-4xl text-text sm:text-5xl">
              {post.title}
            </h1>

            <div className="mt-6 flex flex-col gap-3 text-[17px] leading-[1.65] text-text-muted">
              {post.intro.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            {post.sections.map((section) => (
              <section key={section.heading} className="mt-12">
                <h2 className="font-display text-2xl text-text">
                  {section.heading}
                </h2>
                <div className="mt-3 flex flex-col gap-3 text-[17px] leading-[1.65] text-text-muted">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}

            <p className="mt-12 text-[17px] leading-[1.65] text-text-muted">
              <Link href="/" className="text-text underline hover:text-accent">
                PhotographyWhisperer
              </Link>{" "}
              solves this for your exact scene instead of a general range,
              describe what you&apos;re shooting and get ISO, aperture,
              shutter speed, and white balance back, with the reasoning
              attached.
            </p>

            <Link
              href="/blog"
              className="mt-12 block text-sm text-text-muted underline hover:text-text"
            >
              &larr; Back to Blog
            </Link>
          </div>
        </main>
      </MarketingShell>
    </>
  );
}
