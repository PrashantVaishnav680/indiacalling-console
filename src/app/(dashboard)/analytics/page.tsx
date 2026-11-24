'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Analytics has been merged into the Organization Overview dashboard.
 * Redirects any legacy bookmarks to /overview#analytics cleanly.
 */
export default function AnalyticsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/overview#analytics');
  }, [router]);

  return (
    <div className="p-8 text-center text-sm text-[#747B91]">
      Analytics is now unified inside Organization Overview. Redirecting...
    </div>
  );
}
