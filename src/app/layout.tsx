import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider, brandInitScript } from "@/components/providers/ThemeProvider";

export const metadata: Metadata = {
  title: "ACS — Access Control",
  description: "Multi-tenant access control dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: ThemeProvider sets `class` (dark) and
    // the brand init script sets `data-brand` on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs synchronously before paint to set data-brand. Prevents FOUC. */}
        <script dangerouslySetInnerHTML={{ __html: brandInitScript }} />
      </head>
      <body className="bg-background text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
