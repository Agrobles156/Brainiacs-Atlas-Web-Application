'use client';

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import React from "react";
import SVGCarousel from "./Layers-Section";
import RightInfoPanel from "./Right-Side-Bar";
import LeftInfoPanel from "./Left-Side-Bar";

type Coordinates = { x: number; y: number };

interface TileSource {
  type: "image";
  url: string;
}

export default function BrainAtlasViewer() {
    const svgContainerRef = useRef<SVGSVGElement | null>(null);
    const [coordinates, setCoordinates] = useState<Coordinates>({ x: 0, y: 0 });
    const [selectedLevel, setSelectedLevel] = useState(29);
    const [selectedLayer, setSelectedLayer] = useState<string>('Atlas');
    const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(['layer-MC3']))
    const [viewingImage, setViewImage] = useState("levels/level-29.svg");
    const [images, setImages] = useState<TileSource[]>([
    {
      type: "image",
      url: viewingImage,
    }])

    const [selectedTile, setSelectedTile] = useState<string | null>(null);
    const [hoveredTile, setHoveredTile] = useState<string | null>(null);
    const [selectedText, setSelectedText] = useState<string | null>(null);
    const [hoveredText, setHoveredText] = useState<string | null>(null);
    const [isCheck, setIsCheck] = useState(false);
    const [isCheckTest, setIsCheckTest] = useState(false);
    const [overlaySVG, setOverlaySVG] = useState<string | null>(null); // New state for overlay SVG
    const [showStereotaxic, setShowStereotaxic] = useState<boolean>(false); // State for showing stereotaxic coordinates

    // const levelSelection = Array.from({length : 74}, (_, i) => i + 1);
    const levelSelection = [22,23,24,25,26,27,28,29,30]

    // const layers = [
    //   'Stereotaxic Coordinates',
    //   'Box for Database/3D Model',
    //   'Nissl‐Stain',
    //   'Blue Ventricle Overlay',
    //   'Atlas',
    //   'Subdivision Color Coding',
    //   'Yellow Background',
    //   'Base Map',
    //   'Physical Coordinates'
    //   ];

    // handle the level change
    const handleLevelChange = (levelSelection: number) => {
        const path = `levels/level-${levelSelection}.svg`;
        setSelectedLevel(levelSelection)
        setViewImage(path)
        setOverlaySVG(null); // Reset overlay when level changes
        setShowStereotaxic(false); // Hide stereotaxic coordinates when level changes
        setImages([{
        type: "image",
        url: path,
        }])
        setIsCheck(false)
    }

    // handle the view change
    // const handleLayerChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    //   setSelectedLayer(event.target.value);
    // };

    const toggleLayers = (layerId: string) => {
      setActiveLayers(prev => {
        const layer = new Set(prev);
        // if (layerId === "layer-MC7") {
        //   setShowStereotaxic((prev) => !prev); // Toggle the state for the stereotaxic overlay
        //   layerId = 'grid'
        // }
        if(layer.has(layerId)) {
          layer.delete(layerId)
        } else {
          layer.add(layerId);
          }
          return layer;
        });
      };

    // const handleLevelChange = (svgName: string) => {
    //     const path = `levels/${svgName}.svg`;
    //     setSelectedLevel(svgName)
    //     setViewImage(path)
    //     setImages([{
    //     type: "image",
    //     url: path,
    //     }])
    //     setIsCheck(false)
    // }

    // Handle the toggling of the grid
    const handleToggleGrid = () => {
        console.log(isCheck)
        if (!isCheck) {
        setViewImage("completes/level-"+selectedLevel+"-grid-brain.svg") 
        } else {
        console.log("here")
        setViewImage("levels/level-"+selectedLevel+".svg")
        }
        setIsCheck(!isCheck)
    }

    // Handle the toggling of the grid test (it wont add on top of the img, its one or the other)
    const handleToggleGridTest = () => {
        console.log(isCheckTest)
        if (!isCheckTest) {
        setViewImage("grid/level-"+selectedLevel+"-grid.svg")
        } else {
        console.log("here")
        setViewImage("levels/level-"+selectedLevel+".svg")
        }
        setIsCheckTest(!isCheckTest)
    }

    useEffect(() => {
        if (!svgContainerRef.current) return;

        d3.select(svgContainerRef.current).selectAll("*").remove();
        

        d3.xml(viewingImage).then((data) => {
          const importedNode = document.importNode(data.documentElement, true);
          d3.select(svgContainerRef.current).node()?.appendChild(importedNode);

          const svg = d3.select(svgContainerRef.current).select("svg");
          const svgElement = svg as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>;


          svgElement.attr("width", "100%").attr("height", "600px");

          /*const zoom = d3.zoom<SVGSVGElement, unknown>()
              .scaleExtent([0.5, 5])
          .on("zoom", ({ transform }) => {
            svgElement.select("g").attr("transform", transform);
          });*/

          if (!svgContainerRef.current) return;

          const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([1, 5]) // Min and max zoom levels
            .on("zoom", (event) => {
              d3.select(svgContainerRef.current).select("svg")
              .attr("transform", event.transform);
            });

        d3.select(svgContainerRef.current).call(zoom);

        const handleDoubleClick = (event: React.MouseEvent) => {
          if (!svgContainerRef.current) return;
        
          const svgNode = svgContainerRef.current; // Get viewer container
          const currentTransform = d3.zoomTransform(svgNode); // Get current zoom state
          const scaleFactor = currentTransform.k === 1 ? 2 : 1; // Toggle zoom in/out
        
          // Apply zoom transformation to the viewer
          d3.select(svgNode)
            .transition()
            .duration(500)
            .call(
              zoom.transform,
              d3.zoomIdentity.scale(scaleFactor) // Zoom centered on the current view
            );
        };
        
        // Mouse tracking for coordinates
        svgElement.on("mousemove", function (event) {
          const svgElement = this as SVGElement;
          const [x, y] = d3.pointer(event);
          const bbox = svgElement.getBoundingClientRect();
          const normalizedX = ((x / bbox.width) * 22) - 11;
          const normalizedY = 1 + ((y / bbox.height) * 10);
          setCoordinates({ x: parseFloat(normalizedX.toFixed(0)), y: parseFloat(normalizedY.toFixed(0)) });
        });

      // Handle overlay SVG (Stereotaxic Coordinates or other overlays)
      if (showStereotaxic) {
        d3.xml(`grid/level-${selectedLevel}-grid.svg`).then((overlayData) => {
          const overlayNode = document.importNode(overlayData.documentElement, true);
  
          // Append the overlay to the SVG container
          const svgElement = d3.select(svgContainerRef.current);
          svgElement.node()?.appendChild(overlayNode);
  
          // Select all rectangles (tiles) within the overlay
          const tiles = svgElement.selectAll("rect");
  
          tiles
            .on("mouseover", function () {
            const tile = d3.select(this);
             tile.attr("fill", "yellow")
            .attr("stroke", "black")
            .attr("stroke-width", 3);  // Highlight tile on hover

            // Set hovered tile ID to display
            setHoveredTile(tile.attr("id"));
          })
            .on("mouseout", function () {
              const tile = d3.select(this);
              tile.attr("fill", "blue")
            .attr("stroke", "none");  // Reset color if not selected

          // Clear hovered tile ID
          setHoveredTile(null);
          })
          .on("click", function () {
          const tile = d3.select(this);

          // Set selected tile ID to display
           setSelectedTile(tile.attr("id"));      
          });
       
        }); 
      }

        // Select all text elements
        svgElement.selectAll("text")
          .style("cursor", "pointer") // Change cursor to pointer on hover
          .on("mouseover", function () {
          setHoveredText(d3.select(this).text());
          d3.select(this).style("cursor", "pointer"); // Ensure pointer cursor
        })
          .on("mouseout", function () {
          setHoveredText(null);
        })
          .on("click", function () {
          const selectedTextValue = d3.select(this).text();
          setSelectedText(selectedTextValue);

          // Highlight the selected text
          svgElement.selectAll("text").attr("fill", "black"); // Reset all text color
          d3.select(this).attr("fill", "red"); // Highlight selected text
        });
             
        // select all tiles
        const tiles = svgElement.selectAll("rect");

        // add interactivity to tiles
        tiles
          .on("mouseover", function () {
            d3.select(this).attr("fill", "yellow")  // Highlight tile on hover
              .attr("stroke", "black")  // Add border
              .attr("stroke-width", 3);  // Make border bold
            setHoveredTile(d3.select(this).attr("id").slice(5,7) || "Unknown");
          })
          .on("mouseout", function () {
            if (selectedTile !== d3.select(this).attr("id")) {
              d3.select(this).attr("fill", "blue")  // Reset color if not selected
                .attr("stroke", "none");  // Remove border on mouse out
            }
            setHoveredTile(null);
          })
          .on("click", function () {
            const tileID = d3.select(this).attr("id") || "Unknown";
            setSelectedTile(tileID.slice(5,7));

            // highlight selected tile
            tiles.attr("fill", "blue");  // Reset all tiles
            d3.select(this).attr("fill", "red")  // Mark clicked tile as red
              .attr("stroke", "black")  // Add border
              .attr("stroke-width", 3);  // Make border bold

          // zoom into the clicked tile
          const bbox = (this as SVGRectElement).getBBox();  // Casting `this` to `SVGRectElement`
          const [x, y, width, height] = [bbox.x, bbox.y, bbox.width, bbox.height];
          const scale = Math.min(5, 1 / Math.max(width / 600, height / 600));
          const translateX = 300 - (x + width / 2) * scale;
          const translateY = 300 - (y + height / 2) * scale;

          svgElement.transition().duration(500).call(
            zoom.transform,
            d3.zoomIdentity.translate(translateX, translateY).scale(scale)
          );
        }); 

         //add double click zoom
        svgElement.on("dblclick", function (event) {
          const [x, y] = d3.pointer(event);
          const scale = 2; // Zoom level, adjust as needed
          const translateX = 300 - x * scale;
          const translateY = 300 - y * scale;

          svgElement.transition().duration(500).call(
            zoom.transform,
            d3.zoomIdentity.translate(translateX, translateY).scale(scale)
          );
      });

      // Handle grid interactivity
      svgElement.selectAll("path")
        .on("mouseover", function () {
          d3.select(this).attr("fill", "red");
        })
        .on("mouseout", function () {
          d3.select(this).attr("fill", "blue");
        });

        // Hide all layers by default
        svgElement.selectAll("g").attr("style", "display: none");
        
        activeLayers.forEach((layerId) => {
          const layer = svgElement.select(`#${layerId}`);
          layer.attr("style", "display: inline");
          if(layerId.startsWith('Grid')) { // I don't like how we have to go through the parent folder to get to the grid, not as straight forward
            svgElement.select("#layer-grid").attr("style", "display: inline"); // We'd somehow have to make the individual colored and solid tiles into one single layer w/o sub-layers
          }
        });
    });
  }, [viewingImage, activeLayers, showStereotaxic, selectedLevel]);
  
  return (
        <div className="w-full h-full">
            <div className="flex items-start justify-center">

                {/* Left info panel */}
                <div className="flex flex-col bg-white w-2/12">
                    <LeftInfoPanel selectedText={selectedText}/>
                </div>

                {/* Main container */}
                <div className="flex-1 flex-col w-8/12 h-full">
                 {/* set h-full for it not to be weird */}
                  <div className="h-[75vh] rounded-xl border-2">

                    {/* Selection Boxes */}
                    <div className = "inline-flex gap-x-4 pl-4 pt-2">
                      {/* Level Selection */}
                      <div className = "mb-4 inline-flex items-center">
                        <label className = "text-sm font-medium mr-2">Brain Level: </label>
                          <select value = {selectedLevel} onChange = {(e) => handleLevelChange(Number(e.target.value))}
                            className = "inline-flex justify-left rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-900 ring-1 shadow-xs ring-gray-300 ring-inset hover:bg-gray-200"
                          >
                            { levelSelection.map(level => (
                              <option key = {level} value = {level}>
                                {level}
                              </option>
                              ))
                            }
                          </select>
                      </div>
                    </div>
                    {/* Selection Boxes END */}
                            
                    {/* Main Container */}
                    {/* use h-[85vh] */}
                    <svg ref={svgContainerRef} className="w-full h-full"></svg>
                  </div>
                              
                  {/* Erik's carousel */}
                  {/* I'm going to remove it for now */}
                  {/* <div className="h-[20vh]">
                    <SVGCarousel levelClick={handleLevelChange}/>
                  </div> */}
                </div>
                
                {/* Right info panel */}
                <div className="flex flex-col bg-white w-2/12">
                  <RightInfoPanel 
                      selectedLevel={selectedLevel} 
                      coordinates={coordinates} 
                      isCheck={isCheck}
                      isCheckTest={isCheckTest}
                      selectedTile={selectedTile?.slice(5,7)} 
                      hoveredTile={hoveredTile?.slice(5,7)} 
                      selectedText={selectedText} 
                      hoveredText={hoveredText}
                      handleToggleGrid={handleToggleGrid} 
                      handleToggleGridTest={handleToggleGridTest}
                      activeLayers={activeLayers}
                      toggleLayers={toggleLayers}
                      setShowStereotaxic={setShowStereotaxic}
                  />
                </div>

            </div>
        // </div>
       
  );
} 