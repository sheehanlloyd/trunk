import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// High-contrast serif, used ONLY for marketing display type (.font-editorial).
// It ships a single 400 weight by design — at hero sizes a serif this sharp
// needs no bolding, and the restraint is the point. The product UI is Geist
// throughout, so this never loads inside the dashboard's critical path.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: {
    default: "Trunk — AI receptionist for the trades",
    template: "%s · Trunk",
  },
  description:
    "Trunk answers your calls and website chats 24/7, books the job, and texts you the details — built for HVAC, plumbing, and electrical companies.",
  openGraph: {
    title: "Trunk — AI receptionist for the trades",
    description:
      "Answers your calls and website chats 24/7, books the job, and texts you the details.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Trunk — your phones, answered. Every time." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Trunk — AI receptionist for the trades",
    description:
      "Answers your calls and website chats 24/7, books the job, and texts you the details.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
