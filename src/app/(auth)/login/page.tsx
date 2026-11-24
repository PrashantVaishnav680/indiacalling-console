'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, LogIn, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { ButtonSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/components/ToastProvider';

const INDUSTRIES = [
  'Real Estate',
  'Healthcare & Clinics',
  'Education & EdTech',
  'BFSI & Insurance',
  'B2B SaaS & Technology',
  'E-Commerce & Retail',
  'Automotive',
  'Travel & Hospitality',
  'General Business',
];

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Sign-In state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Register Organization state
  const [organizationName, setOrganizationName] = useState('');
  const [industry, setIndustry] = useState('Real Estate');
  const [ownerName, setOwnerName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, rememberMe }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg =
          data.error ||
          data.message ||
          'Invalid email or password. Please try again.';
        setError(msg);
        toast.error(msg, 'Sign In Failed');
      } else {
        const target =
          data.redirectTo ||
          (data.user?.role === 'super_admin' ? '/super-admin' : '/overview');
        toast.success(
          `Signed in as ${data.user?.name || 'User'}`,
          data.user?.role === 'super_admin'
            ? 'Super Admin Portal'
            : 'Organization Portal'
        );
        router.push(target);
        router.refresh();
      }
    } catch {
      const msg = 'Unable to connect to authentication service. Please try again.';
      setError(msg);
      toast.error(msg, 'Connection Error');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (organizationName.trim().length < 2) {
      setError('Organization name must be at least 2 characters.');
      return;
    }
    if (ownerName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!regEmail.includes('@')) {
      setError('Please enter a valid work email address.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (regPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: organizationName.trim(),
          industry,
          ownerName: ownerName.trim(),
          email: regEmail.trim(),
          phone: phone.trim(),
          password: regPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || 'Could not create organization account.';
        setError(msg);
        toast.error(msg, 'Registration Failed');
      } else {
        toast.success(
          `Workspace "${organizationName.trim()}" is ready.`,
          'Organization Registered'
        );
        router.push(data.redirectTo || '/overview');
        router.refresh();
      }
    } catch {
      const msg = 'Registration request failed. Please try again.';
      setError(msg);
      toast.error(msg, 'Connection Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-[#E8EAF1] bg-white shadow-sm p-6 sm:p-8 text-[#20243A] animate-fade-in">
      {/* Mode Switcher Tabs */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] mb-6">
        <button
          type="button"
          onClick={() => switchMode('login')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
            mode === 'login'
              ? 'bg-white text-[#635BFF] shadow-sm border border-[#E8EAF1]'
              : 'text-[#747B91] hover:text-[#20243A]'
          }`}
        >
          <LogIn className="w-3.5 h-3.5" />
          Sign In
        </button>
        <button
          type="button"
          onClick={() => switchMode('register')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
            mode === 'register'
              ? 'bg-white text-[#635BFF] shadow-sm border border-[#E8EAF1]'
              : 'text-[#747B91] hover:text-[#20243A]'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          Register Organization
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-5 text-xs text-red-700 font-medium"
        >
          {error}
        </div>
      )}

      {mode === 'login' ? (
        <>
          <div className="mb-5">
            <h1 className="text-xl font-bold tracking-tight text-[#20243A]">
              Welcome back
            </h1>
            <p className="text-xs text-[#747B91] mt-1">
              Sign in to your Organization or Super Admin workspace
            </p>
          </div>

          <form onSubmit={handleLogin} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-[#20243A] mb-1.5"
              >
                Work Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2.5 text-sm text-[#20243A] outline-none transition focus:border-[#635BFF] focus:bg-white"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-[#20243A] mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2.5 pr-11 text-sm text-[#20243A] outline-none transition focus:border-[#635BFF] focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#747B91] hover:text-[#20243A] p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[#747B91]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-[#635BFF]"
                />
                <span>Keep me signed in</span>
              </label>
              <Link
                href="/forgot-password"
                className="font-semibold text-[#635BFF] hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60"
            >
              {loading && <ButtonSpinner />}
              <span>{loading ? 'Signing in...' : 'Sign In'}</span>
            </button>
          </form>

          {/* Role Quick-Access for Local Evaluation */}
          <div className="mt-6 pt-5 border-t border-[#E8EAF1]">
            <p className="text-[11px] font-semibold text-[#747B91] mb-2.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#635BFF]" />
              Quick Portal Access
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setEmail('org@indiacalling.ai');
                  setPassword('Demo@1234');
                }}
                className="text-left p-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] hover:border-[#635BFF] hover:bg-[#EEF0FF]/40 transition"
              >
                <span className="text-xs font-bold block text-[#20243A]">
                  Organization
                </span>
                <span className="text-[10px] text-[#747B91] truncate block">
                  org@indiacalling.ai
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail('superadmin@indiacalling.ai');
                  setPassword('Demo@1234');
                }}
                className="text-left p-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] hover:border-[#635BFF] hover:bg-[#EEF0FF]/40 transition"
              >
                <span className="text-xs font-bold block text-[#635BFF]">
                  Super Admin
                </span>
                <span className="text-[10px] text-[#747B91] truncate block">
                  superadmin@indiacalling.ai
                </span>
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mb-5">
            <h1 className="text-xl font-bold tracking-tight text-[#20243A]">
              Register your Organization
            </h1>
            <p className="text-xs text-[#747B91] mt-1">
              Create an isolated AI voice workspace in seconds
            </p>
          </div>

          <form onSubmit={handleRegister} noValidate className="space-y-3.5">
            <div>
              <label
                htmlFor="orgName"
                className="block text-xs font-semibold text-[#20243A] mb-1"
              >
                Organization Name *
              </label>
              <input
                id="orgName"
                type="text"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="e.g. Skyline Realty Pvt Ltd"
                className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2.5 text-sm text-[#20243A] outline-none transition focus:border-[#635BFF] focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="industry"
                  className="block text-xs font-semibold text-[#20243A] mb-1"
                >
                  Industry *
                </label>
                <select
                  id="industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3 py-2.5 text-sm text-[#20243A] outline-none transition focus:border-[#635BFF] focus:bg-white"
                >
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="ownerName"
                  className="block text-xs font-semibold text-[#20243A] mb-1"
                >
                  Your Full Name *
                </label>
                <input
                  id="ownerName"
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="e.g. Vikram Mehta"
                  className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2.5 text-sm text-[#20243A] outline-none transition focus:border-[#635BFF] focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="regEmail"
                  className="block text-xs font-semibold text-[#20243A] mb-1"
                >
                  Work Email *
                </label>
                <input
                  id="regEmail"
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2.5 text-sm text-[#20243A] outline-none transition focus:border-[#635BFF] focus:bg-white"
                />
              </div>
              <div>
                <label
                  htmlFor="regPhone"
                  className="block text-xs font-semibold text-[#20243A] mb-1"
                >
                  Phone (Optional)
                </label>
                <input
                  id="regPhone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2.5 text-sm text-[#20243A] outline-none transition focus:border-[#635BFF] focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="regPassword"
                  className="block text-xs font-semibold text-[#20243A] mb-1"
                >
                  Password *
                </label>
                <input
                  id="regPassword"
                  type="password"
                  required
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2.5 text-sm text-[#20243A] outline-none transition focus:border-[#635BFF] focus:bg-white"
                />
              </div>
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-xs font-semibold text-[#20243A] mb-1"
                >
                  Confirm Password *
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2.5 text-sm text-[#20243A] outline-none transition focus:border-[#635BFF] focus:bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60 mt-2"
            >
              {loading && <ButtonSpinner />}
              <span>
                {loading ? 'Creating Workspace...' : 'Create Organization Account'}
              </span>
            </button>
          </form>
        </>
      )}
    </div>
  );
}
