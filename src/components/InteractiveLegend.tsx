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
  fontScale?: number;
}

export function InteractiveLegend({ 
  variable, 
  gradientId, 
  setGradientId, 
  gradients, 
  theme = 'light',
  fontScale = 1
}: InteractiveLegendProps & { theme?: 'light' | 'dark' }) {
  const gradientDef = gradients.find(g => g.id === gradientId) || gradients[0];
  
  // Create a continuous color scale for the legend ticks
  const colorScale = d3.scaleSequential()
    .domain([0, 1])
    .interpolator(d3.interpolateRgbBasis(gradientDef.colors));

  const ticks = d3.ticks(variable.min, variable.max, 5);

  return (
    <div 
      className={`border flex flex-col w-full shadow-sm transition-colors ${theme === 'dark' ? 'bg-gray-800/50 border-gray-800' : 'bg-white border-gray-200'}`}
      style={{ padding: `${12 * fontScale}px`, gap: `${8 * fontScale}px`, borderRadius: `${12 * fontScale}px` }}
    >
      <div className="flex justify-between items-center px-1">
        <span className={`font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`} style={{ fontSize: `${12 * fontScale}px` }}>{variable.name} ({variable.unit})</span>
      </div>
      
      <div className={`relative w-full rounded-full overflow-hidden flex border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`} style={{ height: `${12 * fontScale}px` }}>
        {gradientDef.colors.map((c, i) => (
          <div key={i} className="flex-1 h-full" style={{ backgroundColor: c }} />
        ))}
      </div>
      
      <div className="flex justify-between px-1">
        {ticks.map((t, i) => (
          <span key={i} className={`font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} style={{ fontSize: `${10 * fontScale}px` }}>
            {t.toFixed(0)}
          </span>
        ))}
      </div>
    </div>
  );
}
