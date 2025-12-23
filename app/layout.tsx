import type { Metadata } from "next";
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

const siteUrl = "https://word-cards.blazorserver.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "word-cards",
    template: "%s | word-cards",
  },
  description: "Warm, minimalist English flashcards for kids",
  applicationName: "word-cards",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: "/",
    title: "word-cards",
    description: "Warm, minimalist English flashcards for kids",
    siteName: "word-cards",
    images: [
      {
        url: "/word-cards.png",
        width: 1200,
        height: 630,
        alt: "word-cards",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "word-cards",
    description: "Warm, minimalist English flashcards for kids",
    images: ["/word-cards.png"],
  },
  icons: {
    icon: "/word-cards.png",
    apple: "/word-cards.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
