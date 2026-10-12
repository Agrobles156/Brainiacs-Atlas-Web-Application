"use client";

import { PenTool, Eraser, Square, Circle, Move, ChevronLeft, ChevronRight } from "lucide-react";
import React, { useState } from "react";

interface ToolsSidebarProps {
  tool: string;
  setTool: (value: any) => void;
  color: string;
  setColor: (v: string) => void;
  lineWidth: number;
  setLineWidth: (v: number) => void;
  clearCanvas: () => void;
  saveCanvas: () => void;
}

export default function ToolsSidebar({
  tool,
  setTool,
  color,
  setColor,
  lineWidth,
  setLineWidth,
  clearCanvas,
  saveCanvas,
}: ToolsSidebarProps) {
  const [open, setOpen] = useState(true);

  const tools = [
    { id: "pen", icon: PenTool },
    { id: "eraser", icon: Eraser },
    { id: "rectangle", icon: Square },
    { id: "circle", icon: Circle },
    { id: "move", icon: Move },
  ];

  return (
    <div className="relative">
      {/* Collapse Button */}
      <button
        onClick={() => setOpen(!open)}
        className="absolute left-[-35px] top-4 bg-[var(--panel-bg)] text-[var(--panel-text)] p-1 rounded-lg
                   hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.1)] transition"
      >
        {open ? <ChevronRight /> : <ChevronLeft />}
      </button>

      {/* Sidebar */}
      <div
        className={`
          h-full
          bg-[var(--panel-bg)] text-[var(--panel-text)]
          border-l border-[var(--panel-border)]
          transition-all duration-300
          flex flex-col items-center p-4 gap-5
          ${open ? "w-52 opacity-100" : "w-12 opacity-50"}
        `}
      >
        {/* Tool Buttons */}
        {tools.map((t) => {
          const Icon = t.icon;
          const isActive = tool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTool(t.id as any)}
              className={`
                w-full flex items-center gap-3 p-2 rounded-xl
                hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.1)]
                transition
                ${isActive ? "bg-[rgba(0,0,0,0.1)] dark:bg-[rgba(255,255,255,0.15)]" : ""}
              `}
            >
              <Icon />
              {open && <span className="capitalize text-sm">{t.id}</span>}
            </button>
          );
        })}

        {/* Color Picker */}
        <div className="w-full">
          {open && <label className="text-sm mb-1 block">Color</label>}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Line Width */}
        <div className="w-full">
          {open && <label className="text-sm mb-1 block">Line Width</label>}
          <input
            type="range"
            min={1}
            max={20}
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Actions */}
        <button
          onClick={clearCanvas}
          className="w-full mt-4 p-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition"
        >
          {open ? "Clear" : "X"}
        </button>

        <button
          onClick={saveCanvas}
          className="w-full p-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition"
        >
          {open ? "Save" : "💾"}
        </button>
      </div>
    </div>
  );
}
