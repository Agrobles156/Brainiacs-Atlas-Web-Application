'use client';

import React from "react";
import Link from "next/link";
import useForgotPasswordHandler from "./ForgotPassword-Handler";

export default function ForgotPasswordPage() {
    const { email, showAlert, alertMessage, alertType, handleChange, handleSubmit, setShowAlert } = useForgotPasswordHandler({});

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#121212] text-gray-100">
            <div className="w-full max-w-md bg-[#1e1e1e] rounded-2xl shadow-lg border border-gray-800 p-8">

                <h1 className="text-3xl font-semibold text-center mb-6 text-white">
                    Reset Your Password
                </h1>

                <p className="text-sm text-gray-400 text-center mb-6">
                    Enter your email address and we&#39;ll send you a link to reset your password.
                </p>

                <form className="space-y-5" onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
                    <div>
                        <label className="block mb-1 text-sm font-medium text-gray-300">Email</label>
                        <input
                            type="email"
                            name="email"
                            value={email}
                            onChange={e => handleChange(e.target.value)}
                            required
                            className="bg-[#2a2a2a] border border-gray-700 text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 placeholder-gray-400"
                            placeholder="name@gmail.com"
                        />
                    </div>

                    {showAlert && (
                        <div className={`px-4 py-3 rounded-lg border ${
                            alertType === 'success' 
                                ? 'bg-green-900/40 border-green-500 text-green-300'
                                : 'bg-red-900/40 border-red-500 text-red-300'
                        }`}>
                            {alertMessage}
                            <button type="button" className="float-right ml-2" onClick={() => setShowAlert(false)}>
                                ×
                            </button>
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full text-white bg-blue-600 hover:bg-blue-500 focus:ring-4 focus:ring-blue-700 font-medium rounded-lg text-sm px-5 py-2.5 transition"
                    >
                        Send Reset Email
                    </button>

                    <div className="flex items-center justify-between text-sm mt-2">
                        <Link href="/login" className="text-blue-400 hover:underline">Back to Login</Link>
                        <Link href="/register" className="text-blue-400 hover:underline">Create an account</Link>
                    </div>
                </form>

            </div>
        </div>
    );
}
