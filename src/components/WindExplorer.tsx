import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
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
  heatmapTextColor: string;
  theme: 'light' | 'dark';
  setShowGradientModal: (show: boolean) => void;
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

export function WindExplorer({ 
  data, variables, onRemove, gradients, filter, unitSystem, heatmapTextColor, theme, 
  setShowGradientModal
}: WindExplorerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const roseRef = useRef<SVGSVGElement>(null);
  const [aggregation, setAggregation] = useState<'hour' | 'day' | 'week' | 'month'>('month');
  const [colorVar, setColorVar] = useState(variables.find(v => v.id === 'windSpeed')?.id || variables[0]?.id || '');
  const [gradientId, setGradientId] = useState(gradients[0].id);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [numBins, setNumBins] = useState(36);

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
  const [tempFilterEnabled, setTempFilterEnabled] = useState(false);
  const [tempThreshold, setTempThreshold] = useState(unitSystem === 'imperial' ? 70 : 21);
  const [tempFilterType, setTempFilterType] = useState<'above' | 'below'>('above');
  const [speedFilterEnabled, setSpeedFilterEnabled] = useState(false);
  const [speedThreshold, setSpeedThreshold] = useState(unitSystem === 'imperial' ? 10 : 4.5);
  const [speedFilterType, setSpeedFilterType] = useState<'above' | 'below'>('above');

  const convertValue = (val: number | null | undefined, unit: string) => {
    if (val === null || val === undefined) return 0;
    if (unitSystem === 'imperial') {
      if (unit === '°C') return val * 9/5 + 32;
      if (unit === 'm/s') return val * 2.23694;
      if (unit === 'mm') return val / 25.4;
    }
    return val;
  };

  const applyPreset = (type: 'summer' | 'winter' | 'pedestrian' | 'sitting') => {
    switch (type) {
      case 'summer':
        setTempFilterEnabled(true);
        setTempThreshold(unitSystem === 'imperial' ? 75 : 24);
        setTempFilterType('above');
        setSpeedFilterEnabled(true);
        setSpeedThreshold(unitSystem === 'imperial' ? 3.4 : 1.5);
        setSpeedFilterType('above');
        break;
      case 'winter':
        setTempFilterEnabled(true);
        setTempThreshold(unitSystem === 'imperial' ? 50 : 10);
        setTempFilterType('below');
        setSpeedFilterEnabled(true);
        setSpeedThreshold(unitSystem === 'imperial' ? 4.5 : 2.0);
        setSpeedFilterType('above');
        break;
      case 'pedestrian':
        setTempFilterEnabled(false);
        setSpeedFilterEnabled(true);
        setSpeedThreshold(unitSystem === 'imperial' ? 11.2 : 5.0);
        setSpeedFilterType('below');
        break;
      case 'sitting':
        setTempFilterEnabled(false);
        setSpeedFilterEnabled(true);
        setSpeedThreshold(unitSystem === 'imperial' ? 4.5 : 2.0);
        setSpeedFilterType('below');
        break;
    }
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

  // Calculate local stats for filtered data
  const filteredData = useMemo(() => {
    return data.filter(d => {
      const isMonthMatch = filter.startMonth <= filter.endMonth
        ? (d.month >= filter.startMonth && d.month <= filter.endMonth)
        : (d.month >= filter.startMonth || d.month <= filter.endMonth);
      
      let isTempMatch = true;
      if (tempFilterEnabled) {
        const temp = convertValue(d.dryBulbTemperature, '°C');
        if (tempFilterType === 'above') {
          isTempMatch = temp > tempThreshold;
        } else {
          isTempMatch = temp < tempThreshold;
        }
      }

      let isSpeedMatch = true;
      if (speedFilterEnabled) {
        const speed = convertValue(d.windSpeed, 'm/s');
        if (speedFilterType === 'above') {
          isSpeedMatch = speed > speedThreshold;
        } else {
          isSpeedMatch = speed < speedThreshold;
        }
      }

      return isMonthMatch && 
             d.hour >= filter.startHour && 
             d.hour <= filter.endHour &&
             isTempMatch &&
             isSpeedMatch;
    });
  }, [data, filter, tempFilterEnabled, tempThreshold, tempFilterType, speedFilterEnabled, speedThreshold, speedFilterType, unitSystem]);

  useEffect(() => {
    if (!svgRef.current || !roseRef.current || !filteredData.length || dimensions.width === 0) {
      d3.select(svgRef.current).selectAll("*").remove();
      d3.select(roseRef.current).selectAll("*").remove();
      return;
    }

    // --- Main Chart (1224 + Bar) ---
    const BASE_WIDTH = 400;
    const width = BASE_WIDTH;
    const height = 500;
    
    const margin = { top: 15, right: 20, bottom: 25, left: 40 };
    
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
      .range([0, heatmapHeight]);

    // Aggregate data for heatmap
    let heatmapData: any[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    if (aggregation === 'month') {
      const groups = d3.group(filteredData, d => d.month, d => d.hour);
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
      const groups = d3.group(filteredData, d => Math.floor((d.dayOfYear - 1) / 7), d => d.hour);
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
      heatmapData = filteredData.map(d => ({
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
      .attr("transform", d => `translate(${xScale(d.x0)}, ${yScaleHeatmap(d.y)})`);

    cells.append("rect")
      .attr("width", d => Math.max(1, xScale(d.x1) - xScale(d.x0) - 1)) // -1 for gap
      .attr("height", cellHeight - 1) // -1 for gap
      .attr("rx", 2) // Smaller corner radius
      .attr("ry", 2)
      .style("fill", d => colorScale(d.value))
      .style("stroke", (aggregation === 'month' || aggregation === 'week') ? "rgba(0,0,0,0.1)" : "none")
      .style("stroke-width", "1px")
      .style("opacity", 1)
      .append("title")
      .text(d => d.tooltip);

    // Overlay text for wind direction
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
        .style("opacity", 1)
        .text(d => (xScale(d.x1) - xScale(d.x0)) > 20 ? getCompassDirection(d.direction) : "");
    }

    // Add bounding box for the selected region
    if (filter.startMonth > 1 || filter.endMonth < 12 || filter.startHour > 0 || filter.endHour < 23) {
      const startDay = data.find(d => d.month === filter.startMonth)?.dayOfYear || 1;
      const endDayData = [...data].reverse().find(d => d.month === filter.endMonth);
      const endDay = endDayData ? endDayData.dayOfYear + 1 : 366;

      heatmapG.append("rect")
        .attr("x", xScale(startDay))
        .attr("y", yScaleHeatmap(filter.startHour))
        .attr("width", xScale(endDay) - xScale(startDay))
        .attr("height", yScaleHeatmap(filter.endHour + 1) - yScaleHeatmap(filter.startHour))
        .attr("fill", "none")
        .attr("stroke", heatmapTextColor)
        .attr("stroke-width", 3)
        .attr("rx", 2)
        .attr("ry", 2)
        .style("pointer-events", "none");
    }

    // Y Axis for Heatmap
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
      .call(g => g.select(".domain").style("stroke", "#4b5563").style("stroke-width", "2px"))
      .call(g => g.selectAll(".tick line").attr("x2", innerWidth).style("stroke", "#4b5563").style("stroke-width", "1.5px").attr("stroke-opacity", 0.2))
      .call(g => g.selectAll(".tick text").style("fill", heatmapTextColor).style("font-weight", "bold").style("font-size", "8px"));

    // --- Bar Chart ---
    const barChartG = g.append("g");

    // Aggregate data for bar chart
    let aggregatedData: { x0: number, x1: number, valueSelected: number, minSelected?: number, maxSelected?: number, month: number }[] = [];
    
    if (aggregation === 'hour') {
      aggregatedData = filteredData.map(d => {
        const val = convertValue((d[colorVar] as number) || 0, colorVarDef.unit);
        return {
          x0: d.dayOfYear + d.hour / 24,
          x1: d.dayOfYear + (d.hour + 1) / 24,
          valueSelected: val,
          month: d.month
        };
      });
    } else if (aggregation === 'day') {
      const days = d3.group(filteredData, d => d.dayOfYear);
      aggregatedData = Array.from(days, ([day, values]) => {
        return {
          x0: day,
          x1: day + 1,
          valueSelected: convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          month: values[0].month
        };
      });
    } else if (aggregation === 'week') {
      const weeks = d3.group(filteredData, d => Math.floor((d.dayOfYear - 1) / 7));
      aggregatedData = Array.from(weeks, ([week, values]) => {
        return {
          x0: week * 7 + 1,
          x1: Math.min((week + 1) * 7 + 1, 366),
          valueSelected: convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          month: values[0].month
        };
      });
    } else { // month
      const months = d3.group(filteredData, d => d.month);
      aggregatedData = Array.from(months, ([month, values]) => {
        const startDay = values[0].dayOfYear;
        const endDay = values[values.length - 1].dayOfYear + 1;
        return {
          x0: startDay,
          x1: endDay,
          valueSelected: convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          minSelected: convertValue(d3.min(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          maxSelected: convertValue(d3.max(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          month: month
        };
      });
    }

    const yMin = Math.min(0, d3.min(aggregatedData, d => d.minSelected ?? d.valueSelected) || 0);
    const yMax = d3.max(aggregatedData, d => d.maxSelected ?? d.valueSelected) || cMax;

    const yScaleBar = d3.scaleLinear()
      .domain([yMin, yMax])
      .range([barChartHeight, 0])
      .nice();

    // Draw bars (Filtered Data)
    barChartG.selectAll(".bar-fg")
      .data(aggregatedData)
      .join("rect")
      .attr("class", "bar-fg")
      .attr("x", d => xScale(d.x0))
      .attr("y", d => Math.min(yScaleBar(d.valueSelected), yScaleBar(0)))
      .attr("width", d => Math.max(1, xScale(d.x1) - xScale(d.x0) - (aggregation === 'hour' ? 0 : 4)))
      .attr("height", d => Math.abs(yScaleBar(d.valueSelected) - yScaleBar(0)))
      .style("fill", d => colorScale(d.valueSelected))
      .style("opacity", 1.0)
      .style("stroke", (aggregation === 'month' || aggregation === 'week') ? "rgba(0,0,0,0.1)" : "none")
      .style("stroke-width", "1px")
      .attr("rx", aggregation === 'hour' ? 0 : 8)
      .attr("ry", aggregation === 'hour' ? 0 : 8)
      .append("title")
      .text(d => `Avg: ${d.valueSelected.toFixed(1)} ${cUnit}`);

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

    // --- Wind Rose ---
    const roseWidth = 400;
    const roseHeight = 480;
    const roseMargin = 30;
    const roseRadius = (Math.min(roseWidth, roseHeight - 80) / 2 - roseMargin);

    const roseSvg = d3.select(roseRef.current);
    roseSvg.selectAll("*").remove();

    const roseG = roseSvg
      .attr("viewBox", `0 0 ${roseWidth} ${roseHeight}`)
      .append("g")
      .attr("transform", `translate(${roseWidth / 2}, ${(roseHeight - 80) / 2 + 10})`);

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

    filteredData.forEach(d => {
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
      .style("stroke", theme === 'dark' ? '#4b5563' : '#e5e7eb')
      .style("stroke-width", '1.5px')
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
      .style("stroke", theme === 'dark' ? '#4b5563' : '#e5e7eb')
      .style("stroke-width", '1px')
      .style("stroke-opacity", 0.5);

    // Draw labels (16 compass points)
    roseG.selectAll(".rose-label")
      .data(d3.range(16))
      .join("text")
      .attr("class", "rose-label")
      .attr("x", d => (roseRadius + 15) * Math.sin(d * (360/16) * Math.PI / 180))
      .attr("y", d => -(roseRadius + 15) * Math.cos(d * (360/16) * Math.PI / 180))
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .style("fill", heatmapTextColor)
      .style("font-size", d => d % 2 === 0 ? `10px` : `8px`)
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
      .attr("y", -roseRadius - 35)
      .attr("text-anchor", "middle")
      .style("font-size", `10px`)
      .style("font-weight", "bold")
      .style("fill", heatmapTextColor)
      .text("Wind Rose (Frequency & Speed)");

    // --- Wind Rose Legend ---
    const legendItemWidth = 60;
    const totalLegendWidth = numBuckets * legendItemWidth;
    const legendG = roseSvg.append("g")
      .attr("transform", `translate(${(roseWidth - totalLegendWidth) / 2}, ${roseHeight - 35})`);

    const legendItems = d3.range(numBuckets);
    const itemHeight = 14;

    legendG.selectAll(".rose-legend-item")
      .data(legendItems)
      .join("g")
      .attr("transform", (d, i) => `translate(${i * legendItemWidth}, 0)`)
      .each(function(d) {
        const itemG = d3.select(this);
        const extent = bucketScale.invertExtent(d);
        if (!extent[0] && extent[0] !== 0) return;
        
        const midVal = (extent[0] + extent[1]) / 2;

        itemG.append("rect")
          .attr("width", 12)
          .attr("height", itemHeight)
          .attr("rx", 2)
          .style("fill", colorScale(midVal));

        itemG.append("text")
          .attr("x", 16)
          .attr("y", itemHeight / 2)
          .attr("dy", "0.35em")
          .style("font-size", `7px`)
          .style("fill", heatmapTextColor)
          .text(`${extent[0].toFixed(1)}-${extent[1].toFixed(1)}`);
      });

    legendG.append("text")
      .attr("x", totalLegendWidth / 2)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .style("font-size", `9px`)
      .style("font-weight", "bold")
      .style("fill", heatmapTextColor)
      .text(`Wind Speed (${cUnit})`);

  }, [filteredData, variables, colorVar, gradientId, aggregation, gradients, filter, dimensions.width, scale, numBins, unitSystem, heatmapTextColor]);

  const colorVarDef = variables.find(v => v.id === colorVar) || variables.find(v => v.id === 'windSpeed') || variables[0];

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
              Wind Explorer
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Wind Rose Granularity</label>
                <select
                  value={numBins}
                  onChange={(e) => setNumBins(parseInt(e.target.value))}
                  className={`w-full text-sm rounded-lg block p-2.5 transition-all outline-none border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 hover:bg-white'}`}
                >
                  <option value={8}>8 Directions (Basic)</option>
                  <option value={16}>16 Directions (Standard)</option>
                  <option value={36}>36 Directions (Detailed)</option>
                  <option value={72}>72 Directions (High Res)</option>
                </select>
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
              <div className="space-y-2 sm:col-span-2">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Comfort Filtering</label>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => applyPreset('summer')}
                      className={`px-2 py-1 text-[10px] font-semibold rounded-md border transition-colors ${theme === 'dark' ? 'bg-orange-900/30 text-orange-400 border-orange-800 hover:bg-orange-900/50' : 'bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100'}`}
                    >
                      Summer Cooling
                    </button>
                    <button
                      onClick={() => applyPreset('winter')}
                      className={`px-2 py-1 text-[10px] font-semibold rounded-md border transition-colors ${theme === 'dark' ? 'bg-blue-900/30 text-blue-400 border-blue-800 hover:bg-blue-900/50' : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100'}`}
                    >
                      Winter Chill
                    </button>
                    <button
                      onClick={() => applyPreset('pedestrian')}
                      className={`px-2 py-1 text-[10px] font-semibold rounded-md border transition-colors ${theme === 'dark' ? 'bg-green-900/30 text-green-400 border-green-800 hover:bg-green-900/50' : 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100'}`}
                    >
                      Pedestrian
                    </button>
                    <button
                      onClick={() => applyPreset('sitting')}
                      className={`px-2 py-1 text-[10px] font-semibold rounded-md border transition-colors ${theme === 'dark' ? 'bg-teal-900/30 text-teal-400 border-teal-800 hover:bg-teal-900/50' : 'bg-teal-50 text-teal-700 border-teal-100 hover:bg-teal-100'}`}
                    >
                      Sitting
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tempFilterEnabled}
                    onChange={(e) => setTempFilterEnabled(e.target.checked)}
                    className={`rounded text-blue-600 focus:ring-blue-500 ${theme === 'dark' ? 'border-gray-600 bg-gray-800' : 'border-gray-300'}`}
                  />
                  <span className={`text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Filter by Temperature</span>
                </label>
                {tempFilterEnabled && (
                  <div className="flex gap-2">
                    <select
                      value={tempFilterType}
                      onChange={(e) => setTempFilterType(e.target.value as 'above' | 'below')}
                      className={`text-xs rounded-lg block p-1.5 transition-all ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-200 focus:ring-blue-500 focus:border-blue-500 hover:bg-gray-700' : 'bg-gray-50 border-gray-200 text-gray-900 focus:ring-blue-500 focus:border-blue-500 hover:bg-white'}`}
                    >
                      <option value="above">Above</option>
                      <option value="below">Below</option>
                    </select>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={tempThreshold}
                        onChange={(e) => setTempThreshold(Number(e.target.value))}
                        className={`w-full text-xs rounded-lg block p-1.5 transition-all pr-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-200 focus:ring-blue-500 focus:border-blue-500 hover:bg-gray-700' : 'bg-gray-50 border-gray-200 text-gray-900 focus:ring-blue-500 focus:border-blue-500 hover:bg-white'}`}
                      />
                      <span className={`absolute right-2 top-1.5 text-[10px] ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{unitSystem === 'imperial' ? '°F' : '°C'}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={speedFilterEnabled}
                    onChange={(e) => setSpeedFilterEnabled(e.target.checked)}
                    className={`rounded text-blue-600 focus:ring-blue-500 ${theme === 'dark' ? 'border-gray-600 bg-gray-800' : 'border-gray-300'}`}
                  />
                  <span className={`text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Filter by Wind Speed</span>
                </label>
                {speedFilterEnabled && (
                  <div className="flex gap-2">
                    <select
                      value={speedFilterType}
                      onChange={(e) => setSpeedFilterType(e.target.value as 'above' | 'below')}
                      className={`text-xs rounded-lg block p-1.5 transition-all ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-200 focus:ring-blue-500 focus:border-blue-500 hover:bg-gray-700' : 'bg-gray-50 border-gray-200 text-gray-900 focus:ring-blue-500 focus:border-blue-500 hover:bg-white'}`}
                    >
                      <option value="above">Above</option>
                      <option value="below">Below</option>
                    </select>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={speedThreshold}
                        onChange={(e) => setSpeedThreshold(Number(e.target.value))}
                        className={`w-full text-xs rounded-lg block p-1.5 transition-all pr-10 ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-200 focus:ring-blue-500 focus:border-blue-500 hover:bg-gray-700' : 'bg-gray-50 border-gray-200 text-gray-900 focus:ring-blue-500 focus:border-blue-500 hover:bg-white'}`}
                      />
                      <span className={`absolute right-2 top-1.5 text-[10px] ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{unitSystem === 'imperial' ? 'mph' : 'm/s'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: `calc(16px * ${scale})` }} className="flex-1 flex flex-col">
        <div className="w-full flex justify-center flex-shrink-0" style={{ marginBottom: `calc(24px * ${scale})` }}>
          <div className="w-full aspect-square" style={{ maxWidth: `calc(400px * ${scale})` }}>
            <svg ref={roseRef} className="w-full h-full" />
          </div>
        </div>
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
