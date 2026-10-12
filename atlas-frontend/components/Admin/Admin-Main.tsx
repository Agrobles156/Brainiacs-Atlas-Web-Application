'use client';

import { useState, useEffect } from "react";
import React from "react";
import GeneralSidebar from "../Sidebar";
import UsersAdminView from "./Users";
import NotesAdminView from "./Notes";
import Log from "./Log";

export default function AdminMain() {
  const [dashView, setDashView] = useState<string>("users");
  const [whoami, setWhoAmI] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const pullWhoAmI = async () => {
      try {
        const response = await fetch(`flask-api/whoami`, { credentials: "include" });
        const data = await response.json();

        if (data.error || data.role !== "admin") {
          window.location.href = "/";
        } else {
          setWhoAmI(data.message);
          setRole(data.role);
        }
      } catch {
        window.location.href = "/";
      }
    };
    pullWhoAmI();
  }, []);

  function RenderDash({ dash }: { dash: string }) {
    if (dash === "users") return <UsersAdminView />;
    if (dash === "notes") return <NotesAdminView />;
    if (dash === "log") return <Log />;
    return <div>Loading View...</div>;
  }

  return (
    <div
      className="
        w-full flex
        bg-[var(--panel-bg)]
        text-[var(--panel-text)]
        transition-colors duration-200
      "
    >
      <GeneralSidebar
        user={whoami}
        role={role}
        onLogoutSuccess={() => setWhoAmI(null)}
        setDashView={setDashView}
      />

      {/* Main Content Area */}
      <div
        className="
          mt-12
          w-full
          h-screen
          bg-[var(--panel-bg)]
          text-[var(--panel-text)]
          transition-colors duration-200
        "
      >
        <div className="p-4">
          <RenderDash dash={dashView} />
        </div>
      </div>
    </div>
  );
}
