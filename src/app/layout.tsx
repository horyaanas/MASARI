import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "مساري - إدارة الدورات التدريبية",
  description: "تطبيق PWA لإدارة وتتبع الدورات التدريبية يعمل بدون إنترنت",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "مساري",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// This inline script runs BEFORE React hydrates. It checks whether the
// currently-loaded HTML matches the latest deployed version. If not, it
// clears all caches and reloads with a cache-busting query so the OLD
// service worker cannot serve the stale HTML again.
// NOTE: keep CURRENT_VERSION in sync with /public/version.json
const BOOT_VERSION = "1.2.0";
const updateCheckScript = `(function(){
  try {
    var CURRENT = ${JSON.stringify(BOOT_VERSION)};
    var key = 'masari_seen_v';
    // If this is a new version we've never seen, force a cache wipe + reload
    // once, so that any stale SW-controlled HTML gets replaced.
    var seen = localStorage.getItem(key) || '';
    if (seen !== CURRENT) {
      localStorage.setItem(key, CURRENT);
      // Clear all caches (works even if SW is the old one)
      if ('caches' in window) {
        caches.keys().then(function(names){
          return Promise.all(names.map(function(n){ return caches.delete(n); }));
        }).then(function(){
          // Reload with cache-busting query so old SW can't serve stale HTML
          var u = window.location.pathname + '?v=' + CURRENT + window.location.hash;
          window.location.replace(u);
        });
      } else {
        var u2 = window.location.pathname + '?v=' + CURRENT + window.location.hash;
        window.location.replace(u2);
      }
    }
  } catch (e) { /* ignore */ }
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap" rel="stylesheet" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* Inline boot script: runs before React, forces update on version mismatch */}
        <script dangerouslySetInnerHTML={{ __html: updateCheckScript }} />
      </head>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
