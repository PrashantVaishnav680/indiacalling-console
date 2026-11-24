'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderColor: '#E8EAF1',
        color: '#20243A',
      }}
      className="w-full max-w-md rounded-2xl border shadow-sm p-8"
    >
      {!submitted ? (
        <>
          {/* Heading */}
          <div className="mb-6 text-center">
            <h1 style={{ color: '#20243A' }} className="text-2xl font-bold tracking-tight">
              Forgot your password?
            </h1>
            <p style={{ color: '#747B91' }} className="text-sm mt-1">
              Enter your email and we&apos;ll send you a reset link.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                style={{ color: '#20243A' }}
                className="block text-sm font-medium mb-1.5"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={{
                  borderColor: '#E8EAF1',
                  color: '#20243A',
                  backgroundColor: '#F7F8FC',
                }}
                className="w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none transition focus:border-[#635BFF] focus:ring-2 focus:ring-[#635BFF]/20"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email}
              style={{ backgroundColor: '#635BFF' }}
              className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
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
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Sending…
                </>
              ) : (
                'Send Reset Link'
              )}
            </button>
          </form>

          {/* Back to login */}
          <div className="mt-5 text-center">
            <Link
              href="/login"
              style={{ color: '#635BFF' }}
              className="text-sm font-medium hover:underline inline-flex items-center gap-1"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Back to Login
            </Link>
          </div>
        </>
      ) : (
        /* Success state */
        <div className="text-center py-4">
          {/* Green checkmark */}
          <div className="flex justify-center mb-5">
            <div
              style={{ backgroundColor: '#D1FAE5', color: '#059669' }}
              className="w-16 h-16 rounded-full flex items-center justify-center"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-8 h-8"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>

          <h2 style={{ color: '#20243A' }} className="text-xl font-bold mb-2">
            Check your email
          </h2>
          <p style={{ color: '#747B91' }} className="text-sm mb-1">
            We&apos;ve sent a password reset link to
          </p>
          <p style={{ color: '#635BFF' }} className="text-sm font-medium mb-6">
            {email}
          </p>
          <p style={{ color: '#747B91' }} className="text-xs mb-6">
            Didn&apos;t receive it? Check your spam folder or{' '}
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              style={{ color: '#635BFF' }}
              className="font-medium hover:underline"
            >
              try again
            </button>
            .
          </p>

          <Link
            href="/login"
            style={{ color: '#635BFF' }}
            className="text-sm font-medium hover:underline inline-flex items-center gap-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back to Login
          </Link>
        </div>
      )}
    </div>
  );
}
