'use client';

import { useState, useEffect } from "react";
import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  initializeLogin,
  handleInputChange,
  handleLoginSubmit,
  handleOAuthLogin,
  handleOrcidVerifyEmail
} from "./Login-Handler";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showAlertError, setShowAlertError] = useState(false);
  const [showAlertSuc, setShowAlertSuc] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [showOrcidVerifyEmail, setShowOrcidVerifyEmail] = useState(false);
  const [orcidVerifyEmail, setOrcidVerifyEmail] = useState("");

  const [formData, setFormData] = useState({ email: "", password: "" });

  useEffect(() => {
    initializeLogin(searchParams, router, setShowAlertError, setShowAlertSuc, setAlertMessage, setShowOrcidVerifyEmail);
  }, [searchParams, router]);

  useEffect(() => {
    setIsClient(true);
    // Check for ORCID verify email modal using direct URL parsing (fixes Next.js hydration issues)
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('orcid_verify_email') === 'true') {
        setShowOrcidVerifyEmail(true);
      }
    }
  }, []);

  if (!isClient) {
    return (
      <div className="w-full h-full flex items-center justify-center min-h-screen bg-[#121212]">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#121212] text-gray-100">
      <div className="w-full max-w-md bg-[#1e1e1e] rounded-2xl shadow-lg border border-gray-800 p-8">
        <Link href="/" className="text-gray-400 hover:text-white text-sm mb-6 inline-block transition-colors">
          ← Back to Dashboard
        </Link>

        <h1 className="text-3xl font-semibold text-center mb-6 text-white">
          Welcome Back
        </h1>

        <form
          className="space-y-5"
          onSubmit={(e) =>
            handleLoginSubmit(e, formData, router, setShowAlertError, setShowAlertSuc, setAlertMessage)
          }
        >
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-300">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={(e) => handleInputChange(e, setFormData)}
              required
              className="bg-[#2a2a2a] border border-gray-700 text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 placeholder-gray-400"
              placeholder="name@gmail.com"
            />
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium text-gray-300">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={(e) => handleInputChange(e, setFormData)}
                required
                onKeyDown={(e) =>
                  setCapsLockOn(typeof e.getModifierState === "function" && e.getModifierState("CapsLock"))
                }
                onKeyUp={(e) =>
                  setCapsLockOn(typeof e.getModifierState === "function" && e.getModifierState("CapsLock"))
                }
                onBlur={() => setCapsLockOn(false)}
                className="bg-[#2a2a2a] border border-gray-700 text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full p-2.5 pr-14 placeholder-gray-400"
                placeholder="••••••••"
              />

              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-3 flex items-center text-sm text-gray-300 hover:text-white focus:outline-none"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {capsLockOn && <p className="mt-1 text-xs text-yellow-400">Caps Lock is on</p>}
          </div>

          {showAlertError && alertMessage && (
            <div className="bg-red-900/40 border border-red-500 text-red-300 px-4 py-3 rounded-lg">{alertMessage}</div>
          )}
          {showAlertSuc && <div className="bg-green-900/40 border border-green-500 text-green-300 px-4 py-3 rounded-lg">Login Successful! Redirecting...</div>}

          <button
            type="submit"
            className="w-full text-white bg-blue-600 hover:bg-blue-500 focus:ring-4 focus:ring-blue-700 font-medium rounded-lg text-sm px-5 py-2.5 transition"
          >
            Login
          </button>

          <div className="flex items-center justify-between text-sm">
            <Link href="/forgot-password" className="text-blue-400 hover:underline">Forgot password?</Link>
            <Link href="/register" className="text-blue-400 hover:underline">Create an account</Link>
          </div>
        </form>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => (window.location.href = `/flask-api/auth/google`)}
            className="w-full flex items-center justify-center gap-2 bg-[#2a2a2a] border border-gray-700 text-gray-200 font-medium rounded-lg px-5 py-2.5 hover:bg-[#333] transition"
          >
            <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
              <path
                d="M47.532 24.552c0-1.636-.146-3.2-.418-4.704H24.48v9.02h13.02c-.56 3.02-2.24 5.58-4.78 7.3v6.06h7.74c4.54-4.18 7.07-10.34 7.07-17.676z"
                fill="#4285F4"
              />
              <path
                d="M24.48 48c6.48 0 11.92-2.14 15.89-5.82l-7.74-6.06c-2.14 1.44-4.88 2.3-8.15 2.3-6.26 0-11.56-4.22-13.46-9.9H2.5v6.22C6.47 43.78 14.7 48 24.48 48z"
                fill="#34A853"
              />
              <path
                d="M11.02 28.52c-.48-1.44-.76-2.98-.76-4.52s.28-3.08.76-4.52v-6.22H2.5A23.98 23.98 0 000 24c0 3.98.96 7.76 2.5 11.02l8.52-6.5z"
                fill="#FBBC05"
              />
              <path
                d="M24.48 9.5c3.54 0 6.68 1.22 9.16 3.62l6.86-6.86C36.4 2.14 30.96 0 24.48 0 14.7 0 6.47 4.22 2.5 10.98l8.52 6.5c1.9-5.68 7.2-9.98 13.46-9.98z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>

          <button
            type="button"
            onClick={() => (window.location.href = `/flask-api/auth/orcid`)}
            className="w-full flex items-center justify-center gap-2 bg-[#2a2a2a] border border-gray-700 text-gray-200 font-medium rounded-lg px-5 py-2.5 hover:bg-[#333] transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="11" fill="#688a09" />
              <g fill="#fff" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700">
                <text x="8.2" y="16" fontSize="11">
                  i
                </text>
                <text x="11.2" y="16" fontSize="11">
                  D
                </text>
              </g>
            </svg>
            Sign in with ORCID
          </button>
        </div>

        {showOrcidVerifyEmail && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[#1e1e1e] border border-gray-700 rounded-2xl p-8 max-w-md w-full mx-4">
              <h2 className="text-2xl font-semibold text-white mb-4">Verify ORCID Email</h2>
              <p className="text-gray-400 mb-6">
                Enter your email address to link your ORCID account with your existing account.
              </p>
              
              <input
                type="email"
                value={orcidVerifyEmail}
                onChange={(e) => setOrcidVerifyEmail(e.target.value)}
                placeholder="your.email@example.com"
                className="bg-[#2a2a2a] border border-gray-700 text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 mb-4 placeholder-gray-400"
              />

              {showAlertError && alertMessage && (
                <div className="bg-red-900/40 border border-red-500 text-red-300 px-4 py-3 rounded-lg mb-4 text-sm">{alertMessage}</div>
              )}
              {showAlertSuc && alertMessage && (
                <div className="bg-green-900/40 border border-green-500 text-green-300 px-4 py-3 rounded-lg mb-4 text-sm">{alertMessage}</div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowOrcidVerifyEmail(false);
                    setOrcidVerifyEmail("");
                    setShowAlertError(false);
                    setAlertMessage(null);
                  }}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg px-4 py-2.5 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleOrcidVerifyEmail(
                      orcidVerifyEmail,
                      router,
                      setShowAlertError,
                      setShowAlertSuc,
                      setAlertMessage,
                      setShowOrcidVerifyEmail
                    )
                  }
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg px-4 py-2.5 transition"
                >
                  Link Account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
