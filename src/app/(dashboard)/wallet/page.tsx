'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function WalletRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/billing');
  }, [router]);
  return (
    <div className="p-8 text-center text-xs text-[#747B91]">
      Redirecting to unified Billing &amp; Wallet...
    </div>
  );
}
