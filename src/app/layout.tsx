import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loro Whiteboard",
  description: "Collaborative whiteboard powered by Loro CRDT",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
