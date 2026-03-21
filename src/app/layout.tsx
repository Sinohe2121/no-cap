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
    <html lang="en">
      <body style={{ display: 'flex', flexDirection: 'row' }}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
