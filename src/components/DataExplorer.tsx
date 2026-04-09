import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { EPWDataRow, EPWVariable } from '../lib/epwParser';
import { InteractiveLegend, GradientDef } from './InteractiveLegend';
import { X, Settings2 } from 'lucide-react';

import { GlobalFilterState } from './GlobalFilterPanel';

import { UnitSystem } from '../App';

interface DataExplorerProps {
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

export function DataExplorer({ 
  data, variables, onRemove, gradients, filter, unitSystem, heatmapTextColor, theme, 
  setShowGradientModal
}: DataExplorerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [aggregation, setAggregation] = useState<'hour' | 'day' | 'week' | 'month'>('month');
  const [showStats, setShowStats] = useState(false);
  
  // Internal state for this specific chart instance
  const [colorVar, setColorVar] = useState(variables.find(v => v.category === 'Temperature')?.id || variables[0].id);
  const [gradientId, setGradientId] = useState(gradients[0].id);
  const [showSettings, setShowSettings] = useState(false);

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

  // Group variables by category
  const groupedVariables = variables.reduce((acc, v) => {
    const cat = v.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(v);
    return acc;
  }, {} as Record<string, EPWVariable[]>);

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

  useEffect(() => {
    if (!svgRef.current || !data.length || dimensions.width === 0) return;

    const BASE_WIDTH = 400;
    const width = BASE_WIDTH;
    const height = 500; // Baseline height for DataExplorer
    
    const margin = { top: 15, right: 20, bottom: 25, left: 40 };
    
    // Distribute height between bar chart and heatmap
    const barChartHeight = Math.max(75, height * 0.25);
    const heatmapHeight = height - margin.top - margin.bottom - barChartHeight - 20; // 20px gap
    
    const innerWidth = width - margin.left - margin.right;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // --- Data Processing ---
    const colorVarDef = variables.find(v => v.id === colorVar) || variables[0];
    const gradientDef = gradients.find(g => g.id === gradientId) || gradients[0];

    const cMin = convertValue(colorVarDef.min, colorVarDef.unit);
    const cMax = convertValue(colorVarDef.max, colorVarDef.unit);
    const cUnit = convertUnit(colorVarDef.unit);

    const colorScale = d3.scaleSequential()
      .domain([cMin, cMax])
      .interpolator(d3.interpolateRgbBasis(gradientDef.colors));

    // X Scale for both charts (Day of Year 1-365)
    const xScale = d3.scaleLinear()
      .domain([1, 366])
      .range([0, innerWidth]);

    // --- Heatmap ---
    const heatmapG = g.append("g")
      .attr("transform", `translate(0, ${barChartHeight + 40})`);

    const yScaleHeatmap = d3.scaleLinear()
      .domain([0, 24])
      .range([0, heatmapHeight]);

    // Aggregate data for heatmap
    let heatmapData: any[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    if (aggregation === 'month') {
      const groups = d3.group(data, d => d.month, d => d.hour);
      Array.from(groups).forEach(([month, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          const startDay = values[0].dayOfYear;
          const endDay = values[values.length - 1].dayOfYear + 1;
          heatmapData.push({
            x0: startDay,
            x1: endDay,
            y: hour,
            month: month,
            value: convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
            label: `${monthNames[month - 1]}`,
            tooltip: `${monthNames[month - 1]} Avg\n${colorVarDef.name}: ${convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit).toFixed(1)} ${cUnit}`
          });
        });
      });
    } else if (aggregation === 'week') {
      const groups = d3.group(data, d => Math.floor((d.dayOfYear - 1) / 7), d => d.hour);
      Array.from(groups).forEach(([week, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          const startDay = week * 7 + 1;
          const endDay = Math.min((week + 1) * 7 + 1, 366);
          // Approximate month for week
          const month = values[0].month;
          heatmapData.push({
            x0: startDay,
            x1: endDay,
            y: hour,
            month: month,
            value: convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
            label: `W${week + 1}`,
            tooltip: `Week ${week + 1} Avg\n${colorVarDef.name}: ${convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit).toFixed(1)} ${cUnit}`
          });
        });
      });
    } else {
      // day or hour
      heatmapData = data.map(d => ({
        x0: d.dayOfYear,
        x1: d.dayOfYear + 1,
        y: d.hour,
        month: d.month,
        value: convertValue(d[colorVar] as number, colorVarDef.unit),
        label: d.date.toLocaleDateString(),
        tooltip: `${d.date.toLocaleString()}\n${colorVarDef.name}: ${convertValue(d[colorVar] as number, colorVarDef.unit).toFixed(1)} ${cUnit}`
      }));
    }

    const cellHeight = heatmapHeight / 24;

    const cells = heatmapG.selectAll(".heatmap-cell-group")
      .data(heatmapData)
      .join("g")
      .attr("class", "heatmap-cell-group")
      .attr("transform", d => `translate(${xScale(d.x0)}, ${yScaleHeatmap(d.y)})`);

    cells.append("rect")
      .attr("width", d => Math.max(1, xScale(d.x1) - xScale(d.x0) - 1)) // -1 for gap
      .attr("height", cellHeight - 1) // -1 for gap
      .attr("rx", 2) // Smaller corner radius
      .attr("ry", 2)
      .style("fill", d => colorScale(d.value))
      .style("stroke", (aggregation === 'month' || aggregation === 'week') ? "rgba(0,0,0,0.1)" : "none")
      .style("stroke-width", "1px")
      .style("opacity", d => {
        // Check if cell falls within filter
        const isMonthMatch = filter.startMonth <= filter.endMonth
          ? (d.month >= filter.startMonth && d.month <= filter.endMonth)
          : (d.month >= filter.startMonth || d.month <= filter.endMonth);
        const isHourMatch = d.y >= filter.startHour && d.y <= filter.endHour;
        return (isMonthMatch && isHourMatch) ? 1 : 0.2;
      })
      .append("title")
      .text(d => d.tooltip);

    // Overlay text for month and week aggregations if cells are large enough
    if (aggregation === 'month' || aggregation === 'week') {
      cells.append("text")
        .attr("x", d => (xScale(d.x1) - xScale(d.x0)) / 2 - 0.5)
        .attr("y", cellHeight / 2 - 0.5)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .style("fill", heatmapTextColor)
        .style("font-size", aggregation === 'month' ? "10px" : "8px")
        .style("font-weight", "500")
        .style("pointer-events", "none")
        .style("opacity", d => {
          const isMonthMatch = filter.startMonth <= filter.endMonth
            ? (d.month >= filter.startMonth && d.month <= filter.endMonth)
            : (d.month >= filter.startMonth || d.month <= filter.endMonth);
          const isHourMatch = d.y >= filter.startHour && d.y <= filter.endHour;
          return (isMonthMatch && isHourMatch) ? 1 : 0.2;
        })
        .text(d => (xScale(d.x1) - xScale(d.x0)) > 20 ? Math.round(d.value) : "");
    }

    // Add bounding box for the selected region
    if (filter.startMonth > 1 || filter.endMonth < 12 || filter.startHour > 0 || filter.endHour < 23) {
      // Find start day of startMonth and end day of endMonth
      const startDay = data.find(d => d.month === filter.startMonth)?.dayOfYear || 1;
      const endDayData = [...data].reverse().find(d => d.month === filter.endMonth);
      const endDay = endDayData ? endDayData.dayOfYear + 1 : 366;

      heatmapG.append("rect")
        .attr("x", xScale(startDay))
        .attr("y", yScaleHeatmap(filter.startHour))
        .attr("width", xScale(endDay) - xScale(startDay))
        .attr("height", yScaleHeatmap(filter.endHour + 1) - yScaleHeatmap(filter.startHour))
        .attr("fill", "none")
        .attr("stroke", "#1f2937") // Dark grey
        .attr("stroke-width", 3)
        .attr("rx", 2)
        .attr("ry", 2)
        .style("pointer-events", "none");
    }

    // Heatmap Y Axis (Hours)
    const formatHour = (h: number) => {
      if (h === 0 || h === 24) return "12 AM";
      if (h === 12) return "12 PM";
      return h < 12 ? `${h} AM` : `${h - 12} PM`;
    };

    const yAxisHeatmap = d3.axisLeft(yScaleHeatmap)
      .tickValues(d3.range(0, 25, 1))
      .tickFormat(d => formatHour(d as number));
    
    heatmapG.append("g")
      .call(yAxisHeatmap)
      .call(g => g.select(".domain").style("stroke", theme === 'dark' ? '#6b7280' : '#4b5563').style("stroke-width", `2px`))
      .call(g => g.selectAll(".tick line").attr("x2", innerWidth).style("stroke", theme === 'dark' ? '#374151' : '#e5e7eb').style("stroke-width", `1.5px`).attr("stroke-opacity", 0.5))
      .call(g => g.selectAll(".tick text").style("fill", heatmapTextColor).style("font-weight", "bold").style("font-size", `8px`));

    // --- Bar Chart ---
    const barChartG = g.append("g");

    const isSelected = (d: any) => {
      const isMonthMatch = filter.startMonth <= filter.endMonth
        ? (d.month >= filter.startMonth && d.month <= filter.endMonth)
        : (d.month >= filter.startMonth || d.month <= filter.endMonth);
      const isHourMatch = d.hour >= filter.startHour && d.hour <= filter.endHour;
      return isMonthMatch && isHourMatch;
    };

    // Aggregate data
    let aggregatedData: { x0: number, x1: number, valueAll: number, valueSelected: number | null, minSelected?: number, maxSelected?: number, month: number }[] = [];
    
    if (aggregation === 'hour') {
      aggregatedData = data.map(d => {
        const selected = isSelected(d);
        const val = convertValue((d[colorVar] as number) || 0, colorVarDef.unit);
        return {
          x0: d.dayOfYear + d.hour / 24,
          x1: d.dayOfYear + (d.hour + 1) / 24,
          valueAll: val,
          valueSelected: selected ? val : null,
          month: d.month
        };
      });
    } else if (aggregation === 'day') {
      const days = d3.group(data, d => d.dayOfYear);
      aggregatedData = Array.from(days, ([day, values]) => {
        const selectedValues = values.filter(isSelected);
        return {
          x0: day,
          x1: day + 1,
          valueAll: convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          valueSelected: selectedValues.length > 0 ? convertValue(d3.mean(selectedValues, d => d[colorVar] as number) || 0, colorVarDef.unit) : null,
          month: values[0].month
        };
      });
    } else if (aggregation === 'week') {
      const weeks = d3.group(data, d => Math.floor((d.dayOfYear - 1) / 7));
      aggregatedData = Array.from(weeks, ([week, values]) => {
        const selectedValues = values.filter(isSelected);
        return {
          x0: week * 7 + 1,
          x1: Math.min((week + 1) * 7 + 1, 366),
          valueAll: convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          valueSelected: selectedValues.length > 0 ? convertValue(d3.mean(selectedValues, d => d[colorVar] as number) || 0, colorVarDef.unit) : null,
          month: values[0].month
        };
      });
    } else { // month
      const months = d3.group(data, d => d.month);
      aggregatedData = Array.from(months, ([month, values]) => {
        const startDay = values[0].dayOfYear;
        const endDay = values[values.length - 1].dayOfYear + 1;
        const selectedValues = values.filter(isSelected);
        return {
          x0: startDay,
          x1: endDay,
          valueAll: convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          valueSelected: selectedValues.length > 0 ? convertValue(d3.mean(selectedValues, d => d[colorVar] as number) || 0, colorVarDef.unit) : null,
          minSelected: selectedValues.length > 0 ? convertValue(d3.min(selectedValues, d => d[colorVar] as number) || 0, colorVarDef.unit) : null,
          maxSelected: selectedValues.length > 0 ? convertValue(d3.max(selectedValues, d => d[colorVar] as number) || 0, colorVarDef.unit) : null,
          month: month
        };
      });
    }

    const yMin = Math.min(0, d3.min(aggregatedData, d => Math.min(d.valueAll, d.minSelected ?? d.valueAll)) || 0);
    const yMax = d3.max(aggregatedData, d => Math.max(d.valueAll, d.maxSelected ?? d.valueAll)) || cMax;

    const yScaleBar = d3.scaleLinear()
      .domain([yMin, yMax])
      .range([barChartHeight, 0])
      .nice();

    // Draw background bars (All Data)
    barChartG.selectAll(".bar-bg")
      .data(aggregatedData)
      .join("rect")
      .attr("class", "bar-bg")
      .attr("x", d => xScale(d.x0))
      .attr("y", d => Math.min(yScaleBar(d.valueAll), yScaleBar(0)))
      .attr("width", d => Math.max(1, xScale(d.x1) - xScale(d.x0) - (aggregation === 'hour' ? 0 : 4)))
      .attr("height", d => Math.abs(yScaleBar(d.valueAll) - yScaleBar(0)))
      .style("fill", d => colorScale(d.valueAll))
      .style("opacity", 0.2)
      .attr("rx", aggregation === 'hour' ? 0 : 8)
      .attr("ry", aggregation === 'hour' ? 0 : 8)
      .append("title")
      .text(d => `All Hours Avg: ${d.valueAll.toFixed(1)} ${cUnit}`);

    // Draw foreground bars (Selected Data)
    barChartG.selectAll(".bar-fg")
      .data(aggregatedData.filter(d => d.valueSelected !== null))
      .join("rect")
      .attr("class", "bar-fg")
      .attr("x", d => xScale(d.x0))
      .attr("y", d => Math.min(yScaleBar(d.valueSelected!), yScaleBar(0)))
      .attr("width", d => Math.max(1, xScale(d.x1) - xScale(d.x0) - (aggregation === 'hour' ? 0 : 4)))
      .attr("height", d => Math.abs(yScaleBar(d.valueSelected!) - yScaleBar(0)))
      .style("fill", d => colorScale(d.valueSelected!))
      .style("opacity", 1.0)
      .style("stroke", (aggregation === 'month' || aggregation === 'week') ? "rgba(0,0,0,0.1)" : "none")
      .style("stroke-width", "1px")
      .attr("rx", aggregation === 'hour' ? 0 : 8)
      .attr("ry", aggregation === 'hour' ? 0 : 8)
      .append("title")
      .text(d => `Selected Hours Avg: ${d.valueSelected!.toFixed(1)} ${cUnit}`);

    // Draw whiskers for month aggregation
    if (aggregation === 'month') {
      const whiskers = barChartG.selectAll(".whisker-group")
        .data(aggregatedData.filter(d => d.minSelected !== null && d.maxSelected !== null))
        .join("g")
        .attr("class", "whisker-group");

      whiskers.each(function(d) {
        const g = d3.select(this);
        const barW = Math.max(1, xScale(d.x1) - xScale(d.x0) - 4);
        const cx = xScale(d.x0) + barW / 2;
        const whiskerW = barW * 0.3; // 30% of bar width

        // Vertical line
        g.append("line")
          .attr("x1", cx)
          .attr("x2", cx)
          .attr("y1", yScaleBar(d.maxSelected!))
          .attr("y2", yScaleBar(d.minSelected!))
          .style("stroke", heatmapTextColor)
          .style("stroke-width", '1.5px');

        // Top bracket
        g.append("line")
          .attr("x1", cx - whiskerW / 2)
          .attr("x2", cx + whiskerW / 2)
          .attr("y1", yScaleBar(d.maxSelected!))
          .attr("y2", yScaleBar(d.maxSelected!))
          .style("stroke", heatmapTextColor)
          .style("stroke-width", '1.5px');

        // Bottom bracket
        g.append("line")
          .attr("x1", cx - whiskerW / 2)
          .attr("x2", cx + whiskerW / 2)
          .attr("y1", yScaleBar(d.minSelected!))
          .attr("y2", yScaleBar(d.minSelected!))
          .style("stroke", heatmapTextColor)
          .style("stroke-width", '1.5px');
      });
    }

    // Y Axis for Bar Chart
    const yAxisBar = d3.axisLeft(yScaleBar).ticks(5);
    barChartG.append("g")
      .call(yAxisBar)
      .call(g => g.select(".domain").style("stroke", theme === 'dark' ? '#6b7280' : '#4b5563').style("stroke-width", '2px'))
      .call(g => g.selectAll(".tick line").attr("x2", innerWidth).style("stroke", theme === 'dark' ? '#374151' : '#e5e7eb').style("stroke-width", '1.5px').attr("stroke-opacity", 0.5))
      .call(g => g.selectAll(".tick text").style("fill", heatmapTextColor).style("font-weight", "bold").style("font-size", `10px`));

    // --- Shared X Axis ---
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthDays = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

    const xAxis = d3.axisTop(xScale)
      .tickValues(monthDays)
      .tickFormat((_, i) => months[i]);

    heatmapG.append("g")
      .attr("transform", `translate(0, 0)`)
      .call(xAxis)
      .call(g => g.select(".domain").style("stroke", theme === 'dark' ? '#6b7280' : '#4b5563').style("stroke-width", '2px'))
      .call(g => g.selectAll(".tick line").style("stroke", theme === 'dark' ? '#6b7280' : '#4b5563').style("stroke-width", '2px'))
      .call(g => g.selectAll(".tick text").attr("x", (innerWidth / 12) / 2).attr("dy", "-0.5em").style("fill", heatmapTextColor).style("font-weight", "bold").style("font-size", `10px`));

    heatmapG.append("g")
      .attr("transform", `translate(0, ${heatmapHeight})`)
      .call(d3.axisBottom(xScale).tickValues(monthDays).tickFormat(""))
      .call(g => g.select(".domain").style("stroke", theme === 'dark' ? '#6b7280' : '#4b5563').style("stroke-width", '2px'))
      .call(g => g.selectAll(".tick line").style("stroke", theme === 'dark' ? '#6b7280' : '#4b5563').style("stroke-width", '2px'));

  }, [data, variables, colorVar, gradientId, aggregation, gradients, filter, unitSystem, heatmapTextColor, theme, dimensions.width, scale]);

