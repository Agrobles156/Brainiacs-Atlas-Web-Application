// atlas-frontend/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import React from "react";
import XssInputGuard from "./XssInputGuard";

export const metadata: Metadata = {
  title: "Rat Brain Atlas",
  description: "Precision Mapping for Breakthrough Understanding",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning={true} style={{background: '#1C2532', color: '#F7F7F7'}}>
        {/* Global client-side guard that truncates inputs when a <script> tag is completed */}
        {/* It never touches password fields */}
        <XssInputGuard />
        {children}
      </body>
    </html>
  );
}
