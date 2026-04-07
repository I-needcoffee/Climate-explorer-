import React from 'react';
import { EPWVariable } from '../lib/epwParser';
import * as d3 from 'd3';

export interface GradientDef {
  id: string;
  name: string;
  colors: string[];
}

interface InteractiveLegendProps {
  variable: EPWVariable;
  gradientId: string;
  setGradientId: (id: string) => void;
  gradients: GradientDef[];
}

export function InteractiveLegend({ variable, gradientId, setGradientId, gradients }: InteractiveLegendProps) {
  const gradientDef = gradients.find(g => g.id === gradientId) || gradients[0];
  
  // Create a continuous color scale for the legend ticks
  const colorScale = d3.scaleSequential()
    .domain([0, 1])
    .interpolator(d3.interpolateRgbBasis(gradientDef.colors));

  const ticks = d3.ticks(variable.min, variable.max, 5);

  return (
    <div className="bg-white p-3 rounded-xl border border-gray-200 flex flex-col gap-2 w-full shadow-sm">
      <div className="flex justify-between items-center px-1">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{variable.name} ({variable.unit})</span>
        <select
          value={gradientId}
          onChange={(e) => setGradientId(e.target.value)}
          className="text-xs bg-gray-50 border border-gray-200 rounded-md px-2 py-1 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer hover:bg-gray-100 transition-colors"
        >
          {gradients.map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>
      
      <div className="relative h-3 w-full rounded-full overflow-hidden flex border border-gray-200">
        {gradientDef.colors.map((c, i) => (
          <div key={i} className="flex-1 h-full" style={{ backgroundColor: c }} />
        ))}
      </div>
      
      <div className="flex justify-between px-1">
        {ticks.map((t, i) => (
          <span key={i} className="text-[10px] text-gray-500 font-medium">
            {t.toFixed(0)}
          </span>
        ))}
      </div>
    </div>
  );
}
