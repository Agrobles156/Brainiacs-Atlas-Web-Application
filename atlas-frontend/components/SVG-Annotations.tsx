import { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface SVGAnnotationsProps {
    svgData: string;
    view: string;
    // level: number;
}

const SVGAnnotations: React.FC<SVGAnnotationsProps> = ({ svgData, view }) => {
    const svgRef = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
        if (svgRef.current && svgData) {
            svgRef.current.innerHTML = svgData;

            const SVGElement = d3.select(svgRef.current); 
            SVGElement.selectAll('.layer').style('display', 'none');
            SVGElement.select(`#${view}`).style('display', 'block');
        } 
    },[svgData, view]);
  

    return (
        <div className = "svg-annotations-container">
            <svg ref={svgRef} className="svg-annotations" width="100%" height="100%"></svg>
        </div>
    );
};

export default SVGAnnotations;