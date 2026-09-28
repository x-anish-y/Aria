import { Plus_Jakarta_Sans, Playfair_Display } from "next/font/google";
import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ToastProvider";
import "./globals.css";

/**
 * Fonts — loaded via next/font for zero-CLS, self-hosted subsets.
 * Jakarta Sans = body/UI, Playfair Display = editorial headlines.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

/**
 * Next.js Metadata API — SEO, OpenGraph, Twitter, favicon.
 */
export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://aura-aria.vercel.app"
  ),
  title: {
    default: "Aria — AI Voice Support | Aura Skincare",
    template: "%s | Aria — Aura Skincare",
  },
  description:
    "Talk to Aria, Aura Skincare's real-time AI voice assistant. Instant order tracking, policy-grounded returns, and personalized botanical routine consultations with sub-second latency.",
  keywords: [
    "AI voice assistant",
    "skincare customer support",
    "order tracking",
    "Aura Skincare",
    "Aria",
    "voice AI",
    "clean beauty",
    "botanical skincare",
  ],
  authors: [{ name: "Aura Skincare" }],
  openGraph: {
    title: "Aria — AI Voice Support | Aura Skincare",
    description:
      "Talk to Aria, Aura Skincare's real-time AI voice assistant. Track orders, manage returns, and get skincare advice — by voice.",
    type: "website",
    locale: "en_IN",
    siteName: "Aura Skincare",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aria — AI Voice Support | Aura Skincare",
    description:
      "Real-time voice AI assistant for Aura Skincare orders, returns & botanical routines.",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/icon.svg",
  },
};

/**
 * Blocking script to prevent FOUC (flash of unstyled content).
 * Runs before React hydrates — reads localStorage and sets data-theme
 * so the correct CSS variables apply on first paint.
 */
const themeScript = `
  (function() {
    try {
      var t = localStorage.getItem('aria-theme');
      if (t === 'light' || t === 'dark') {
        document.documentElement.setAttribute('data-theme', t);
      }
    } catch(e) {}
  })();
`;

/**
 * Root layout — wraps every page with:
 * - Font CSS variables
 * - MotionConfig (respects prefers-reduced-motion globally)
 * - ThemeProvider (dark/light state)
 * - ToastProvider (notification system)
 * - Animated background (gradient blobs + noise)
 */
export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${jakarta.variable} ${playfair.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* Blocking theme script — prevents flash */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col antialiased">
        {/* Animated background blobs — GPU-only transforms, disabled if prefers-reduced-motion */}
        <div className="animated-bg" aria-hidden="true" />
        <div className="noise-overlay" aria-hidden="true" />

        <MotionConfig reducedMotion="user">
          <ThemeProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ThemeProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
