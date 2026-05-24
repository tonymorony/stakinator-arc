import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono, Fredoka } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const fredoka = Fredoka({
  variable: "--font-fredoka",
  weight: ["600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Stakinator",
    template: "%s · Stakinator",
  },
  description: "Your money, working smarter. AI wealth manager for everyone.",
  openGraph: {
    title: "Stakinator",
    description: "Your money, working smarter. AI wealth manager for everyone.",
    type: "website",
    siteName: "Stakinator",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stakinator",
    description: "Your money, working smarter. AI wealth manager for everyone.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVars = `${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${fredoka.variable}`;
  return (
    <html lang="en" className={`${fontVars} bg-bg-base h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