  const colorVarDef = variables.find(v => v.id === colorVar) || variables[0];

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

  return (
    <div 
      ref={outerRef}
      className={`w-full h-fit flex flex-col relative transition-colors duration-300 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}
      style={{ fontSize: `calc(14px * ${scale})` }}
    >
      <div 
        className={`flex flex-col sm:flex-row justify-between items-start sm:items-center border-b transition-colors ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}
        style={{ padding: `calc(16px * ${scale})`, gap: `calc(12px * ${scale})` }}
      >
        <div className="flex items-center justify-between w-full sm:w-auto" style={{ gap: `calc(12px * ${scale})` }}>
          <div className="flex items-center min-w-0" style={{ gap: `calc(12px * ${scale})` }}>
            <h3 
              className={`font-semibold whitespace-nowrap uppercase tracking-wider ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}
              style={{ fontSize: `calc(14px * ${scale})` }}
            >
              Data Explorer
            </h3>
            <div 
              className={`shrink-0 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}
              style={{ width: '1px', height: `calc(16px * ${scale})` }}
            ></div>
            <select
              value={colorVar}
              onChange={(e) => setColorVar(e.target.value)}
              className={`bg-transparent border-none font-medium focus:ring-0 cursor-pointer transition-colors p-0 truncate ${theme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'}`}
              style={{ fontSize: `calc(14px * ${scale})`, maxWidth: `calc(150px * ${scale})` }}
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
          {onRemove && (
            <button 
              onClick={onRemove} 
              className={`sm:hidden rounded-md transition-colors ${theme === 'dark' ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/20' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
              style={{ padding: `calc(6px * ${scale})` }}
            >
              <X style={{ width: `calc(16px * ${scale})`, height: `calc(16px * ${scale})` }} />
            </button>
          )}
        </div>
        
        <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto" style={{ gap: `calc(12px * ${scale})` }}>
          <div className={`flex rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`} style={{ padding: `calc(4px * ${scale})` }}>
            {(['hour', 'day', 'week', 'month'] as const).map(agg => (
              <button
                key={agg}
                onClick={() => setAggregation(agg)}
                className={`rounded-md font-medium capitalize transition-colors ${
                  aggregation === agg 
                    ? (theme === 'dark' ? 'bg-gray-600 shadow-sm text-blue-400' : 'bg-white shadow-sm text-blue-600') 
                    : (theme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700')
                }`}
                style={{ 
                  padding: `calc(4px * ${scale}) calc(12px * ${scale})`,
                  fontSize: `calc(12px * ${scale})`
                }}
              >
                {agg}
              </button>
            ))}
          </div>
          <div className="flex items-center" style={{ gap: `calc(8px * ${scale})` }}>
            <button
              onClick={() => setShowStats(!showStats)}
              className={`rounded-md font-medium transition-colors border ${
                showStats 
                  ? (theme === 'dark' ? 'bg-blue-900/30 border-blue-800 text-blue-400' : 'bg-blue-50 border-blue-100 text-blue-600') 
                  : (theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-400 hover:text-gray-200' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700')
              }`}
              style={{ 
                padding: `calc(4px * ${scale}) calc(12px * ${scale})`,
                fontSize: `calc(12px * ${scale})`
              }}
              title="Toggle Statistics"
            >
              Stats
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`rounded-md transition-colors border ${
                showSettings 
                  ? (theme === 'dark' ? 'bg-blue-900/30 border-blue-800 text-blue-400' : 'bg-blue-50 border-blue-100 text-blue-600') 
                  : (theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-400 hover:text-gray-200' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600')
              }`}
              style={{ padding: `calc(6px * ${scale})` }}
              title="Chart Settings"
            >
              <Settings2 style={{ width: `calc(16px * ${scale})`, height: `calc(16px * ${scale})` }} />
            </button>
            {onRemove && (
              <button 
                onClick={onRemove} 
                className={`hidden sm:block rounded-md transition-colors ${theme === 'dark' ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/20' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                style={{ padding: `calc(6px * ${scale})` }}
              >
                <X style={{ width: `calc(16px * ${scale})`, height: `calc(16px * ${scale})` }} />
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
              <div className="space-y-2">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Variable</label>
                <select 
                  value={colorVar} 
                  onChange={e => setColorVar(e.target.value)}
                  className={`w-full p-2 rounded-md border text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${
                    theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  {variables.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Time Aggregation</label>
                <select 
                  value={aggregation} 
                  onChange={e => setAggregation(e.target.value as any)}
                  className={`w-full p-2 rounded-md border text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${
                    theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value="hour">Hourly</option>
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: `calc(16px * ${scale})` }} className="flex-1 flex flex-col">
        <div 
          className="w-full" 
          ref={containerRef}
          style={{ height: `calc(500px * ${scale})` }}
        >
          <svg ref={svgRef} className="w-full h-full" />
        </div>
        <div style={{ marginTop: `calc(16px * ${scale})` }} className="flex-shrink-0">
          <InteractiveLegend variable={colorVarDef} gradientId={gradientId} setGradientId={setGradientId} gradients={gradients} theme={theme} fontScale={scale} />
        </div>
      </div>
    </div>
  );
}
