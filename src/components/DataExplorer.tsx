import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
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
}

export function DataExplorer({ data, variables, onRemove, gradients, filter, unitSystem }: DataExplorerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [aggregation, setAggregation] = useState<'hour' | 'day' | 'week' | 'month'>('month');
  const [aspectRatio, setAspectRatio] = useState('1/1');
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

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    const width = 900;
    const [aspectW, aspectH] = aspectRatio.split('/').map(Number);
    const height = width * (aspectH / aspectW);
    
    const margin = { top: 20, right: 40, bottom: 40, left: 60 };
    
    // Distribute height between bar chart and heatmap
    // Bar chart takes about 30% of height, but at least 150px
    const barChartHeight = Math.max(150, height * 0.25);
    const heatmapHeight = height - margin.top - margin.bottom - barChartHeight - 40; // 40px gap
    
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
      .range([heatmapHeight, 0]);

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
      .attr("transform", d => `translate(${xScale(d.x0)}, ${yScaleHeatmap(d.y + 1)})`);

    cells.append("rect")
      .attr("width", d => Math.max(1, xScale(d.x1) - xScale(d.x0) - 4)) // -4 for gap
      .attr("height", cellHeight - 4) // -4 for gap
      .attr("rx", 8) // Rounded corners
      .attr("ry", 8)
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
        .attr("x", d => (xScale(d.x1) - xScale(d.x0)) / 2)
        .attr("y", cellHeight / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .style("fill", d => {
          const rgb = d3.color(colorScale(d.value))?.rgb();
          if (rgb) {
            const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
            return brightness > 80 ? "#000" : "#fff";
          }
          return "#000";
        })
        .style("font-size", aggregation === 'month' ? "14px" : "12px")
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
        .attr("y", yScaleHeatmap(filter.endHour + 1))
        .attr("width", xScale(endDay) - xScale(startDay))
        .attr("height", yScaleHeatmap(filter.startHour) - yScaleHeatmap(filter.endHour + 1))
        .attr("fill", "none")
        .attr("stroke", "#1f2937") // Dark grey
        .attr("stroke-width", 3)
        .attr("rx", 8)
        .attr("ry", 8)
        .style("pointer-events", "none");
    }

    // Y Axis for Heatmap
    const yAxisHeatmap = d3.axisLeft(yScaleHeatmap)
      .tickValues([0, 6, 12, 18, 24])
      .tickFormat(d => `${d}h`);
    
    heatmapG.append("g")
      .call(yAxisHeatmap)
      .call(g => g.select(".domain").style("stroke", "#4b5563").style("stroke-width", "2px"))
      .call(g => g.selectAll(".tick line").attr("x2", innerWidth).style("stroke", "#4b5563").style("stroke-width", "1.5px").attr("stroke-opacity", 0.2))
      .call(g => g.selectAll(".tick text").style("fill", "#4b5563").style("font-weight", "bold").style("font-size", "14px"));

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
          .style("stroke", "#1f2937")
          .style("stroke-width", "1.5px");

        // Top bracket
        g.append("line")
          .attr("x1", cx - whiskerW / 2)
          .attr("x2", cx + whiskerW / 2)
          .attr("y1", yScaleBar(d.maxSelected!))
          .attr("y2", yScaleBar(d.maxSelected!))
          .style("stroke", "#1f2937")
          .style("stroke-width", "1.5px");

        // Bottom bracket
        g.append("line")
          .attr("x1", cx - whiskerW / 2)
          .attr("x2", cx + whiskerW / 2)
          .attr("y1", yScaleBar(d.minSelected!))
          .attr("y2", yScaleBar(d.minSelected!))
          .style("stroke", "#1f2937")
          .style("stroke-width", "1.5px");
      });
    }

    // Y Axis for Bar Chart
    const yAxisBar = d3.axisLeft(yScaleBar).ticks(5);
    barChartG.append("g")
      .call(yAxisBar)
      .call(g => g.select(".domain").style("stroke", "#4b5563").style("stroke-width", "2px"))
      .call(g => g.selectAll(".tick line").attr("x2", innerWidth).style("stroke", "#4b5563").style("stroke-width", "1.5px").attr("stroke-opacity", 0.2))
      .call(g => g.selectAll(".tick text").style("fill", "#4b5563").style("font-weight", "bold").style("font-size", "13px"));

    // --- Shared X Axis ---
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthDays = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

    const xAxis = d3.axisBottom(xScale)
      .tickValues(monthDays)
      .tickFormat((_, i) => months[i]);

    heatmapG.append("g")
      .attr("transform", `translate(0, ${heatmapHeight})`)
      .call(xAxis)
      .call(g => g.select(".domain").style("stroke", "#4b5563").style("stroke-width", "2px"))
      .call(g => g.selectAll(".tick line").style("stroke", "#4b5563").style("stroke-width", "2px"))
      .call(g => g.selectAll(".tick text").attr("x", (innerWidth / 12) / 2).style("fill", "#4b5563").style("font-weight", "bold").style("font-size", "13px"));

  }, [data, variables, colorVar, gradientId, aggregation, gradients, aspectRatio, filter, unitSystem]);

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
    <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between w-full sm:w-auto gap-3">
          <h3 className="text-sm font-semibold text-gray-800 whitespace-nowrap">Data Explorer</h3>
          <div className="h-4 w-px bg-gray-200"></div>
          <select
            value={colorVar}
            onChange={(e) => setColorVar(e.target.value)}
            className="bg-transparent border-none text-sm font-medium text-gray-600 focus:ring-0 cursor-pointer hover:text-gray-900 transition-colors p-0 max-w-[120px] sm:max-w-none truncate"
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
        <div className="w-full" style={{ aspectRatio: aspectRatio }}>
          <svg ref={svgRef} className="w-full h-full" />
        </div>
        <div className="mt-4">
          <InteractiveLegend variable={colorVarDef} gradientId={gradientId} setGradientId={setGradientId} gradients={gradients} />
        </div>
      </div>
    </div>
  );
}
