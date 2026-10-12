'use client';

import GeneralSidebar from "../Sidebar";
import { useState, useEffect } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import MainCar from "./Carousel";

export default function LandingPage() {
  const router = useRouter();
  const [whoami, setWhoAmI] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const pullWhoAmI = async () => {
    try {
      const response = await fetch('/flask-api/whoami', { credentials: 'include' });
      const data = await response.json();

      if (data.error) {
        console.log("Not signed in");
        setRole("not user");
        setWhoAmI(null);
      } else {
        setWhoAmI(data.message);
        setRole(data.role);
      }
    } catch (err) {
      console.error("didn't even get data", err);
      setWhoAmI(null);
      setRole("not user");
    }
  };

  useEffect(() => {
    pullWhoAmI();
  }, []);

  return (
    <div className="w-full transition-colors duration-200 bg-[var(--panel-bg)] text-[var(--panel-text)]">
      <GeneralSidebar user={whoami} role={role} onLogoutSuccess={pullWhoAmI} />

      {/* Main content */}
      <div className="flex flex-col w-full h-screen">
        
        {/* Hero Section */}
        <section
          className="flex flex-col items-center text-center pt-48"
        >
          <a
            href="/atlas"
            className="text-4xl sm:text-5xl font-extrabold hover:underline transition-colors duration-200"
          >
            View Atlas
          </a>

          <p className="mt-3 text-lg opacity-90 max-w-2xl">
            Precision Mapping for Breakthrough Understanding
          </p>
        </section>

        {/* Supported Levels Text */}
        <div className="text-center text-[var(--panel-text)] text-lg opacity-80 mt-auto mb-2">
          Supported Levels in the Atlas
        </div>

        {/* Carousel Section */}
        <div className="w-full relative mb-[5px]">
          <MainCar />
        </div>
      </div>
    </div>
  );
}
