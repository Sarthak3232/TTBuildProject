import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SLOTTY",
    template: "%s | SLOTTY",
  },
  description: "Build habits. Earn tokens. Spin for rewards.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* Grammarly can inject body attributes before React hydrates. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
