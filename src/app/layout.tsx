import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";

export const metadata: Metadata = {
  title: "IndiaCalling.ai — Enterprise Voice AI Console",
  description:
    "Multi-tenant Enterprise AI Voice Calling, Campaign Automation, and Lead Qualification Platform",
  icons: {
    icon: "/indiacalling-logo.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F7F8FC] text-[#20243A] antialiased selection:bg-[#635BFF]/15 selection:text-[#635BFF]">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
