import type { Metadata } from "next";
import { Figtree, Fraunces } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import "./globals.css";
import { ThemePreferencesProvider } from "@/components/theme-preferences";

const sans = Figtree({
  variable: "--font-sans",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: `${PRODUCT_TAGLINE}. Shared lead pool feeding Abstract, Ahava, Take More, Venture, and TYH portals.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      suppressHydrationWarning
      lang="en"
      className={`${sans.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemePreferencesProvider><TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider></ThemePreferencesProvider>
      </body>
    </html>
  );
}
