import type { Metadata } from "next";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

export const metadata: Metadata = {
  title: "No Cap — Software Capitalization Manager",
  description: "ASC 350-40 compliant software development cost capitalization & amortization system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning on <html>: browser extensions like
    // Scribe Recorder, Grammarly, dark-mode toggles, and password
    // managers commonly add attributes to <html> before React hydrates,
    // which trips the hydration mismatch warning and (in some cases)
    // aborts the tree's hydration so form handlers never attach. The
    // suppression is scoped to <html> only — child components still
    // get strict hydration checks.
    <html lang="en" suppressHydrationWarning>
      <body style={{ display: 'flex', flexDirection: 'row' }}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
