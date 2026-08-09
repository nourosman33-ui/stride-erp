import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Kufi_Arabic } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Applied via the `:root:dir(rtl)` override in globals.css when Arabic is active —
// Geist has no Arabic glyphs, so RTL needs its own font rather than falling back silently.
const notoKufiArabic = Noto_Kufi_Arabic({
  variable: "--font-noto-kufi-arabic",
  subsets: ["arabic"],
});

export const metadata: Metadata = {
  title: "STRIDE ERP",
  description: "STRIDE ERP — catalog, purchasing, inventory, POS and reporting",
};

/**
 * Runs before first paint so a dark-mode user never sees a white flash while React
 * hydrates. It reads the same localStorage keys ThemeProvider writes and applies the
 * same class/attribute, so the two can never disagree. Kept dependency-free and tiny
 * because it blocks rendering; any failure falls through to the light default.
 */
const NO_FLASH_THEME_SCRIPT = `
(function(){try{
  var m=localStorage.getItem("stride_theme_mode")||"system";
  var a=localStorage.getItem("stride_theme_accent")||"graphite";
  var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
  var r=document.documentElement;
  r.classList.toggle("dark",d);
  r.dataset.accent=a;
  r.style.colorScheme=d?"dark":"light";
}catch(e){}})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the script above intentionally mutates <html> before
    // React hydrates, so the class/style attributes legitimately differ from the SSR output.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoKufiArabic.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
