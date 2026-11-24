'use client';

import React from 'react';
import Image from 'next/image';

interface IndiaCallingLogoProps {
  compact?: boolean;
  variant?: 'light' | 'dark';
  badge?: string;
  className?: string;
}

export default function IndiaCallingLogo({
  compact = false,
  variant = 'light',
  badge,
  className = '',
}: IndiaCallingLogoProps) {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Official Uploaded Brand Mark */}
      <Image
        src="/indiacalling-logo.svg"
        alt="IndiaCalling.ai Logo"
        width={36}
        height={36}
        className="w-9 h-9 rounded-xl flex-shrink-0 shadow-sm object-contain"
      />

      {!compact && (
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex flex-col leading-none">
            <span className="text-[16px] font-extrabold tracking-tight truncate">
              <span className="text-[#FF671F]">IndiaCalling</span>
              <span className="text-[#00C853]">.ai</span>
            </span>
            <span
              className={`text-[10px] font-medium tracking-wide mt-0.5 ${
                variant === 'dark' ? 'text-slate-400' : 'text-[#747B91]'
              }`}
            >
              Enterprise Voice AI
            </span>
          </div>
          {badge && (
            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-[#635BFF]/15 text-[#635BFF] border border-[#635BFF]/25 whitespace-nowrap">
              {badge}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
