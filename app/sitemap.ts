import type { MetadataRoute } from "next";

const siteUrl = "https://word-cards.blazorserver.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = new URL(siteUrl);

  return [
    {
      url: new URL("/", baseUrl).toString(),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
