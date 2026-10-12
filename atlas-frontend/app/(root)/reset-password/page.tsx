'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const t = searchParams ? searchParams.get('token') : null;
    const e = searchParams ? searchParams.get('email') : null;
    if (t) setToken(t);
    if (e) setEmail(e);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);

    if (!token) {
      setAlert({ type: 'error', message: 'Missing reset token.' });
      return;
    }
    if (password.length < 8) {
      setAlert({ type: 'error', message: 'Password must be at least 8 characters.' });
      return;
    }
    if (password !== confirm) {
      setAlert({ type: 'error', message: 'Passwords do not match.' });
      return;
    }

    setSubmitting(true);
            try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || ''}/flask-api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password })
      });
      const data = await res.json();
      if (res.ok) {
        setAlert({ type: 'success', message: 'Password updated! Redirecting to login...' });
        setTimeout(() => router.push('/login'), 1800);
      } else {
        setAlert({ type: 'error', message: data.error || 'Reset failed.' });
      }
    } catch (err) {
      setAlert({ type: 'error', message: 'Network error resetting password.' });
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full h-full">
      <section className="bg-[#1c2532] min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full bg-gray-400 rounded-lg shadow dark:border sm:max-w-md xl:p-0 dark:bg-gray-800 dark:border-gray-700">
          <div className="p-6 space-y-5 md:space-y-6">
            <h1 className="text-xl text-center font-bold tracking-tight text-gray-900 md:text-2xl dark:text-white">Reset Password</h1>
            <p className="text-sm text-center text-gray-700 dark:text-gray-300">Enter your new password below.</p>

            <form className="space-y-4" onSubmit={handleSubmit}>
              {email && (
                <div>
                  <label className="block mb-1 text-sm font-medium text-gray-900 dark:text-white">Email</label>
                  <input
                    type="text"
                    value={email}
                    readOnly
                    disabled
                    title="Email address"
                    placeholder="Email address"
                    className="bg-gray-200 border border-gray-300 text-gray-600 rounded-lg block w-full p-2.5 cursor-not-allowed"
                  />
                </div>
              )}
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-900 dark:text-white">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-gray-50 border border-gray-200 text-gray-900 rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 pr-16"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-900 dark:text-white">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    className="bg-gray-50 border border-gray-200 text-gray-900 rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 pr-16"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {showConfirm ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {alert && (
                <div
                  className={`w-full flex items-center justify-between border px-4 py-3 rounded relative text-sm font-medium ${
                    alert.type === 'success'
                      ? 'bg-green-100 border-green-400 text-green-700'
                      : 'bg-red-100 border-red-400 text-red-700'
                  }`}
                  role="alert"
                >
                  <span>{alert.message}</span>
                  <button
                    type="button"
                    className="ml-2 text-xs opacity-70 hover:opacity-100"
                    onClick={() => setAlert(null)}
                  >
                    ✕
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full text-white bg-[#1c2532] disabled:opacity-60 disabled:cursor-not-allowed hover:bg-primary-100 font-medium rounded-lg text-sm px-5 py-2.5 text-center"
              >
                {submitting ? 'Resetting...' : 'Reset Password'}
              </button>
              <p className="text-center text-sm text-gray-900 dark:text-gray-400">
                <Link href="/login" className="font-medium text-primary-600 hover:underline">Back to Login</Link>
              </p>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
