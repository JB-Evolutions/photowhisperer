import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PhotoWhisperer",
    short_name: "PhotoWhisperer",
    description: "Describe the scene. Get the camera settings.",
    start_url: "/app",
    display: "standalone",
    background_color: "#0E2640",
    theme_color: "#F2C879",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
