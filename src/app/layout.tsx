import type { Metadata } from "next";
import { Geist, Anuphan, Chakra_Petch } from "next/font/google";
import "./globals.css";
import { GamePreferencesProvider } from "@/components/game-preferences";
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
  title: {
    default: "gameslash — ค้นพบเกม AI และไอเดียใหม่",
    template: "%s · gameslash",
  },
  description:
    "พื้นที่รวมเกม AI บทความ เครื่องมือ และคอมมูนิตี้สำหรับคนชอบสร้างเกม ค้นพบเกมแล้วไปต่อที่เว็บไซต์ผู้สร้าง",
  applicationName: "gameslash",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="th"
      className={`${geist.variable} ${anuphan.variable} ${chakra.variable}`}
    >
      <body><GamePreferencesProvider>{children}</GamePreferencesProvider></body>
    </html>
  );
}
