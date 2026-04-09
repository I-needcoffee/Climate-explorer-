import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import SunCalc from 'suncalc';
import { EPWDataRow, EPWMetadata, EPWVariable } from '../lib/epwParser';
import { InteractiveLegend, GradientDef } from './InteractiveLegend';
import { X, Settings2 } from 'lucide-react';

import { GlobalFilterState } from './GlobalFilterPanel';
import { UnitSystem } from '../App';

interface SunPathProps {
  metadata: EPWMetadata;
  data: EPWDataRow[];
  variables: EPWVariable[];
  onRemove?: () => void;
  gradients: GradientDef[];
  filter: GlobalFilterState;
  unitSystem: UnitSystem;
  heatmapTextColor: string;
  theme: 'light' | 'dark';
  setShowGradientModal: (show: boolean) => void;
}

export function SunPath({ 
  metadata, data, variables, onRemove, gradients, filter, unitSystem, heatmapTextColor, theme, 
  setShowGradientModal
}: SunPathProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [aggregation, setAggregation] = useState<'hour' | 'day' | 'week' | 'month'>('week');
  const [colorVar, setColorVar] = useState(variables[0]?.id || '');
  const [radiusVar, setRadiusVar] = useState(variables.find(v => v.id === 'globalHorizontalRadiation')?.id || variables[0]?.id || '');
  const [gradientId, setGradientId] = useState(gradients[0].id);
  const [radiusMin, setRadiusMin] = useState<number | string>(2);
  const [radiusMax, setRadiusMax] = useState<number | string>(10);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400 });

  useEffect(() => {
    if (!outerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        const newWidth = Math.round(entry.contentRect.width);
        setDimensions(prev => {
          if (prev.width === newWidth) return prev;
          return { width: newWidth };
        });
      }
    });
    observer.observe(outerRef.current);
    return () => observer.disconnect();
  }, []);

  const scale = dimensions.width / 400;

  // Group variables by category
  const groupedVariables = variables.reduce((acc, variable) => {
    const category = variable.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(variable);
    return acc;
  }, {} as Record<string, EPWVariable[]>);

  const colorVarDef = variables.find(v => v.id === colorVar) || variables[0];
  const radiusVarDef = variables.find(v => v.id === radiusVar) || variables[0];

  const convertValue = (val: number | null | undefined, unit: string) => {
    if (val === null || val === undefined) return 0;
    if (unitSystem === 'imperial') {
      if (unit === '°C') return val * 9/5 + 32;
      if (unit === 'm/s') return val * 2.23694;
      if (unit === 'mm') return val / 25.4;
    }
    return val;
  };

  const convertUnit = (unit: string) => {
    if (unitSystem === 'imperial') {
      if (unit === '°C') return '°F';
      if (unit === 'm/s') return 'mph';
      if (unit === 'mm') return 'in';
    }
    return unit;
  };

  // Calculate local stats for filtered data
  const filteredData = data.filter(d => {
    const isMonthMatch = filter.startMonth <= filter.endMonth
      ? (d.month >= filter.startMonth && d.month <= filter.endMonth)
      : (d.month >= filter.startMonth || d.month <= filter.endMonth);
    return isMonthMatch && 
           d.hour >= filter.startHour && 
           d.hour <= filter.endHour;
  });

  const stats = {
    avg: convertValue(d3.mean(filteredData, d => d[colorVar] as number) || 0, colorVarDef.unit),
    min: convertValue(d3.min(filteredData, d => d[colorVar] as number) || 0, colorVarDef.unit),
    max: convertValue(d3.max(filteredData, d => d[colorVar] as number) || 0, colorVarDef.unit),
    total: convertValue(d3.sum(filteredData, d => d[colorVar] as number) || 0, colorVarDef.unit),
    count: filteredData.length
  };

  const cUnit = convertUnit(colorVarDef.unit);

  useEffect(() => {
    if (!svgRef.current || !data.length || dimensions.width === 0) return;

    const BASE_WIDTH = 400;
    const width = BASE_WIDTH;
    const height = 500;
    const margin = 30;
    const radius = Math.min(width, height) / 2 - margin;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    // Scales
    const rScale = d3.scaleLinear().domain([90, 0]).range([0, radius]); // Altitude 90 at center, 0 at edge
    const aScale = d3.scaleLinear().domain([0, 360]).range([0, 2 * Math.PI]); // Azimuth

    // Calculate sun positions and aggregate
    let points: any[] = [];
    
    if (aggregation === 'hour') {
      points = data.map(d => {
        const pos = SunCalc.getPosition(d.date, metadata.lat, metadata.lng);
        const altitude = pos.altitude * 180 / Math.PI;
        const azimuth = (pos.azimuth * 180 / Math.PI + 180) % 360; // Convert to 0=N, 90=E
        return { ...d, altitude, azimuth };
      }).filter(d => d.altitude > 0);
    } else {
      // Aggregate data by hour of day, then by the selected period
      // This creates an "average day" for the period
      let groups;
      if (aggregation === 'day') {
        groups = d3.group(data, d => d.dayOfYear, d => d.hour);
      } else if (aggregation === 'week') {
        groups = d3.group(data, d => Math.floor((d.dayOfYear - 1) / 7), d => d.hour);
      } else { // month
        groups = d3.group(data, d => d.month, d => d.hour);
      }

      Array.from(groups).forEach(([period, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          // Use the middle date of the period for sun position calculation
          const midDate = values[Math.floor(values.length / 2)].date;
          const pos = SunCalc.getPosition(midDate, metadata.lat, metadata.lng);
          const altitude = pos.altitude * 180 / Math.PI;
          
          if (altitude > 0) {
            const azimuth = (pos.azimuth * 180 / Math.PI + 180) % 360;
            points.push({
              date: midDate,
              altitude,
              azimuth,
              [colorVar]: d3.mean(values, d => d[colorVar] as number) || 0,
              [radiusVar]: d3.mean(values, d => d[radiusVar] as number) || 0,
              _count: values.length,
              _period: period,
              _hour: hour
            });
          }
        });
      });
    }

    // Color scale
    const colorVarDef = variables.find(v => v.id === colorVar) || variables[0];
    const gradientDef = gradients.find(g => g.id === gradientId) || gradients[0];
    
    const cMin = convertValue(colorVarDef.min, colorVarDef.unit);
    const cMax = convertValue(colorVarDef.max, colorVarDef.unit);

    // Create a continuous color scale from the gradient colors
    const colorScale = d3.scaleSequential()
      .domain([cMin, cMax])
      .interpolator(d3.interpolateRgbBasis(gradientDef.colors));

    // Radius scale
    const rMin = typeof radiusMin === 'number' ? radiusMin : (parseFloat(radiusMin) || 5);
    const rMax = typeof radiusMax === 'number' ? radiusMax : (parseFloat(radiusMax) || 25);
    const radiusVarDef = variables.find(v => v.id === radiusVar) || variables[0];
    const pointRadiusScale = d3.scaleLinear()
      .domain([radiusVarDef.min, radiusVarDef.max])
      .range([rMin as number, rMax as number])
      .clamp(true);

    // Sort points so larger circles are drawn first (at the bottom)
    points.sort((a, b) => (b[radiusVar] as number) - (a[radiusVar] as number));

    // Split points into selected and unselected
    const isSelected = (d: any) => {
      const m = d.month || (d.date ? d.date.getMonth() + 1 : 1);
      const h = d._hour !== undefined ? d._hour : (d.hour !== undefined ? d.hour : (d.date ? d.date.getHours() : 0));
      const isMonthMatch = filter.startMonth <= filter.endMonth
        ? (m >= filter.startMonth && m <= filter.endMonth)
        : (m >= filter.startMonth || m <= filter.endMonth);
      return isMonthMatch && h >= filter.startHour && h <= filter.endHour;
    };

    const selectedPoints = points.filter(isSelected);
    const unselectedPoints = points.filter(d => !isSelected(d));

    // 1. Draw unselected points (bottom layer)
    g.selectAll(".data-point-unselected")
      .data(unselectedPoints)
      .join("circle")
      .attr("class", "data-point-unselected")
      .attr("cx", d => rScale(d.altitude) * Math.sin(aScale(d.azimuth)))
      .attr("cy", d => -rScale(d.altitude) * Math.cos(aScale(d.azimuth)))
      .attr("r", d => pointRadiusScale(d[radiusVar] as number))
      .style("fill", d => colorScale(convertValue(d[colorVar] as number, colorVarDef.unit)))
      .style("stroke", "none")
      .style("opacity", 0.15)
      .style("pointer-events", "none");

    // 2. Draw grid
    const altitudes = [0, 15, 30, 45, 60, 75];
    const azimuths = d3.range(0, 360, 30);

    // Altitude circles
    g.selectAll(".altitude-circle")
      .data(altitudes)
      .join("circle")
      .attr("class", "altitude-circle")
      .attr("r", d => rScale(d))
      .style("fill", "none")
      .style("stroke", d => d === 0 ? (theme === 'dark' ? '#4b5563' : '#1f2937') : (theme === 'dark' ? '#374151' : '#e5e7eb'))
      .style("stroke-width", d => d === 0 ? '2px' : '1px');

    // Altitude labels
    g.selectAll(".altitude-label")
      .data(altitudes.filter(d => d > 0))
      .join("text")
      .attr("class", "altitude-label")
      .attr("y", d => -rScale(d))
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .style("fill", heatmapTextColor)
      .style("font-size", `10px`)
      .style("font-weight", "500")
      .text(d => `${d}°`);

    // Azimuth lines
    g.selectAll(".azimuth-line")
      .data(azimuths)
      .join("line")
      .attr("class", "azimuth-line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", d => rScale(0) * Math.sin(aScale(d)))
      .attr("y2", d => -rScale(0) * Math.cos(aScale(d)))
      .style("stroke", theme === 'dark' ? '#374151' : '#e5e7eb')
      .style("stroke-width", '1px');

    // Azimuth labels
    const compass = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    g.selectAll(".azimuth-label")
      .data(azimuths)
      .join("text")
      .attr("class", "azimuth-label")
      .attr("x", d => (rScale(0) + 30) * Math.sin(aScale(d)))
      .attr("y", d => -(rScale(0) + 30) * Math.cos(aScale(d)))
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .style("fill", heatmapTextColor)
      .style("font-weight", "bold")
      .style("font-size", d => compass[d as keyof typeof compass] ? `16px` : `12px`)
      .text(d => compass[d as keyof typeof compass] || `${d}°`);

    // 3. Draw Sun Path Lines (Solstices and Equinoxes)
    const year = data[0]?.date.getFullYear() || new Date().getFullYear();
    const keyDates = [
      { name: 'Summer Solstice', date: new Date(year, 5, 21) }, // June 21
      { name: 'Equinox', date: new Date(year, 2, 21) }, // March 21
      { name: 'Winter Solstice', date: new Date(year, 11, 21) } // Dec 21
    ];

    const lineGenerator = d3.line<any>()
      .x(d => rScale(d.altitude) * Math.sin(aScale(d.azimuth)))
      .y(d => -rScale(d.altitude) * Math.cos(aScale(d.azimuth)))
      .curve(d3.curveBasis);

    keyDates.forEach(kd => {
      const pathPoints = [];
      // Generate points for every 10 minutes throughout the day
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 10) {
          const d = new Date(kd.date);
          d.setHours(h, m, 0, 0);
          const pos = SunCalc.getPosition(d, metadata.lat, metadata.lng);
          const altitude = pos.altitude * 180 / Math.PI;
          if (altitude >= 0) { // Stop exactly at horizon
            const azimuth = (pos.azimuth * 180 / Math.PI + 180) % 360;
            pathPoints.push({ altitude, azimuth });
          }
        }
      }

      if (pathPoints.length > 0) {
        g.append("path")
          .datum(pathPoints)
          .attr("d", lineGenerator)
          .style("fill", "none")
          .style("stroke", theme === 'dark' ? '#6b7280' : '#4b5563')
          .style("stroke-width", '3px')
          .style("opacity", 0.8)
          .style("pointer-events", "none");
          
        // Add label for the path
        const highestPoint = pathPoints.reduce((prev, current) => (prev.altitude > current.altitude) ? prev : current);
        if (highestPoint.altitude > 0) {
          g.append("text")
            .attr("x", rScale(highestPoint.altitude) * Math.sin(aScale(highestPoint.azimuth)))
            .attr("y", -rScale(highestPoint.altitude) * Math.cos(aScale(highestPoint.azimuth)) - 10)
            .attr("text-anchor", "middle")
            .style("fill", heatmapTextColor)
            .style("font-size", `9px`)
            .style("font-weight", "bold")
            .style("pointer-events", "none")
            .text(kd.name);
        }
      }
    });

    // 4. Draw black background circles for selected points
    g.selectAll(".data-point-bg")
      .data(selectedPoints)
      .join("circle")
      .attr("class", "data-point-bg")
      .attr("cx", d => rScale(d.altitude) * Math.sin(aScale(d.azimuth)))
      .attr("cy", d => -rScale(d.altitude) * Math.cos(aScale(d.azimuth)))
      .attr("r", d => pointRadiusScale(d[radiusVar] as number) + 2) // +2px for outline
      .style("fill", theme === 'dark' ? '#111827' : '#1f2937')
      .style("opacity", 0.8)
      .style("pointer-events", "none");

    // 5. Draw selected points (top layer)
    g.selectAll(".data-point-selected")
      .data(selectedPoints)
      .join("circle")
      .attr("class", "data-point-selected")
      .attr("cx", d => rScale(d.altitude) * Math.sin(aScale(d.azimuth)))
      .attr("cy", d => -rScale(d.altitude) * Math.cos(aScale(d.azimuth)))
      .attr("r", d => pointRadiusScale(d[radiusVar] as number))
      .style("fill", d => colorScale(convertValue(d[colorVar] as number, colorVarDef.unit)))
      .style("stroke", "none")
      .style("opacity", 1)
      .style("mix-blend-mode", "normal")
      .append("title")
      .text(d => {
        const prefix = aggregation === 'hour' ? '' : `Avg (${d._count} samples)\n`;
        return `${prefix}${d.date.toLocaleString()}\nAlt: ${d.altitude.toFixed(1)}°\nAz: ${d.azimuth.toFixed(1)}°\n${colorVarDef.name}: ${convertValue(d[colorVar] as number, colorVarDef.unit).toFixed(1)} ${cUnit}\n${radiusVarDef.name}: ${convertValue(d[radiusVar] as number, radiusVarDef.unit).toFixed(1)} ${convertUnit(radiusVarDef.unit)}`;
      });

  }, [metadata, data, variables, colorVar, radiusVar, gradientId, radiusMin, radiusMax, aggregation, gradients, filter, dimensions.width, scale, unitSystem, theme, heatmapTextColor]);

  return (
    <div 
      ref={outerRef}
      className={`w-full h-fit flex flex-col relative transition-colors duration-300 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}
      style={{ fontSize: `calc(14px * ${scale})` }}
    >
      <div 
        className={`flex flex-col sm:flex-row justify-between items-start sm:items-center border-b ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-white'}`}
        style={{ padding: `calc(16px * ${scale})`, gap: `calc(12px * ${scale})` }}
      >
        <div className="flex items-center justify-between w-full sm:w-auto gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <h3 className={`text-xs sm:text-sm font-semibold whitespace-nowrap uppercase tracking-wider ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>Sun Path</h3>
            <div className={`h-4 w-px shrink-0 ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-200'}`}></div>
            <span className="text-xs sm:text-sm font-medium text-gray-500 truncate">{colorVarDef.name}</span>
          </div>
          {onRemove && (
            <button onClick={onRemove} className="sm:hidden p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        
        <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-2 sm:gap-3">
          <div className="flex bg-gray-100 p-0.5 sm:p-1 rounded-lg">
            {(['hour', 'day', 'week', 'month'] as const).map(agg => (
              <button
                key={agg}
                onClick={() => setAggregation(agg)}
                className={`px-2 sm:px-3 py-1 rounded-md text-[10px] sm:text-xs font-medium capitalize transition-colors ${
                  aggregation === agg ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {agg}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setShowStats(!showStats)}
              className={`px-2 sm:px-3 py-1 rounded-md text-[10px] sm:text-xs font-medium transition-colors border ${
                showStats 
                  ? (theme === 'dark' ? 'bg-blue-900/50 border-blue-800 text-blue-400' : 'bg-blue-50 border-blue-100 text-blue-600') 
                  : (theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700')
              }`}
              title="Toggle Statistics"
            >
              Stats
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-md transition-colors border ${
                showSettings 
                  ? (theme === 'dark' ? 'bg-blue-900/50 border-blue-800 text-blue-400' : 'bg-blue-50 border-blue-100 text-blue-600') 
                  : (theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600')
              }`}
              title="Chart Settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            {onRemove && (
              <button onClick={onRemove} className={`hidden sm:block p-1.5 rounded-md transition-colors ${theme === 'dark' ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/30' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}>
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Modal */}
      {showStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowStats(false)}>
          <div className={`p-6 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto ${theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Statistics</h3>
              <button onClick={() => setShowStats(false)} className={`p-1 rounded-md ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Average</div>
                <div className={`text-xl font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.avg.toFixed(1)} {cUnit}</div>
              </div>
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Min / Max</div>
                <div className={`text-xl font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.min.toFixed(1)} / {stats.max.toFixed(1)} {cUnit}</div>
              </div>
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Total</div>
                <div className={`text-xl font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.total.toFixed(0)} {cUnit}</div>
              </div>
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Samples</div>
                <div className={`text-xl font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.count}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowSettings(false)}>
          <div className={`p-6 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto ${theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Chart Settings</h3>
              <button onClick={() => setShowSettings(false)} className={`p-1 rounded-md ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Color Variable</label>
                <select
                  value={colorVar}
                  onChange={(e) => setColorVar(e.target.value)}
                  className={`w-full text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 transition-all outline-none border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 hover:bg-white'}`}
                >
                  {Object.entries(groupedVariables).map(([category, vars]) => (
                    <optgroup key={category} label={category}>
                      {vars.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Radius Variable</label>
                <select
                  value={radiusVar}
                  onChange={(e) => setRadiusVar(e.target.value)}
                  className={`w-full text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 transition-all outline-none border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 hover:bg-white'}`}
                >
                  {Object.entries(groupedVariables).map(([category, vars]) => (
                    <optgroup key={category} label={category}>
                      {vars.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Radius Min/Max</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={radiusMin}
                    onChange={(e) => setRadiusMin(e.target.value)}
                    className={`w-1/2 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 transition-all outline-none border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 hover:bg-white'}`}
                    placeholder="Min"
                  />
                  <input
                    type="number"
                    value={radiusMax}
                    onChange={(e) => setRadiusMax(e.target.value)}
                    className={`w-1/2 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 transition-all outline-none border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 hover:bg-white'}`}
                    placeholder="Max"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Color Palette</label>
                  <button 
                    onClick={() => setShowGradientModal(true)}
                    className="text-[10px] font-bold text-blue-500 hover:text-blue-600 uppercase tracking-tight"
                  >
                    + Create
                  </button>
                </div>
                <div className={`flex p-1.5 rounded-lg overflow-x-auto border ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                  {gradients.map(g => (
                    <button
                      key={g.id}
                      onClick={() => setGradientId(g.id)}
                      className={`flex-shrink-0 w-8 h-8 rounded-md mx-1 border-2 transition-all ${
                        gradientId === g.id ? 'border-blue-500 scale-110 shadow-sm' : 'border-transparent hover:scale-105'
                      }`}
                      style={{ background: `linear-gradient(to right, ${g.colors.join(', ')})` }}
                      title={g.name}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: `calc(16px * ${scale})` }} className="flex-1 flex flex-col">
        <div 
          className="w-full flex items-center justify-center" 
          ref={containerRef}
          style={{ height: `calc(500px * ${scale})` }}
        >
          <svg ref={svgRef} className="w-full h-full max-h-full" />
        </div>
        <div style={{ marginTop: `calc(16px * ${scale})` }} className="flex-shrink-0">
          <InteractiveLegend variable={colorVarDef} gradientId={gradientId} setGradientId={setGradientId} gradients={gradients} theme={theme} fontScale={scale} />
        </div>
      </div>
    </div>
  );
}
