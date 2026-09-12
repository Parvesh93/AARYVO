import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AARYVO — AI Sales Employee",
  description: "Turn conversations into customers with an AI sales employee that qualifies leads and books appointments.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
