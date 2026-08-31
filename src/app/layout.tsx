import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Work_Sans } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

// Work Sans is the face korza.com uses, so headings carry the brand. Inter takes the dense UI
// text, where its narrower, more neutral figures hold up better at 13-14px than Work Sans does.
const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
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
      className={`${workSans.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-canvas font-sans text-ink">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
          {children}
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-ink-faint">
            Internal tool. Plugins come from korzainc/marketplace; the tools
            catalogue is still placeholder data.
          </div>
        </footer>
        {/* Renders no markup. It is a client component that appends the script from an effect,
            so the served HTML is unchanged and nothing blocks the prerender. On Vercel the
            script is same-origin at /_vercel/insights/script.js, which the platform serves and
            nothing else does: `next start` outside Vercel logs a load failure rather than
            reporting anywhere. In dev it fetches a debug build from va.vercel-scripts.com. */}
        <Analytics />
      </body>
    </html>
  );
}
