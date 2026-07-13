import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["/", "/pricing", "/terms", "/privacy"];

  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
  }));
}
