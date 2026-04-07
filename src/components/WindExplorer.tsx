import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { EPWDataRow, EPWVariable } from '../lib/epwParser';
import { InteractiveLegend, GradientDef } from './InteractiveLegend';
import { X, Settings2 } from 'lucide-react';

import { GlobalFilterState } from './GlobalFilterPanel';
import { UnitSystem } from '../App';

interface WindExplorerProps {
  data: EPWDataRow[];
  variables: EPWVariable[];
  onRemove?: () => void;
  gradients: GradientDef[];
  filter: GlobalFilterState;
  unitSystem: UnitSystem;
}

const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function getCompassDirection(degrees: number): string {
  const val = Math.floor((degrees / 22.5) + 0.5);
  return COMPASS_POINTS[(val % 16)];
}

function averageWindVector(values: EPWDataRow[]): { speed: number, direction: number } {
  let sumU = 0;
  let sumV = 0;
  let count = 0;

  values.forEach(d => {
    const speed = d.windSpeed as number;
    const dir = d.windDirection as number;
    if (speed !== undefined && dir !== undefined) {
      const rad = dir * Math.PI / 180;
      sumU += -speed * Math.sin(rad);
      sumV += -speed * Math.cos(rad);
      count++;
    }
  });

  if (count === 0) return { speed: 0, direction: 0 };

  const avgU = sumU / count;
  const avgV = sumV / count;
  
  const avgSpeed = Math.sqrt(avgU * avgU + avgV * avgV);
  let avgDir = Math.atan2(-avgU, -avgV) * 180 / Math.PI;
  if (avgDir < 0) avgDir += 360;

  return { speed: avgSpeed, direction: avgDir };
}

