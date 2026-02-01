import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Levi - AI Team Agent",
  description: "The multiplayer AI for teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
