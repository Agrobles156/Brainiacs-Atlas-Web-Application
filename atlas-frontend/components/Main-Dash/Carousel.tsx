'use client';
import React from "react";

type CardInfo = {
  level: string | null;
  path: string;
};

const cardsInfo: CardInfo[] = [
  { level: "Level 22", path: "/oldSVGs/level-22.svg" },
  { level: "Level 23", path: "/oldSVGs/level-23.svg" },
  { level: "Level 24", path: "/oldSVGs/level-24.svg" },
  { level: "Level 25", path: "/oldSVGs/level-25.svg" },
  { level: "Level 26", path: "/oldSVGs/level-26.svg" },
  { level: "Level 27", path: "/oldSVGs/level-27.svg" },
  { level: "Level 28", path: "/oldSVGs/level-28.svg" },
  { level: "Level 29", path: "/oldSVGs/level-29.svg" },
  { level: "Level 30", path: "/oldSVGs/level-30.svg" },
];

// double list to fake infinite loop
const slides = [...cardsInfo, ...cardsInfo];

export default function MainCar() {
  return (
    <div className="w-full overflow-hidden">
      <div
        className="flex"
        style={{
          width: "200%",                             // two sets of slides side-by-side
          animation: "scrollRight 22s linear infinite", // continuous auto-scroll
        }}
      >
        {slides.map((slide, i) => (
          <div key={i} className="w-1/5 flex-none p-2">
            <div
              className="
                rounded-lg shadow-md border
                border-[var(--border-color)]
                bg-[var(--panel-bg)]
                text-[var(--panel-text)]
                transition-colors duration-300
                p-4
              "
            >
              <div
                className="
                  w-full h-40 rounded-lg overflow-hidden
                  bg-[var(--card-placeholder)]
                  flex items-center justify-center
                  transition-colors duration-300
                "
              >
                <img
                  src={slide.path}
                  alt={slide.level ?? ""}
                  className="w-full h-full object-cover"
                />
              </div>

              <h3 className="mt-2 text-center font-medium">
                {slide.level}
              </h3>
            </div>
          </div>
        ))}
      </div>

      {/* Inline keyframes so NO global CSS needed */}
      <style jsx>{`
        @keyframes scrollRight {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
