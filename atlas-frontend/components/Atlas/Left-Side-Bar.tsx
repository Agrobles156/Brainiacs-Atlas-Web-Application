'use client';

import { useRef, useEffect, useState } from "react";
import ToggleTheme from "@/components/ToggleTheme";
import hierarchyData from "./cns_hierarchyreal.json";
import { ChevronLeft, ChevronRight } from "lucide-react";

type RegionNode = {
  name: string;
  children: RegionNode[];
};

type rightInfo = {
  selectedText: string | null;
  setSelectedText: (text: string) => void;
};

const TreeNode: React.FC<{
  node: RegionNode;
  selectedText: string | null;
  searchTerm: string;
  onSelect: (name: string) => void;
  scrollOnceRef: React.RefObject<boolean>;
}> = ({ node, selectedText, searchTerm, onSelect, scrollOnceRef }) => {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const highlightRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  const isSearchMatch = searchTerm && node.name.toLowerCase().includes(searchTerm.toLowerCase());
  const isSelectedMatch = selectedText && node.name.includes(selectedText);

  const hasMatchInChildren = (n: RegionNode): boolean =>
    n.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (n.children || []).some(hasMatchInChildren);

  useEffect(() => {
    const hasSelectedInChildren = (n: RegionNode): boolean =>
      selectedText ? (n.name.includes(selectedText) || (n.children || []).some(hasSelectedInChildren)) : false;

    const matched =
      (searchTerm && (isSearchMatch || hasMatchInChildren(node))) ||
      isSelectedMatch ||
      hasSelectedInChildren(node);

    if (matched) {
      setExpanded(true);
      if ((isSearchMatch || isSelectedMatch) && !scrollOnceRef.current) {
        setShouldScroll(true);
      }
    }
  }, [searchTerm, selectedText]);

  useEffect(() => {
    if (shouldScroll && highlightRef.current && !scrollOnceRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      scrollOnceRef.current = true;
      setShouldScroll(false);
    }
  }, [shouldScroll]);

  useEffect(() => {
    if ((isSearchMatch || isSelectedMatch) && highlightRef.current && !scrollOnceRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      scrollOnceRef.current = true;
    }
  }, [isSearchMatch, isSelectedMatch]);

  return (
    <div className="ml-2 mt-1">
      <div
        ref={isSearchMatch || isSelectedMatch ? highlightRef : null}
        className={`cursor-pointer text-sm px-1 py-0.5 rounded transition-colors
          ${isSearchMatch || isSelectedMatch
            ? 'bg-green-200 font-bold text-black dark:bg-green-700 dark:text-white'
            : 'text-[var(--panel-text)]'}
        `}
        onClick={() => {
          const match = node.name.match(/\(([A-Z][A-Za-z0-9.\-]+)\)$/);
          const abbreviation = match ? match[1] : node.name;
          onSelect(abbreviation);
        }}
      >
        {hasChildren && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="mr-1 select-none"
          >
            {expanded ? "▼" : "▶"}
          </span>
        )}
        {node.name}
      </div>

      {expanded &&
        hasChildren &&
        node.children.map((child, idx) => (
          <TreeNode
            key={idx}
            node={child}
            selectedText={selectedText}
            searchTerm={searchTerm}
            onSelect={onSelect}
            scrollOnceRef={scrollOnceRef}
          />
        ))}
    </div>
  );
};

const LeftInfoPanel: React.FC<rightInfo> = ({ selectedText, setSelectedText }) => {
  const [hierarchy, setHierarchy] = useState<RegionNode[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currUser, setCurrUser] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const scrollOnceRef = useRef(false);

  // Handle dragging for resize
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };
  const handleMouseMove = (e: MouseEvent) => {
    if (isResizing) {
      const newWidth = Math.min(Math.max(e.clientX, 200), 600); // limit width between 200px and 600px
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

  useEffect(() => {
    scrollOnceRef.current = false;
  }, [searchTerm, selectedText]);

  useEffect(() => {
    setHierarchy(hierarchyData);
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch("flask-api/whoami", { method: "GET", credentials: "include" });
        const data = await response.json();
        setCurrUser(data.message);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        setCurrUser(msg);
        console.error(msg);
      }
    };
    fetchUser();
  }, []);

  return (
    <div
      className={`relative h-screen border-r border-[var(--border-color)] bg-[var(--panel-bg)]
        text-[var(--panel-text)] shadow-md flex transition-all duration-300 ease-in-out
        ${collapsed ? 'w-[40px]' : ''}`}
      style={{ width: collapsed ? "40px" : `${width}px`, minWidth: "40px" }}
    >
      {/* Collapse Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute top-3 -right-3 z-10 bg-[var(--panel-bg)] border border-[var(--border-color)] 
                   rounded-full p-1 shadow hover:bg-[var(--hover-bg)] transition"
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {/* Panel Content */}
      {!collapsed && (
        <div className="flex-1 p-3 overflow-y-auto">
          <p className="font-semibold text-lg mb-2 border-b border-[var(--border-color)] pb-1">
            Current User: {currUser}
          </p>

          <div className="mb-3 flex items-center gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search for a region..."
              className="w-full p-1 text-sm border rounded border-[var(--border-color)] bg-[var(--panel-bg)] 
                         text-[var(--panel-text)] focus:outline-none"
            />
            {(searchTerm || selectedText) && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedText("");
                }}
                className="text-xs text-blue-600 underline whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>

          <p className="font-semibold text-lg mb-2">CNS Hierarchy</p>
          <div
            className="text-sm max-h-full overflow-y-auto border p-2 rounded
                       bg-[var(--panel-bg)] text-[var(--panel-text)] border-[var(--border-color)]
                       transition-colors duration-500"
          >
            {hierarchy.map((node, idx) => (
              <TreeNode
                key={idx}
                node={node}
                selectedText={selectedText}
                searchTerm={searchTerm}
                onSelect={setSelectedText}
                scrollOnceRef={scrollOnceRef}
              />
            ))}
          </div>

          {/* Bottom toggle */}
          <div className="absolute bottom-3 right-2 flex flex-col items-center gap-2">
            <ToggleTheme />
            <span className="text-[var(--panel-text)] text-sm">Brainiacs Inc.</span>
          </div>
        </div>
      )}

      {/* Resize handle */}
      {!collapsed && (
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 right-0 w-1 cursor-ew-resize h-full hover:bg-blue-500/30 transition-colors"
        />
      )}
    </div>
  );
};

export default LeftInfoPanel;
