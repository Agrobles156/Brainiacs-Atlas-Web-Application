'use client';

import { useState } from "react";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ToggleTheme from "@/components/ToggleTheme";
import { usePathname } from "next/navigation";

type libNavInfo = {
    user: string | null;
    role: string | null;
    onLogoutSuccess?: () => void;
    setDashView?: (dash: string) => void; // NEW
};


const GeneralSidebar: React.FC<libNavInfo> = ({ user, role, onLogoutSuccess, setDashView }) => {

    const router = useRouter();
    const pathname = usePathname();

    const [showAlertError, setShowAlertError] = useState(false);
    const [showAlertSuc, setShowAlertSuc] = useState(false);
    const [alertMessage, setAlertMessage] = useState<string | null>(null);

    const logOut = async (event: { preventDefault: () => void }) => {
        setAlertMessage(null);
        setShowAlertError(false);
        setShowAlertSuc(false);
        event.preventDefault();
        try {
            const response = await fetch('/flask-api/logout', { credentials: 'include', method: 'GET' });
            if (response.ok) {
                setShowAlertSuc(true);
                if (onLogoutSuccess) onLogoutSuccess();
                setTimeout(() => router.push("/"), 100);
            } else {
                const data = await response.json();
                setAlertMessage(data.error || 'Unknown error');
                setShowAlertError(true);
            }
        } catch (error) {
            let errorMessage = "Failed to logout";
            if (error instanceof Error) errorMessage = error.message;
            setAlertMessage(errorMessage);
            setShowAlertError(true);
        }
    };

    const shouldShow = (path: string) => pathname !== path;

    const linkClasses = "flex items-center px-3 py-2 rounded transition duration-200 hover:shadow-lg hover:bg-[var(--hover-bg)] hover:text-[var(--hover-text)]";

    return (
        <nav className="fixed top-0 left-0 right-0 h-16 bg-[var(--panel-bg)] text-[var(--panel-text)] flex items-center justify-between px-6 shadow-md z-30 transition-colors duration-300">
            
            {/* Left: Greeting */}
            <div className="flex items-center space-x-4">
                <span className="font-bold text-lg">
                    {user == "Not Signed In" || user == null ? "Sign in for all features" : `Hi ${user}`}
                </span>
            </div>

            {/* Middle: Links */}
            <div className="flex items-center space-x-2">
                {(role === "user") && shouldShow("/") && (
                    <Link href="/" className={linkClasses}>
                        <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 16 18" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1 6V15H6V11C6 9.89543 6.89543 9 8 9C9.10457 9 10 9.89543 10 11V15H15V6L8 0L1 6Z" />
                        </svg>
                        Main Dashboard
                    </Link>
                )}

                {shouldShow("/atlas") && (
                    <Link href="/atlas" className={linkClasses}>
                        <svg className="w-5 h-5 mr-1" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 64 64">
                            <path d="M63,26c0-3.433-2.007-6.561-5.05-8.06C57.982,17.631,58,17.318,58,17c0-4.963-4.038-9-9-9..." />
                            <path d="M63,26c0-3.433-2.007-6.561-5.05-8.06C57.982,17.631,58,17.318,58,17c0-4.963-4.038-9-9-9   c-0.076,0-0.151,0.013-0.228,0.015C47.865,4.005,44.28,1,40,1c-3.483,0-6.505,1.993-8,4.896C30.505,2.993,27.483,1,24,1   c-4.248,0-7.862,2.955-8.775,7.011C15.15,8.01,15.076,8,15,8c-4.962,0-9,4.037-9,9c0,0.305,0.016,0.613,0.049,0.922   C2.999,19.42,1,22.57,1,26c0,2.303,0.877,4.4,2.305,5.993C1.832,33.635,1,35.771,1,38c0,3.432,2.007,6.561,5.05,8.06   C6.018,46.369,6,46.682,6,47c0,4.963,4.038,9,9,9c0.076,0,0.15-0.01,0.225-0.011C16.138,60.045,19.752,63,24,63   c3.483,0,6.505-1.993,8-4.896C33.495,61.007,36.517,63,40,63c4.28,0,7.865-3.005,8.772-7.015C48.849,55.987,48.924,56,49,56   c4.962,0,9-4.037,9-9c0-0.305-0.017-0.612-0.049-0.922C61.001,44.581,63,41.43,63,38c0-2.303-0.877-4.4-2.305-5.993   C62.168,30.365,63,28.229,63,26z M56.493,44.533l-0.785,0.3l0.16,0.825C55.956,46.11,56,46.562,56,47c0,3.859-3.14,7-7,7   c0-4.963-4.038-9-9-9v2c3.86,0,7,3.141,7,7s-3.14,7-7,7s-7-3.141-7-7V16h-2v38c0,3.859-3.14,7-7,7   c-3.247,0-6.013-2.219-6.783-5.288C21.109,54.721,24,51.196,24,47h-2c0,3.859-3.14,7-7,7s-7-3.141-7-7s3.14-7,7-7v-2   c-3.932,0-7.275,2.539-8.497,6.06C4.372,42.824,3,40.51,3,38c0-1.734,0.647-3.395,1.793-4.673C6.265,34.376,8.059,35,10,35v-2   c-3.86,0-7-3.141-7-7c0-2.878,1.812-5.504,4.507-6.533l0.786-0.301l-0.161-0.825C8.044,17.892,8,17.44,8,17c0-3.859,3.14-7,7-7   s7,3.141,7,7h2c0-4.196-2.891-7.721-6.783-8.712C17.987,5.219,20.753,3,24,3c3.86,0,7,3.141,7,7v4h2v-4c0-3.859,3.14-7,7-7   s7,3.141,7,7s-3.14,7-7,7v2c4.962,0,9-4.037,9-9c3.86,0,7,3.141,7,7s-3.14,7-7,7v2c3.932,0,7.275-2.539,8.497-6.061   C59.628,21.175,61,23.49,61,26c0,1.734-0.647,3.395-1.793,4.673C57.735,29.624,55.941,29,54,29c-4.962,0-9,4.037-9,9h2   c0-3.859,3.14-7,7-7s7,3.141,7,7C61,40.878,59.188,43.504,56.493,44.533z"/>
                            <path d="M43,10h2c0-2.757-2.243-5-5-5v2C41.654,7,43,8.346,43,10z"/>
                            <path d="M37,54h-2c0,2.757,2.243,5,5,5v-2C38.346,57,37,55.654,37,54z"/>
                            <path d="M54,41v2c2.757,0,5-2.243,5-5h-2C57,39.654,55.654,41,54,41z"/>
                            <path d="M39,37h-2c0,3.309,2.691,6,6,6v-2C40.794,41,39,39.206,39,37z"/>
                            <path d="M41,23v-2c-3.309,0-6,2.691-6,6h2C37,24.794,38.794,23,41,23z"/>
                            <path d="M25,37h-2c0,3.309,2.691,6,6,6v-2C26.794,41,25,39.206,25,37z"/>
                            <path d="M40,28h-2c0,3.309,2.691,6,6,6v-2C41.794,32,40,30.206,40,28z"/>
                            <path d="M27,23v-2c-3.309,0-6,2.691-6,6h2C23,24.794,24.794,23,27,23z"/>
                            <path d="M14,36h2c0-2.206,1.794-4,4-4v-2C16.691,30,14,32.691,14,36z"/>
                            <path d="M15,50v2c2.757,0,5-2.243,5-5h-2C18,48.654,16.654,50,15,50z"/>
                            <path d="M5,26h2c0-1.654,1.346-3,3-3v-2C7.243,21,5,23.243,5,26z"/>
                            <path d="M15,12v2c1.654,0,3,1.346,3,3h2C20,14.243,17.757,12,15,12z"/>
                            <path d="M24,5v2c1.654,0,3,1.346,3,3h2C29,7.243,26.757,5,24,5z"/>
                        </svg>
                        View Atlas
                    </Link>
                )}

                {(role === "user" || role === "admin") && shouldShow("/library") && (
                    <Link href="/library" className={linkClasses}>
                        <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 32 32">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3.425 13.953c0 0 24.137 0 ..." />
                            <path
                                stroke="currentColor"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="1.5"
                                d="M3.425 13.953c0 0 24.137 0 24.173 0 0.583-0.255 0.557-0.802 0.011-1.165-0.547-0.365-12.119-8.718-12.119-8.718s-11.482 8.353-12.065 8.718c-0.582 0.363-0.619 0.91 0 1.165zM15.49 8.195c0.965 0 1.748 0.782 1.748 1.747s-0.783 1.748-1.748 1.748-1.747-0.783-1.747-1.748 0.782-1.747 1.747-1.747zM4.027 26.932h22.968v-0.977h-22.968v0.977zM9 24.936v-8.903h0.978v-1.103h-4.993v1.003h0.978v9.002h3.037zM17.030 24.936v-8.966h0.978v-0.978h-4.992v0.94h0.977v9.002h3.037zM3.030 28.93h24.963v-0.914h-24.963v0.914zM24.998 24.936v-8.966h0.978v-0.978h-4.993v0.94h0.979v9.002h3.036z"
                                />
                        </svg>
                        My Library
                    </Link>
                )}

                {(role === "user" || role === "admin") && shouldShow("/search-results") && (
                    <Link href="/search-results" className={linkClasses}>
                        <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 26 26">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.29289 1.29289 ..." />
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" fillRule="evenodd" clipRule="evenodd" d="M9.29289 1.29289C9.48043 1.10536 9.73478 1 10 1H18C19.6569 1 21 2.34315 21 4V8C21 8.55228 20.5523 9 20 9C19.4477 9 19 8.55228 19 8V4C19 3.44772 18.5523 3 18 3H11V8C11 8.55228 10.5523 9 10 9H5V20C5 20.5523 5.44772 21 6 21H10C10.5523 21 11 21.4477 11 22C11 22.5523 10.5523 23 10 23H6C4.34315 23 3 21.6569 3 20V8C3 7.73478 3.10536 7.48043 3.29289 7.29289L9.29289 1.29289ZM6.41421 7H9V4.41421L6.41421 7ZM20.1716 18.7574C20.6951 17.967 21 17.0191 21 16C21 13.2386 18.7614 11 16 11C13.2386 11 11 13.2386 11 16C11 18.7614 13.2386 21 16 21C17.0191 21 17.967 20.6951 18.7574 20.1716L21.2929 22.7071C21.6834 23.0976 22.3166 23.0976 22.7071 22.7071C23.0976 22.3166 23.0976 21.6834 22.7071 21.2929L20.1716 18.7574ZM13 16C13 14.3431 14.3431 13 16 13C17.6569 13 19 14.3431 19 16C19 17.6569 17.6569 19 16 19C14.3431 19 13 17.6569 13 16Z"/>
                        </svg>
                        Paper Search
                    </Link>
                )}

                {(role === "user" || role === "admin") && shouldShow("/notes") && (
                    <Link href="/notes" className={linkClasses}>
                        <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 22 22">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3V5M12 3V5M15 3V5 ..." />
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3V5M12 3V5M15 3V5M13 9H9M15 13H9M8.2 21H15.8C16.9201 21 17.4802 21 17.908 20.782C18.2843 20.5903 18.5903 20.2843 18.782 19.908C19 19.4802 19 18.9201 19 17.8V7.2C19 6.0799 19 5.51984 18.782 5.09202C18.5903 4.71569 18.2843 4.40973 17.908 4.21799C17.4802 4 16.9201 4 15.8 4H8.2C7.0799 4 6.51984 4 6.09202 4.21799C5.71569 4.40973 5.40973 4.71569 5.21799 5.09202C5 5.51984 5 6.07989 5 7.2V17.8C5 18.9201 5 19.4802 5.21799 19.908C5.40973 20.2843 5.71569 20.5903 6.09202 20.782C6.51984 21 7.07989 21 8.2 21Z" />

                        </svg>
                        My Notes
                    </Link>
                )}

                {(role === "user" || role === "admin")&& shouldShow("/maps") && (
                    <Link href="/maps" className={linkClasses}>
                        <svg className="w-5 h-5 mr-1" viewBox="0 0 21 21" fill="none">
                            <path d="M3 17.25L17.25 3a2.12 2.12 0 0 1 3 3L6 20.25H3v-3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M14 6l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        My Maps
                    </Link>
                )}

                {(role === "user" || role === "admin") && shouldShow("/settings") && (
                    <Link href="/settings" className={linkClasses}>
                        <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5Zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5Z"/>
                        </svg>
                        My Account
                    </Link>
                )}

                {role === "admin" && shouldShow("/admin") && (
                    <Link href="/admin" className={linkClasses}>
                        <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v18H3V3z M3 9h18 M9 21V9"/>
                        </svg>
                        Admin Dash
                    </Link>
                )}

                {role === "not user" && (
                    <>
                        <Link href="/login" className={linkClasses}>
                            <span className="mr-1">🔑</span> Sign In
                        </Link>
                        <Link href="/register" className={linkClasses}>
                            <span className="mr-1">✍️</span> Sign Up
                        </Link>
                    </>
                )}

                {/* --- ADMIN ONLY: Manage Dropdown --- */}
                {role === "admin" && (
                <div className="relative group">
                    <button className={`${linkClasses} flex items-center`}>
                    <span className="mr-1">⚙️</span> Manage
                    <svg
                        className="w-4 h-4 ml-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 9l-7 7-7-7"
                        />
                    </svg>
                    </button>

                    {/* DROPDOWN MENU */}
                    <div
                    className="
                        absolute right-0 mt-2 w-40 bg-[var(--panel-bg)]
                        text-[var(--panel-text)] rounded-lg shadow-lg border border-gray-600/20
                        opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto
                        transition duration-150
                    "
                    >
                   <button
                    className="block px-4 py-2 hover:bg-indigo-500 hover:text-white transition-colors rounded"
                    onClick={() => setDashView && setDashView("users")}
                    >
                    Users
                    </button>
                    <button
                    className="block px-4 py-2 hover:bg-indigo-500 hover:text-white transition-colors rounded"
                    onClick={() => setDashView && setDashView("notes")}
                    >
                    Notes
                    </button>
                    <button
                    className="block px-4 py-2 hover:bg-indigo-500 hover:text-white transition-colors rounded"
                    onClick={() => setDashView && setDashView("log")}
                    >
                    Logs
                    </button>

                    </div>
                </div>
                )}

            </div>

            {/* Right side: Theme toggle + Chat + Logout */}
            <div className="flex items-center space-x-4">

                {/* --- THEME TOGGLE --- */}
                <ToggleTheme />

                {/* --- CHAT BUTTON (only if logged in) --- */}
                {role==="user" && (
                    <Link
                        href="/chat"
                        aria-label="Open Chat"
                        title="Open Chat"
                        className="group inline-flex h-10 w-10 items-center justify-center
                                text-indigo-400 hover:text-indigo-300 transition"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            className="h-7 w-7 transition-transform duration-700 group-hover:rotate-[360deg]"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <rect
                                x="3" y="9" width="12" height="12" rx="2.25" ry="2.25"
                                fill="none" stroke="currentColor" strokeWidth="2.25"
                                strokeLinecap="round" strokeLinejoin="round"
                            />
                            <rect
                                x="9" y="3" width="12" height="12" rx="2.25" ry="2.25"
                                fill="none" stroke="currentColor" strokeWidth="2.25"
                                strokeLinecap="round" strokeLinejoin="round"
                            />
                        </svg>
                    </Link>
                )}

                {(role === "user" || role === "admin") && (
                                <>
                                    <button onClick={logOut} className={linkClasses}>
                                        <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 21 21">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 4H18C19.1046 4 20 4.89543 20 6V18C20 19.1046 19.1046 20 18 20H15M8 8L4 12M4 12L8 16M4 12L16 12"/>
                                        </svg>
                                        Logout
                                    </button>
                                </>
                            )}
            </div>

        </nav>
    );
};

export default GeneralSidebar;
