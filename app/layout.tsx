import type { Metadata } from "next";
import "./globals.css";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://aaryvo.ppdesigntech.com").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "AARYVO — AI Sales Employee for Your Website",
    template: "%s | AARYVO",
  },
  description: "AARYVO answers website enquiries, qualifies prospects, captures leads and books appointments automatically — 24/7.",
  applicationName: "AARYVO",
  keywords: ["AI sales agent", "AI sales employee", "website chatbot", "lead qualification", "AI lead generation", "appointment booking"],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "AARYVO",
    title: "AARYVO — Your AI Sales Employee",
    description: "Turn website conversations into qualified leads and booked appointments — automatically, 24/7.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AARYVO — Your AI Sales Employee",
    description: "Turn website conversations into qualified leads and booked appointments — automatically, 24/7.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
