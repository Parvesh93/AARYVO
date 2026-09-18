import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";
import PlatformAnalytics from "./_components/PlatformAnalytics";
import "./globals.css";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://aaryvo.ppdesigntech.com").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "AARYVO — AI Sales Employee for Your Website", template: "%s | AARYVO" },
  description: "Turn website visitors into qualified leads, booked appointments and real sales conversations — automatically, 24/7.",
  applicationName: "AARYVO",
  keywords: ["AI sales agent", "AI sales employee", "website chatbot", "lead qualification", "AI lead generation", "appointment booking"],
  icons: { icon: "/aaryvo-icon.webp", shortcut: "/aaryvo-icon.webp", apple: "/aaryvo-icon.webp" },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "AARYVO",
    title: "AARYVO — Your AI Sales Employee",
    description: "Turn website visitors into qualified leads, booked appointments and real sales conversations — automatically, 24/7.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "AARYVO — AI Sales Employee for Your Website",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AARYVO — Your AI Sales Employee",
    description: "Turn website visitors into qualified leads, booked appointments and real sales conversations — automatically, 24/7.",
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <Suspense fallback={null}><PlatformAnalytics /></Suspense>
    {children}
    <Script src="https://aaryvo.ppdesigntech.com/widget.js" data-agent="cmu3ayuj30004iu4qmzi9hj9t" strategy="afterInteractive" />
  </body></html>;
}
