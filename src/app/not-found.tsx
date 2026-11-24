'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F7F8FC] flex flex-col items-center justify-center text-center px-4">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-10">
        <div className="w-10 h-10 rounded-full bg-[#635BFF] flex items-center justify-center">
          <span className="text-white font-bold text-sm">IC</span>
        </div>
        <span className="text-[#20243A] font-semibold text-lg">IndiaCalling Console</span>
      </div>

      {/* 404 */}
      <h1 className="text-9xl font-extrabold text-[#635BFF] leading-none mb-4">404</h1>

      {/* Heading */}
      <h2 className="text-2xl font-bold text-[#20243A] mb-3">Page Not Found</h2>

      {/* Description */}
      <p className="text-[#747B91] text-base max-w-md mb-8">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      {/* Back button */}
      <Link
        href="/overview"
        className="inline-flex items-center gap-2 bg-[#635BFF] text-white font-medium px-6 py-3 rounded-xl hover:bg-[#4f46e5] transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to Dashboard
      </Link>
    </div>
  );
}
