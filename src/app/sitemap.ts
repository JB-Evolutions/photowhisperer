import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/content/blog";
import { SITE_URL } from "@/lib/seo";

// lastModified values are literals, not computed at build time. Each is the
// last git commit date that touched the route's page file (`git log -1
// --format=%aI -- <path>`). /how-it-works, /blog, and /about have no commit
// history yet (still unstaged from Phase D) so they use today's date;
// replace with the real commit date after they're committed.
const ROUTES: {
  path: string;
  lastModified: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}[] = [
  { path: "/", lastModified: "2026-08-05T10:57:23+12:00", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", lastModified: "2026-08-05T10:57:23+12:00", changeFrequency: "weekly", priority: 0.9 },
  { path: "/how-it-works", lastModified: "2026-08-05T00:00:00+12:00", changeFrequency: "monthly", priority: 0.8 },
  { path: "/blog", lastModified: "2026-08-05T00:00:00+12:00", changeFrequency: "weekly", priority: 0.7 },
  { path: "/about", lastModified: "2026-08-05T00:00:00+12:00", changeFrequency: "yearly", priority: 0.5 },
  { path: "/terms", lastModified: "2026-07-24T21:51:11+12:00", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", lastModified: "2026-07-24T21:51:11+12:00", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries = ROUTES.map(({ path, lastModified, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(lastModified),
    changeFrequency,
    priority,
  }));

  const postEntries = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticEntries, ...postEntries];
}
