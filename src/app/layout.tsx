import type { Metadata } from "next";
import { DM_Serif_Display, Syne, DM_Mono } from "next/font/google";
import "./globals.css";

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const dmMono = DM_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Favicon Generator",
  description:
    "Create crisp favicons in seconds: live preview, Tailwind v4 swatches, randomize, shapes, and one-click ZIP export (ICO + PNG sizes) for web & PWAs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSerifDisplay.variable} ${syne.variable} ${dmMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