export function WindExplorer({ data, variables, onRemove, gradients, filter, unitSystem }: WindExplorerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const roseRef = useRef<SVGSVGElement>(null);
  const [aggregation, setAggregation] = useState<'hour' | 'day' | 'week' | 'month'>('month');
  const [aspectRatio, setAspectRatio] = useState('1/1');
  const [colorVar, setColorVar] = useState(variables.find(v => v.id === 'windSpeed')?.id || variables[0]?.id || '');
  const [gradientId, setGradientId] = useState(gradients[0].id);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [numBins, setNumBins] = useState(36);

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
  const groupedVariables = variables.reduce((acc, variable) => {
    const category = variable.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(variable);
    return acc;
  }, {} as Record<string, EPWVariable[]>);

  useEffect(() => {
    if (!svgRef.current || !roseRef.current || !data.length) return;

    // --- Main Chart (1224 + Bar) ---
    const width = 900;
    const [aspectW, aspectH] = aspectRatio.split('/').map(Number);
    const height = width * (aspectH / aspectW);
    
    const margin = { top: 20, right: 40, bottom: 40, left: 60 };
    
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
    const colorVarDef = variables.find(v => v.id === colorVar) || variables.find(v => v.id === 'windSpeed') || variables[0];
    const gradientDef = gradients.find(g => g.id === gradientId) || gradients[0];
    
    const cMin = convertValue(colorVarDef.min, colorVarDef.unit);
    const cMax = convertValue(colorVarDef.max, colorVarDef.unit);
    const cUnit = convertUnit(colorVarDef.unit);

    const colorScale = d3.scaleSequential()
      .domain([cMin, cMax])
      .interpolator(d3.interpolateRgbBasis(gradientDef.colors));

    // X Scale for left charts (Day of Year 1-365)
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
          const { speed, direction } = averageWindVector(values);
          heatmapData.push({
            x0: startDay,
            x1: endDay,
            y: hour,
            month: month,
            value: convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
            direction: direction,
            label: `${monthNames[month - 1]}`,
            tooltip: `${monthNames[month - 1]} Avg\n${colorVarDef.name}: ${convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit).toFixed(1)} ${cUnit}\nDir: ${getCompassDirection(direction)} (${Math.round(direction)}°)`
          });
        });
      });
    } else if (aggregation === 'week') {
      const groups = d3.group(data, d => Math.floor((d.dayOfYear - 1) / 7), d => d.hour);
      Array.from(groups).forEach(([week, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          const startDay = week * 7 + 1;
          const endDay = Math.min((week + 1) * 7 + 1, 366);
          const { speed, direction } = averageWindVector(values);
          const month = values[0].month;
          heatmapData.push({
            x0: startDay,
            x1: endDay,
            y: hour,
            month: month,
            value: convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
            direction: direction,
            label: `W${week + 1}`,
            tooltip: `Week ${week + 1} Avg\n${colorVarDef.name}: ${convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit).toFixed(1)} ${cUnit}\nDir: ${getCompassDirection(direction)} (${Math.round(direction)}°)`
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
        direction: d.windDirection as number,
        label: d.date.toLocaleDateString(),
        tooltip: `${d.date.toLocaleString()}\n${colorVarDef.name}: ${convertValue(d[colorVar] as number, colorVarDef.unit).toFixed(1)} ${cUnit}\nDir: ${getCompassDirection(d.windDirection as number)} (${d.windDirection}°)`
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
        const isMonthMatch = filter.startMonth <= filter.endMonth
          ? (d.month >= filter.startMonth && d.month <= filter.endMonth)
          : (d.month >= filter.startMonth || d.month <= filter.endMonth);
        const isHourMatch = d.y >= filter.startHour && d.y <= filter.endHour;
        return (isMonthMatch && isHourMatch) ? 1 : 0.2;
      })
      .append("title")
      .text(d => d.tooltip);

    // Overlay text for wind direction
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
        .text(d => (xScale(d.x1) - xScale(d.x0)) > 20 ? getCompassDirection(d.direction) : "");
    }

    // Add bounding box for the selected region
    if (filter.startMonth > 1 || filter.endMonth < 12 || filter.startHour > 0 || filter.endHour < 23) {
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

    // Aggregate data for bar chart
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

    // --- Wind Rose ---
    const roseWidth = 400;
    const roseHeight = 400;
    const roseMargin = 40;
    const roseRadius = Math.min(roseWidth, roseHeight) / 2 - roseMargin;

    const roseSvg = d3.select(roseRef.current);
    roseSvg.selectAll("*").remove();

    const roseG = roseSvg
      .attr("viewBox", `0 0 ${roseWidth} ${roseHeight}`)
      .append("g")
      .attr("transform", `translate(${roseWidth / 2}, ${roseHeight / 2})`);

    // Group wind by direction
    const binSize = 360 / numBins;
    
    // Create 6 buckets based on the color variable's domain
    const numBuckets = 6;
    const bucketScale = d3.scaleQuantize<number>()
      .domain([cMin, cMax])
      .range(d3.range(numBuckets));
    
    const bins = d3.range(numBins).map(i => ({
      angle: i * binSize,
      buckets: new Array(numBuckets).fill(0),
      totalCount: 0
    }));

    data.forEach(d => {
      // Only include data within the filter
      const isMonthMatch = filter.startMonth <= filter.endMonth
        ? (d.month >= filter.startMonth && d.month <= filter.endMonth)
        : (d.month >= filter.startMonth || d.month <= filter.endMonth);
      const isHourMatch = d.hour >= filter.startHour && d.hour <= filter.endHour;
      
      if (isMonthMatch && isHourMatch) {
        const dir = d.windDirection as number;
        const val = convertValue(d[colorVar] as number, colorVarDef.unit);
        // North bias fix: filter out null and calm (speed 0) from the rose
        // If speed is 0, direction is often 0 or 999, which shouldn't be counted as North
        const speed = d.windSpeed as number;
        if (dir !== null && dir !== undefined && val !== null && val !== undefined && speed > 0) {
          let binIndex = Math.round(dir / binSize) % numBins;
          if (binIndex < 0) binIndex += numBins;
          
          let bucketIndex = bucketScale(val);
          if (bucketIndex === undefined) bucketIndex = 0;
          if (bucketIndex >= numBuckets) bucketIndex = numBuckets - 1;
          
          bins[binIndex].buckets[bucketIndex]++;
          bins[binIndex].totalCount++;
        }
      }
    });

    const maxTotalCount = d3.max(bins, d => d.totalCount) || 1;
    const rScaleRose = d3.scaleLinear()
      .domain([0, maxTotalCount])
      .range([0, roseRadius]);

    // Draw grid circles
    const ticks = rScaleRose.ticks(4);
    roseG.selectAll(".rose-grid")
      .data(ticks)
      .join("circle")
      .attr("class", "rose-grid")
      .attr("r", d => rScaleRose(d))
      .style("fill", "none")
      .style("stroke", "#4b5563")
      .style("stroke-width", "1.5px")
      .style("stroke-dasharray", "none");

    // Draw axis lines (16 compass points)
    roseG.selectAll(".rose-axis")
      .data(d3.range(16))
      .join("line")
      .attr("class", "rose-axis")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", d => roseRadius * Math.sin(d * (360/16) * Math.PI / 180))
      .attr("y2", d => -roseRadius * Math.cos(d * (360/16) * Math.PI / 180))
      .style("stroke", "#4b5563")
      .style("stroke-width", "1px")
      .style("stroke-opacity", 0.3);

    // Draw labels (16 compass points)
    roseG.selectAll(".rose-label")
      .data(d3.range(16))
      .join("text")
      .attr("class", "rose-label")
      .attr("x", d => (roseRadius + 15) * Math.sin(d * (360/16) * Math.PI / 180))
      .attr("y", d => -(roseRadius + 15) * Math.cos(d * (360/16) * Math.PI / 180))
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .style("fill", "#1f2937")
      .style("font-size", d => d % 2 === 0 ? "12px" : "10px")
      .style("font-weight", d => d % 4 === 0 ? "bold" : "normal")
      .text(d => COMPASS_POINTS[d]);

    // Stack the buckets
    const stack = d3.stack<any>()
      .keys(d3.range(numBuckets))
      .value((d, key) => d.buckets[key]);
    
    const series = stack(bins);
    
    const wedges: any[] = [];
    series.forEach((s) => {
      const extent = bucketScale.invertExtent(s.key as number);
      s.forEach(d => {
        if (d[1] > d[0]) {
          wedges.push({
            angle: d.data.angle,
            inner: d[0],
            outer: d[1],
            count: d[1] - d[0],
            bucketIndex: s.key,
            extent: extent
          });
        }
      });
    });

    const arc = d3.arc<any>()
      .innerRadius(d => rScaleRose(d.inner))
      .outerRadius(d => rScaleRose(d.outer))
      .startAngle(d => (d.angle - binSize / 2) * Math.PI / 180)
      .endAngle(d => (d.angle + binSize / 2) * Math.PI / 180);

    roseG.selectAll(".rose-wedge")
      .data(wedges)
      .join("path")
      .attr("class", "rose-wedge")
      .attr("d", arc)
      .style("fill", d => {
        const midVal = (d.extent[0] + d.extent[1]) / 2;
        return colorScale(midVal);
      })
      .style("stroke", "#ffffff")
      .style("stroke-width", "0.5px")
      .append("title")
      .text(d => `Direction: ${Math.round(d.angle)}°\nRange: ${d.extent[0].toFixed(1)} - ${d.extent[1].toFixed(1)} ${cUnit}\nCount: ${d.count} hours`);

    // Wind Rose Title
    roseG.append("text")
      .attr("y", -roseRadius - 25)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .style("fill", "#1f2937")
      .text("Wind Rose (Frequency & Speed)");

  }, [data, variables, colorVar, gradientId, aggregation, gradients, filter, aspectRatio, numBins, unitSystem]);

  const colorVarDef = variables.find(v => v.id === colorVar) || variables.find(v => v.id === 'windSpeed') || variables[0];

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
          <h3 className="text-sm font-semibold text-gray-800 whitespace-nowrap">Wind Explorer</h3>
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
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Wind Rose Granularity</label>
            <select
              value={numBins}
              onChange={(e) => setNumBins(parseInt(e.target.value))}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 transition-all hover:bg-white"
            >
              <option value={8}>8 Directions (Basic)</option>
              <option value={16}>16 Directions (Standard)</option>
              <option value={36}>36 Directions (Detailed)</option>
              <option value={72}>72 Directions (High Res)</option>
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

      <div className="p-4 flex-1 flex flex-col gap-6">
        <div className="w-full flex justify-center">
          <div className="w-full max-w-md aspect-square">
            <svg ref={roseRef} className="w-full h-full" />
          </div>
        </div>
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
