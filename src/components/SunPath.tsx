import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
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
}

export function SunPath({ metadata, data, variables, onRemove, gradients, filter, unitSystem }: SunPathProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [aggregation, setAggregation] = useState<'hour' | 'day' | 'week' | 'month'>('week');
  const [colorVar, setColorVar] = useState(variables[0]?.id || '');
  const [radiusVar, setRadiusVar] = useState(variables.find(v => v.id === 'globalHorizontalRadiation')?.id || variables[0]?.id || '');
  const [gradientId, setGradientId] = useState(gradients[0].id);
  const [radiusMin, setRadiusMin] = useState<number | string>(5);
  const [radiusMax, setRadiusMax] = useState<number | string>(25);
  const [aspectRatio, setAspectRatio] = useState('1/1');
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);

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
    if (!svgRef.current || !data.length) return;

    const width = 900;
    const [aspectW, aspectH] = aspectRatio.split('/').map(Number);
    const height = width * (aspectH / aspectW);
    const margin = 40;
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
      .range([rMin, rMax])
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
      .style("stroke", d => d === 0 ? "#1f2937" : "#e5e7eb") // Darker and thicker for horizon
      .style("stroke-width", d => d === 0 ? "2px" : "1px");

    // Altitude labels
    g.selectAll(".altitude-label")
      .data(altitudes.filter(d => d > 0))
      .join("text")
      .attr("class", "altitude-label")
      .attr("y", d => -rScale(d))
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .style("fill", "#6b7280")
      .style("font-size", "14px")
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
      .style("stroke", "#e5e7eb")
      .style("stroke-width", "1px");

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
      .style("fill", "#4b5563")
      .style("font-weight", "bold")
      .style("font-size", d => compass[d as keyof typeof compass] ? "22px" : "16px")
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
          .style("stroke", "#4b5563") // Darker grey for sun paths
          .style("stroke-width", "3px")
          .style("opacity", 0.8)
          .style("pointer-events", "none");
          
        // Add label for the path
        const highestPoint = pathPoints.reduce((prev, current) => (prev.altitude > current.altitude) ? prev : current);
        if (highestPoint.altitude > 0) {
          g.append("text")
            .attr("x", rScale(highestPoint.altitude) * Math.sin(aScale(highestPoint.azimuth)))
            .attr("y", -rScale(highestPoint.altitude) * Math.cos(aScale(highestPoint.azimuth)) - 10)
            .attr("text-anchor", "middle")
            .style("fill", "#1f2937")
            .style("font-size", "11px")
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
      .attr("r", d => pointRadiusScale(d[radiusVar] as number) + 2) // +2px for black outline
      .style("fill", "#1f2937")
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

  }, [metadata, data, variables, colorVar, radiusVar, gradientId, radiusMin, radiusMax, aggregation, gradients, filter, aspectRatio, unitSystem]);

  return (
    <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between w-full sm:w-auto gap-3">
          <h3 className="text-sm font-semibold text-gray-800 whitespace-nowrap">Sun Path</h3>
          <div className="h-4 w-px bg-gray-200"></div>
          <span className="text-sm font-medium text-gray-500 truncate max-w-[120px] sm:max-w-none">{colorVarDef.name}</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex bg-gray-100 p-1 rounded-lg">
            {(['hour', 'day', 'week', 'month'] as const).map(agg => (
              <button
                key={agg}
                onClick={() => setAggregation(agg)}
                className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                  aggregation === agg ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {agg}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setShowStats(!showStats)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  showStats ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`}
                title="Toggle Statistics"
              >
                Stats
              </button>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-md transition-colors ${showSettings ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
              title="Chart Settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            {onRemove && (
              <button onClick={onRemove} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors ml-1">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      {showStats && (
        <div className="px-4 py-3 bg-white border-b border-gray-50 flex flex-wrap gap-6 text-sm">
          <div className="flex flex-col">
            <span className="text-gray-500 font-semibold uppercase tracking-wider text-[10px] mb-1">Average</span>
            <span className="font-medium text-gray-900 text-base">{stats.avg.toFixed(1)} {cUnit}</span>
          </div>
          <div className="w-px h-8 bg-gray-100"></div>
          <div className="flex flex-col">
            <span className="text-gray-500 font-semibold uppercase tracking-wider text-[10px] mb-1">Min / Max</span>
            <span className="font-medium text-gray-900 text-base">{stats.min.toFixed(1)} / {stats.max.toFixed(1)} {cUnit}</span>
          </div>
          <div className="w-px h-8 bg-gray-100"></div>
          <div className="flex flex-col">
            <span className="text-gray-500 font-semibold uppercase tracking-wider text-[10px] mb-1">Total</span>
            <span className="font-medium text-gray-900 text-base">{stats.total.toFixed(0)} {cUnit}</span>
          </div>
          <div className="w-px h-8 bg-gray-100"></div>
          <div className="flex flex-col">
            <span className="text-gray-500 font-semibold uppercase tracking-wider text-[10px] mb-1">Samples</span>
            <span className="font-medium text-gray-900 text-base">{stats.count}</span>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="p-4 bg-white border-b border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Color Variable</label>
            <select
              value={colorVar}
              onChange={(e) => setColorVar(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 transition-all hover:bg-white"
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
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Radius Variable</label>
            <select
              value={radiusVar}
              onChange={(e) => setRadiusVar(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 transition-all hover:bg-white"
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
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Aspect Ratio</label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 transition-all hover:bg-white"
            >
              <option value="1/1">1:1 (Square)</option>
              <option value="4/3">4:3 (Standard)</option>
              <option value="3/2">3:2 (Classic)</option>
              <option value="2/3">2:3 (Tall)</option>
              <option value="2/1">2:1 (Wide)</option>
              <option value="3/1">3:1 (Ultrawide)</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Radius Min/Max</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={radiusMin}
                onChange={(e) => setRadiusMin(e.target.value)}
                className="w-1/2 bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 transition-all hover:bg-white"
                placeholder="Min"
              />
              <input
                type="number"
                value={radiusMax}
                onChange={(e) => setRadiusMax(e.target.value)}
                className="w-1/2 bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 transition-all hover:bg-white"
                placeholder="Max"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Color Palette</label>
            <div className="flex bg-gray-50 border border-gray-200 p-1.5 rounded-lg overflow-x-auto">
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
      )}

      <div className="p-4 flex-1 flex flex-col">
        <div className="w-full flex items-center justify-center" style={{ aspectRatio: aspectRatio }}>
          <svg ref={svgRef} className="w-full h-full max-h-full" />
        </div>
        <div className="mt-4">
          <InteractiveLegend variable={colorVarDef} gradientId={gradientId} setGradientId={setGradientId} gradients={gradients} />
        </div>
      </div>
    </div>
  );
}
