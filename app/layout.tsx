import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Групповой чат",
  description: "Общий чат с регистрацией, входом и сообщениями в реальном времени.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
