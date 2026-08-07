import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "cycling-analytics.local";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: {
      default: "Cycling Analytics",
      template: "%s | Cycling Analytics",
    },
    description: "Personal ride analytics, training trends, and explainable recovery guidance.",
    openGraph: {
      title: "Ride with the trend.",
      description: "Personal ride analytics and explainable recovery guidance.",
      type: "website",
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 1732, height: 909, alt: "Cycling Analytics recovery dashboard" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Ride with the trend.",
      description: "Personal ride analytics and explainable recovery guidance.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
