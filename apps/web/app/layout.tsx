import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Mira",
  description:
    "Onboarding from how your experts actually work. Voice in. Sparse hints. Stays out of the way.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable}`}>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
