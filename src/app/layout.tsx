import type { Metadata } from "next";
import { Geist, Anuphan, Chakra_Petch } from "next/font/google";
import "./globals.css";
import { GamePreferencesProvider } from "@/components/game-preferences";
import { absoluteUrl, indexable, jsonLd, seoDescription, seoKeywords, siteOrigin } from "@/lib/seo";
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
const anuphan = Anuphan({
  subsets: ["thai", "latin"],
  variable: "--font-thai",
  display: "swap",
});
const chakra = Chakra_Petch({
  subsets: ["thai", "latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: {
    default: "GameSlash แพลตฟอร์มรวมเกม AI",
    template: "%s · gameslash",
  },
  description:
    seoDescription,
  keywords: seoKeywords,
  robots: { index: indexable, follow: true, googleBot: { index: indexable, follow: true, "max-image-preview": "large" } },
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION },
  applicationName: "gameslash",
  openGraph: {
    type: "website",
    siteName: "GameSlash",
    locale: "th_TH",
    images: [{
      url: "/images/gameslash-social-v4.png",
      width: 1734,
      height: 907,
      alt: "GameSlash แพลตฟอร์มรวมเกม AI — RPG ผจญภัย และจำลอง",
    }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/images/gameslash-social-v4.png"],
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="th"
      data-scroll-behavior="smooth"
      className={`${geist.variable} ${anuphan.variable} ${chakra.variable}`}
    >
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ "@context": "https://schema.org", "@type": "WebSite", "@id": absoluteUrl("/#website"), name: "GameSlash", alternateName: ["GameSlash รวมเกมที่สร้างด้วย AI", "GameSlash Games Made with AI"], url: absoluteUrl("/"), description: seoDescription, inLanguage: "th" }) }} />
        <GamePreferencesProvider>{children}</GamePreferencesProvider>
      </body>
    </html>
  );
}
