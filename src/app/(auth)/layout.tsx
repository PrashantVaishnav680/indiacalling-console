import type { Metadata } from "next";
import IndiaCallingLogo from "@/components/IndiaCallingLogo";

export const metadata: Metadata = {
  title: "Sign In — IndiaCalling.ai Console",
  description: "Sign in or register your organization on IndiaCalling.ai",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F7F8FC] flex flex-col items-center justify-center px-4 py-10 sm:py-14">
      {/* Brand Header */}
      <div className="flex flex-col items-center mb-7">
        <IndiaCallingLogo />
        <p className="text-xs text-[#747B91] mt-2 text-center">
          Enterprise AI Voice Calling &amp; Multi-Tenant Automation
        </p>
      </div>

      {/* Auth Card Content */}
      {children}

      {/* Footer */}
      <p className="mt-8 text-xs text-[#747B91] text-center">
        © {new Date().getFullYear()} IndiaCalling.ai. All rights reserved.
      </p>
    </div>
  );
}
