'use client';

import { useState, useEffect } from "react";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { handleRegisterInputChange, handleRegisterSubmit } from "./Register-Handler";
import { Check, X } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();

  const [showAlertError, setShowAlertError] = useState(false);
  const [showAlertSuc, setShowAlertSuc] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    emailConfirm: "",
    password: "",
    passwordConfirm: ""
  });

  const calculatePasswordStrength = (password: string) => {
    if (password.length === 0) return { strength: 0, label: '', color: '' };
    if (password.length < 8) return { strength: 1, label: 'Weak', color: 'bg-red-500' };
    
    let strength = 1;
    if (password.length >= 8) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    if (strength <= 2) return { strength: 1, label: 'Weak', color: 'bg-red-500' };
    if (strength === 3) return { strength: 2, label: 'Fair', color: 'bg-orange-500' };
    if (strength === 4) return { strength: 3, label: 'Good', color: 'bg-yellow-500' };
    return { strength: 4, label: 'Strong', color: 'bg-green-500' };
  };

  const passwordStrength = calculatePasswordStrength(formData.password);
  const passwordsMatch = formData.passwordConfirm.length > 0 && formData.password === formData.passwordConfirm;

  useEffect(() => setIsClient(true), []);

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
          Create Your Account
        </h1>

        <form
          className="space-y-5"
          onSubmit={(e) =>
            handleRegisterSubmit(
              e,
              formData,
              router,
              setShowAlertError,
              setShowAlertSuc,
              setAlertMessage
            )
          }
        >
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-300">Username</label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={(e) => handleRegisterInputChange(e, setFormData)}
              required
              className="bg-[#2a2a2a] border border-gray-700 text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 placeholder-gray-400"
              placeholder="username"
            />
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium text-gray-300">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={(e) => handleRegisterInputChange(e, setFormData)}
              required
              className="bg-[#2a2a2a] border border-gray-700 text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 placeholder-gray-400"
              placeholder="name@gmail.com"
            />

            <label className="block mt-3 mb-1 text-sm font-medium text-gray-300">Confirm Email</label>
            <input
              type="email"
              name="emailConfirm"
              value={formData.emailConfirm}
              onChange={(e) => handleRegisterInputChange(e, setFormData)}
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
                onChange={(e) => handleRegisterInputChange(e, setFormData)}
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
            
            {formData.password && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">Password Strength</span>
                  <span className={`text-xs font-semibold ${
                    passwordStrength.strength === 1 ? 'text-red-500' :
                    passwordStrength.strength === 2 ? 'text-orange-500' :
                    passwordStrength.strength === 3 ? 'text-yellow-500' :
                    'text-green-500'
                  }`}>
                    {passwordStrength.label}
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                    style={{ width: `${(passwordStrength.strength / 4) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium text-gray-300">Confirm Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="passwordConfirm"
                value={formData.passwordConfirm}
                onChange={(e) => handleRegisterInputChange(e, setFormData)}
                required
                className="bg-[#2a2a2a] border border-gray-700 text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full p-2.5 pr-10 placeholder-gray-400"
                placeholder="••••••••"
              />
              {formData.passwordConfirm && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {passwordsMatch ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : (
                    <X className="w-5 h-5 text-red-500" />
                  )}
                </div>
              )}
            </div>
          </div>

          {showAlertError && alertMessage && (
            <div className="bg-red-900/40 border border-red-500 text-red-300 px-4 py-3 rounded-lg">{alertMessage}</div>
          )}
          {showAlertSuc && (
            <div className="bg-green-900/40 border border-green-500 text-green-300 px-4 py-3 rounded-lg">
              Registration Successful! Redirecting...
            </div>
          )}

          <button
            type="submit"
            className="w-full text-white bg-blue-600 hover:bg-blue-500 focus:ring-4 focus:ring-blue-700 font-medium rounded-lg text-sm px-5 py-2.5 transition"
          >
            Create Account
          </button>

          <p className="text-sm text-gray-400 text-center">
            <Link href="/login" className="font-medium text-blue-400 hover:underline">
              Already have an account? Login
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
