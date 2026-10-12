"use client";

import { useEffect } from "react";

// Truncate at the first completed <script ...> opening tag
const SCRIPT_OPEN_RE = /<\s*script\b/i;

export default function XssInputGuard() {
  useEffect(() => {
    const handler = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;

      // Only affect textual inputs and textareas; never touch passwords
      if (t instanceof HTMLInputElement) {
        if ((t.type || "text").toLowerCase() === "password") return;
        const v = t.value ?? "";
        const idx = v.search(SCRIPT_OPEN_RE);
        if (idx !== -1) {
          const gtPos = v.indexOf(">", idx);
          if (gtPos !== -1) {
            // Truncate before the <script tag and notify React
            t.value = v.slice(0, idx);
            // fire an input event so controlled components update
            t.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
      } else if (t instanceof HTMLTextAreaElement) {
        const v = t.value ?? "";
        const idx = v.search(SCRIPT_OPEN_RE);
        if (idx !== -1) {
          const gtPos = v.indexOf(">", idx);
          if (gtPos !== -1) {
            t.value = v.slice(0, idx);
            t.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
      }

      // If needed later, we can add contenteditable handling here.
    };

    // Use capture to catch events early
    window.addEventListener("input", handler, true);
    return () => window.removeEventListener("input", handler, true);
  }, []);

  return null;
}