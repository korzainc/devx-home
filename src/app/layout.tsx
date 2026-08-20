import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DevX Home",
    template: "%s · DevX Home",
  },
  description: "Korza's portal for developer tooling.",
};

// Separate from `metadata` - Next 16 no longer accepts themeColor inside it.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#08090b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-canvas font-sans text-ink">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
          {children}
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-ink-faint">
            Internal tool. Catalogue data is a placeholder until the real
            catalogue lands.
          </div>
        </footer>
      </body>
    </html>
  );
}
