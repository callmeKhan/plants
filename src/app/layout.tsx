import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import SyncProvider from "@/components/SyncProvider";
import { LoadingProvider } from "@/components/LoadingProvider";
import { SellCartBar } from "@/components/sell-cart-bar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export const viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Plant Manager",
  description: "Quản lý chậu cây - offline first PWA",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Plant Manager",
  },
  icons: {
    apple: "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-gray-900">
        <LoadingProvider>
          <SyncProvider>
            <main className="flex-1 pb-20 px-4 pt-4">{children}</main>
            <SellCartBar />
            <BottomNav />
          </SyncProvider>
        </LoadingProvider>
      </body>
    </html>
  );
}
