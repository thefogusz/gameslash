import type { MetadataRoute } from "next";
import { absoluteUrl, indexable } from "@/lib/seo";
export default function robots(): MetadataRoute.Robots {
  return indexable ? { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/oauth/", "/.well-known/"] }, sitemap: absoluteUrl("/sitemap.xml") } : { rules: { userAgent: "*", disallow: "/" } };
}
