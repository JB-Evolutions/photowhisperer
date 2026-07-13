import type { Metadata } from "next";

export const NOINDEX: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
};

export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://www.photographywhisperer.com";

export const SITE_NAME = "PhotoWhisperer";

const OG_IMAGE = { url: "/og-image.png", width: 1200, height: 630 };

/** Shared openGraph + twitter blocks for the indexable marketing pages.
 *  Relative url/image paths resolve against metadataBase in the root layout. */
export function marketingSocial({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      images: [OG_IMAGE],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
