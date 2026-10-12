'use client';

import { Dispatch, SetStateAction, useState, useEffect, useRef } from "react";
import RegionInfo from "./Selected-Region-Info";
import { ChevronLeft, ChevronRight } from "lucide-react";

type rightInfo = {
  selectedLevel: number | null;
  coordinates: { x: number; y: number };
  isCheck: boolean;
  isCheckTest: boolean;
  selectedTiles: string[];
  hoveredTile: string | null;
  hoveredText: string | null;
  selectedText: string | null;
  physicalCoords: { x: number; y: number } | null;
  handleToggleGrid: () => void;
  handleToggleGridTest: () => void;
  toggleLayers: (layerId: string) => void;
  activeLayers: Set<string>;
  setShowStereotaxic: Dispatch<SetStateAction<boolean>>;
  clearTileSelection: () => void;
  selectAllTiles: () => void;
  exportTileData: () => void;
  setSelectedColor: React.Dispatch<React.SetStateAction<string>>;
};

const RightInfoPanel: React.FC<rightInfo> = ({
  selectedLevel,
  coordinates,
  isCheck,
  isCheckTest,
  selectedTiles,
  hoveredTile,
  hoveredText,
  selectedText,
  physicalCoords,
  handleToggleGrid,
  handleToggleGridTest,
  toggleLayers,
  activeLayers,
  setShowStereotaxic,
  clearTileSelection,
  selectAllTiles,
  exportTileData,
  setSelectedColor,
}) => {
  const [activeTab, setActiveTab] = useState("tab1");
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(400);

  // --- Handle dragging for resize (from left edge) ---
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
    startX.current = e.clientX;
    startWidth.current = width;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isResizing) {
      // dragging left (decreasing e.clientX) → wider
      const delta = startX.current - e.clientX;
      const newWidth = Math.min(Math.max(startWidth.current + delta, 240), 600);
      setWidth(newWidth);
    }
  };

  const handleMouseUp = () => setIsResizing(false);


  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    } else {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div
      className={`fixed top-0 right-0 flex flex-col transition-all duration-300 ease-in-out
        h-screen border-l border-[var(--border-color)] shadow-md bg-[var(--panel-bg)] text-[var(--panel-text)]`}
      style={{
        width: collapsed ? "40px" : `${width}px`,
        minWidth: "40px",
        transform: collapsed ? "translateX(calc(100% - 40px))" : "translateX(0)",
      }}
    >
      {/* Collapse Button — on the LEFT edge */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute top-3 left-2 z-10 bg-[var(--panel-bg)] border border-[var(--border-color)]
                   rounded-full p-1 shadow hover:bg-[var(--hover-bg)] transition"
      >
        {/* When collapsed, show LEFT arrow (to open); when open, show RIGHT arrow (to close) */}
        {collapsed ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

      {/* Content when expanded */}
      {!collapsed && (
        <div className="overflow-y-auto p-3">
          <p className="font-semibold text-lg mb-2 border-b border-[var(--border-color)] pb-1">
            Atlas Level: {selectedLevel !== null ? selectedLevel : "N/A"}
          </p>

          {/* Tabs */}
          <div className="flex border-b border-[var(--border-color)]">
            <button
              onClick={() => setActiveTab("tab1")}
              className={`px-4 py-2 -mb-px font-semibold border-b-2 transition-colors duration-300
                ${
                  activeTab === "tab1"
                    ? "border-[var(--panel-text)] text-[var(--panel-text)]"
                    : "border-transparent opacity-70 hover:opacity-100"
                }`}
            >
              Atlas Info
            </button>
            <button
              onClick={() => setActiveTab("tab2")}
              className={`px-4 py-2 -mb-px font-semibold border-b-2 transition-colors duration-300
                ${
                  activeTab === "tab2"
                    ? "border-[var(--panel-text)] text-[var(--panel-text)]"
                    : "border-transparent opacity-70 hover:opacity-100"
                }`}
            >
              Region Info
            </button>
          </div>

          {/* Tab Content */}
          <div className="mt-3">
            {activeTab === "tab1" && (
              <div>
                <p className="font-semibold text-lg">Region Info</p>
                <pre>Hovered: {hoveredText || "None"}</pre>
                <pre>Selected: {selectedText || "None"}</pre>

                <p className="font-semibold text-lg mt-3">Tiles Info</p>
                <pre>
                  Hovered Tile: {hoveredTile ? hoveredTile.slice(5, 7) : "None"}
                </pre>

                <div className="grid grid-cols-5 gap-1 text-sm max-h-40 overflow-y-auto pl-2">
                  {selectedTiles.length > 0 ? (
                    selectedTiles.map((tile) => (
                      <div
                        key={tile}
                        className="border border-[var(--border-color)] rounded-md text-center px-1"
                      >
                        {tile.slice(5, 7)}
                      </div>
                    ))
                  ) : (
                    <div className="col-span-5 opacity-70">None Selected</div>
                  )}
                </div>

                {/* Color Selection */}
                <div className="pl-2 mt-3">
                  <label className="text-sm font-medium block mb-1 pl-1">
                    Tile Highlight Color
                  </label>
                  <select
                    onChange={(e) => setSelectedColor(e.target.value)}
                    className="w-full border rounded border-[var(--border-color)] px-2 py-1 text-sm
                               bg-[var(--panel-bg)] text-[var(--panel-text)]"
                  >
                    <option value="blue">Blue</option>
                    <option value="red">Red</option>
                    <option value="yellow">Yellow</option>
                    <option value="cyan">Cyan</option>
                    <option value="white">No color</option>
                  </select>
                </div>

                {/* Buttons */}
                <div className="flex gap-2 my-3 pl-2">
                  <button
                    className="px-2 py-0.5 text-xs rounded bg-[var(--panel-text)] text-[var(--panel-bg)]
                               hover:opacity-80 transition"
                    onClick={clearTileSelection}
                  >
                    Clear
                  </button>
                  <button
                    className="px-2 py-0.5 text-xs rounded bg-[var(--panel-text)] text-[var(--panel-bg)]
                               hover:opacity-80 transition"
                    onClick={selectAllTiles}
                  >
                    Select All
                  </button>
                  <button
                    className="px-2 py-0.5 text-xs rounded bg-[var(--panel-text)] text-[var(--panel-bg)]
                               hover:opacity-80 transition"
                    onClick={exportTileData}
                  >
                    Export
                  </button>
                </div>

                {/* Layers */}
                <p className="font-semibold text-lg mt-3">Layer Selection</p>
                <div className="space-y-2 mt-1">
                  {[
                    ["Grid_-_Solid_Color_-_Opacity_25_x25_", "Grid - Solid"],
                    ["layer-MC7", "Stereotaxic Coordinates"],
                    ["layer-MC6", "Box for Database/3D Model"],
                    ["layer-MC5", "Nissl-Stain"],
                    ["layer-MC4", "Blue Ventricle Overlay"],
                    ["layer-MC3", "Mapping Atlas"],
                    ["layer-MC2", "Subdivision Color Coding"],
                    ["layer-MC1", "Yellow Mask"],
                    ["layer-MC0", "Physical Coordinates"],
                  ].map(([id, label]) => (
                    <label key={id} className="flex items-center space-x-2 pl-1">
                      <input
                        type="checkbox"
                        checked={activeLayers.has(id)}
                        onChange={() => toggleLayers(id)}
                        className="rounded border-[var(--border-color)]"
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "tab2" && (
              <div className="h-full overflow-y-auto">
                <RegionInfo selectedRegion={selectedText} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resize handle (on LEFT edge) */}
      {!collapsed && (
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 left-0 w-1 cursor-ew-resize h-full hover:bg-blue-500/30 transition-colors"
        />
      )}
    </div>
  );
};

export default RightInfoPanel;
