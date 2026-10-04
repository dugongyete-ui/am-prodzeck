import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dzeck Premium · Alight Motion Premium 1 Tahun",
  description:
    "Aktivasi Alight Motion Premium 1 Tahun lewat verifikasi email. Cepat, aman, langsung aktif di akun Anda.",
  keywords: [
    "alightmotion premium",
    "alight motion pro",
    "aktivasi premium",
    "langganan premium",
    "dzeck premium",
  ],
  openGraph: {
    title: "Dzeck Premium · Alight Motion Premium 1 Tahun",
    description:
      "Aktivasi Alight Motion Premium 1 Tahun lewat verifikasi email. Cepat, aman, langsung aktif.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dzeck Premium · Alight Motion Premium 1 Tahun",
    description:
      "Aktivasi Alight Motion Premium 1 Tahun lewat verifikasi email.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        className={`${jakarta.variable} ${jetbrains.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
