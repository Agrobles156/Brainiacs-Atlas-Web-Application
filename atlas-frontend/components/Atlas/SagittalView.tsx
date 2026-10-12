'use client';

import React, { useRef, useState } from 'react';

type SagittalButton = {
  id: string;
  topPercent: number;      // % from top
  heightPercent: number;   // % height of button
  xPercent?: number;       // % from left (new)
  label?: string;
  onClick?: () => void;
};

type SagittalViewProps = {
  imageSrc: string;        // Path to sagittal image
  buttons: SagittalButton[];
  overlayOpacity?: number;
  imageHeight?: string;    // e.g., "85vh"
  onSelectLayer?: (layerId: string) => void; // callback to parent
};

export default function SagittalView({
  imageSrc,
  buttons,
  overlayOpacity = 0.0,
  imageHeight = '45vh',
  onSelectLayer,
}: SagittalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string>('');

  return (
    <div
      ref={containerRef}
      className="relative w-full flex flex-col justify-start items-center"
      style={{ height: imageHeight }}
    >
      <div className="relative w-full flex justify-center items-start" style={{ flex: 1 }}>
        {/* Base Image */}
        <img
          src={imageSrc}
          alt="Sagittal View"
          className="max-h-[80vh] w-auto rounded-md object-contain"
        />

        {/* Transparent Overlay */}
        <div
          className="absolute top-0 left-0 w-full h-full"
          style={{ backgroundColor: `rgba(0,0,0,${overlayOpacity})` }}
        >
          {buttons.map((btn) => (
            <button
              key={btn.id}
              className="absolute rounded-sm transition-all duration-200"
              style={{
                top: `${btn.topPercent}%`,
                height: `${btn.heightPercent}%`,
                width: '2px', // narrow vertical line
                left: `${btn.xPercent ?? 50}%`,
                transform: 'translateX(-50%)',
                backgroundColor: hoveredLabel === btn.label ? 'darkgreen' : 'red',
              }}
              onMouseEnter={() => setHoveredLabel(btn.label ?? '')}
              onMouseLeave={() => setHoveredLabel('')}
              onClick={() => {
                if (onSelectLayer && btn.label) {
                  onSelectLayer(btn.label);
                }
              }}

            />
          ))}
        </div>
      </div>

      {/* Hover Label */}
      <div
        className="mt-2 text-sm h-6 transition-colors duration-200"
        style={{ color: 'var(--panel-text)' }}
      >
        {hoveredLabel ? `Currently hovering: Layer ${hoveredLabel}` : ''}
      </div>
    </div>
  );
}
