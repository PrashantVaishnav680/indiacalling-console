import React from "react";

interface LoadingSpinnerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  color?: string;
}

export function LoadingSpinner({
  size = "md",
  className = "",
  color = "text-[#635BFF]",
}: LoadingSpinnerProps) {
  const sizeMap = {
    xs: "w-3.5 h-3.5",
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
    xl: "w-12 h-12",
  };

  return (
    <svg
      className={`animate-spin ${sizeMap[size]} ${color} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3.5"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function ButtonSpinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin -ml-1 mr-2 w-4 h-4 text-current inline-block ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function LoadingState({
  title = "Loading...",
  subtitle,
  size = "lg",
  minHeight = "min-h-[260px]",
}: {
  title?: string;
  subtitle?: string;
  size?: "md" | "lg" | "xl";
  minHeight?: string;
}) {
  return (
    <div
      className={`w-full ${minHeight} flex flex-col items-center justify-center p-8 bg-white border border-[#E8EAF1] rounded-2xl shadow-xs`}
    >
      <div className="relative mb-4 flex items-center justify-center">
        {/* Soft pulsing glow behind the spinner */}
        <div className="absolute w-12 h-12 rounded-full bg-[#635BFF]/15 animate-ping" />
        <div className="w-12 h-12 rounded-full bg-[#EEF0FF] flex items-center justify-center border border-[#C7CBFF]">
          <LoadingSpinner size={size} color="text-[#635BFF]" />
        </div>
      </div>
      <p className="text-sm font-semibold text-[#20243A] animate-pulse">
        {title}
      </p>
      {subtitle && (
        <p className="text-xs text-[#747B91] mt-1 max-w-sm text-center">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export function CardSkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-200" />
            <div className="space-y-1.5 flex-1">
              <div className="h-4 bg-slate-200 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          </div>
          <div className="h-16 bg-slate-50 border border-slate-100 rounded-lg" />
          <div className="grid grid-cols-3 gap-2 pt-2">
            <div className="h-10 bg-slate-100 rounded" />
            <div className="h-10 bg-slate-100 rounded" />
            <div className="h-10 bg-slate-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableLoadingRows({
  columns = 5,
  rows = 4,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="animate-pulse border-b border-[#E8EAF1]">
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="px-5 py-4">
              <div
                className={`h-3.5 bg-slate-200 rounded ${
                  c === 0 ? "w-3/4" : c === columns - 1 ? "w-1/3 ml-auto" : "w-1/2"
                }`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
