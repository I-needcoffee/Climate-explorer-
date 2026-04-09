import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { EPWDataRow } from '../lib/epwParser';
import tc from 'jsthermalcomfort';
import { X, Settings2 } from 'lucide-react';
import { InteractiveLegend, GradientDef } from './InteractiveLegend';
import { UnitSystem } from '../App';

import { GlobalFilterState } from './GlobalFilterPanel';

interface UtciExplorerProps {
  data: EPWDataRow[];
  onRemove?: () => void;
  gradients: GradientDef[];
  filter: GlobalFilterState;
  unitSystem: UnitSystem;
  heatmapTextColor: string;
  theme: 'light' | 'dark';
  setShowGradientModal: (show: boolean) => void;
}

const UTCI_COLORS: Record<string, string> = {
  'extreme cold stress': '#000033',
  'very strong cold stress': '#000099',
  'strong cold stress': '#0000ff',
  'moderate cold stress': '#0066ff',
  'slight cold stress': '#00ccff',
  'no thermal stress': '#00ff00',
  'moderate heat stress': '#ffcc00',
  'strong heat stress': '#ff6600',
  'very strong heat stress': '#ff0000',
  'extreme heat stress': '#800000'
};

function getUtciCategoryForValue(val: number): string {
  if (val < -40) return 'extreme cold stress';
  if (val < -27) return 'very strong cold stress';
  if (val < -13) return 'strong cold stress';
  if (val < 0) return 'moderate cold stress';
  if (val < 9) return 'slight cold stress';
  if (val <= 26) return 'no thermal stress';
  if (val <= 32) return 'moderate heat stress';
  if (val <= 38) return 'strong heat stress';
  if (val <= 46) return 'very strong heat stress';
  return 'extreme heat stress';
}

interface UtciDataRow extends EPWDataRow {
  utci: number;
  utciCategory: string;
  isComfortable: number;
}

export function UtciExplorer({ 
  data, onRemove, gradients, filter, unitSystem, heatmapTextColor, theme, 
  setShowGradientModal
}: UtciExplorerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [aggregation, setAggregation] = useState<'hour' | 'day' | 'week' | 'month'>('month');
  const [includeSun, setIncludeSun] = useState(true);
  const [includeWind, setIncludeWind] = useState(true);
  const [colorMode, setColorMode] = useState<'categories' | 'comfortTime' | 'gradient'>('categories');
  const [gradientId, setGradientId] = useState(gradients[0].id);
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

  // Pre-calculate UTCI for all data points to avoid recalculating on every render/aggregation change
  const utciData: UtciDataRow[] = useMemo(() => {
    return data.map(d => {
      const tdb = (d.dryBulbTemperature as number) || 0;
      const rh = (d.relativeHumidity as number) || 50;
      const windSpeed = (d.windSpeed as number) || 0;
      const ghr = (d.globalHorizontalRadiation as number) || 0;

      const v = includeWind ? Math.max(0.5, windSpeed) : 0.5;
      const tr = includeSun ? tdb + (0.02 * ghr) : tdb;

      // Calculate UTCI
      const result = tc.models.utci(tdb, tr, v, rh, 'SI', true, false);
      const utciVal = isNaN(result.utci) ? tdb : result.utci; // Fallback to dry bulb if NaN
      const category = result.stress_category || getUtciCategoryForValue(utciVal);

      return {
        ...d,
        utci: utciVal as number,
        utciCategory: category as string,
        isComfortable: (category === 'no thermal stress' ? 1 : 0) as number
      };
    });
  }, [data, includeSun, includeWind]);

  const convertUtci = (val: number) => unitSystem === 'imperial' ? val * 9/5 + 32 : val;
  const utciUnit = unitSystem === 'imperial' ? '°F' : '°C';

  const { utciMin, utciMax } = useMemo(() => {
    return {
      utciMin: d3.min(utciData, d => d.utci) || -40,
      utciMax: d3.max(utciData, d => d.utci) || 50
    };
  }, [utciData]);

  useEffect(() => {
    if (!svgRef.current || !utciData.length || dimensions.width === 0) return;

    const BASE_WIDTH = 400;
    const width = BASE_WIDTH;
    const height = 500;
    
    const margin = { top: 15, right: 20, bottom: 25, left: 40 };
    
    const barChartHeight = Math.max(75, height * 0.25);
    const heatmapHeight = height - margin.top - margin.bottom - barChartHeight - 20;
    
    const innerWidth = width - margin.left - margin.right;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Color scales
    const comfortTimeColorScale = d3.scaleLinear<string>()
      .domain([0, 1])
      .range(['#ffffff', '#22c55e']); // White to Green

    const gradientDef = gradients.find(g => g.id === gradientId) || gradients[0];
    const gradientColorScale = d3.scaleSequential()
      .domain([utciMin, utciMax])
      .interpolator(d3.interpolateRgbBasis(gradientDef.colors));

    // X Scale
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
      const groups = d3.group(utciData, d => d.month, d => d.hour);
      Array.from(groups).forEach(([month, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          const startDay = values[0].dayOfYear;
          const endDay = values[values.length - 1].dayOfYear + 1;
          const avgUtci = d3.mean(values, d => d.utci) || 0;
          const comfortRatio = d3.mean(values, d => d.isComfortable) || 0;
          heatmapData.push({
            x0: startDay,
            x1: endDay,
            y: hour,
            month: month,
            utci: avgUtci,
            utciCategory: getUtciCategoryForValue(avgUtci),
            isComfortable: comfortRatio,
            label: `${monthNames[month - 1]}`,
            tooltip: colorMode === 'comfortTime'
              ? `${monthNames[month - 1]} Avg\nComfort Time: ${(comfortRatio * 100).toFixed(1)}%\nUTCI: ${convertUtci(avgUtci).toFixed(1)}${utciUnit}`
              : `${monthNames[month - 1]} Avg\nUTCI: ${convertUtci(avgUtci).toFixed(1)}${utciUnit}\n${getUtciCategoryForValue(avgUtci)}`
          });
        });
      });
    } else if (aggregation === 'week') {
      const groups = d3.group(utciData, d => Math.floor((d.dayOfYear - 1) / 7), d => d.hour);
      Array.from(groups).forEach(([week, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          const startDay = week * 7 + 1;
          const endDay = Math.min((week + 1) * 7 + 1, 366);
          const avgUtci = d3.mean(values, d => d.utci) || 0;
          const comfortRatio = d3.mean(values, d => d.isComfortable) || 0;
          const month = values[0].month;
          heatmapData.push({
            x0: startDay,
            x1: endDay,
            y: hour,
            month: month,
            utci: avgUtci,
            utciCategory: getUtciCategoryForValue(avgUtci),
            isComfortable: comfortRatio,
            label: `W${week + 1}`,
            tooltip: colorMode === 'comfortTime'
              ? `Week ${week + 1} Avg\nComfort Time: ${(comfortRatio * 100).toFixed(1)}%\nUTCI: ${convertUtci(avgUtci).toFixed(1)}${utciUnit}`
              : `Week ${week + 1} Avg\nUTCI: ${convertUtci(avgUtci).toFixed(1)}${utciUnit}\n${getUtciCategoryForValue(avgUtci)}`
          });
        });
      });
    } else {
      // day or hour
      heatmapData = utciData.map(d => ({
        x0: d.dayOfYear,
        x1: d.dayOfYear + 1,
        y: d.hour,
        month: d.month,
        utci: d.utci,
        utciCategory: d.utciCategory,
        isComfortable: d.isComfortable,
        label: d.date.toLocaleDateString(),
        tooltip: colorMode === 'comfortTime'
          ? `${d.date.toLocaleString()}\nComfortable: ${d.isComfortable ? 'Yes' : 'No'}\nUTCI: ${convertUtci(d.utci).toFixed(1)}${utciUnit}`
          : `${d.date.toLocaleString()}\nUTCI: ${convertUtci(d.utci).toFixed(1)}${utciUnit}\n${d.utciCategory}`
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
      .style("fill", d => {
        if (colorMode === 'categories') {
          return UTCI_COLORS[d.utciCategory] || '#cccccc';
        } else if (colorMode === 'gradient') {
          return gradientColorScale(d.utci);
        } else {
          return comfortTimeColorScale(d.isComfortable);
        }
      })
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
        // Only show text if the cell is wide enough
        .text(d => {
          if ((xScale(d.x1) - xScale(d.x0)) <= 20) return "";
          return colorMode === 'comfortTime' ? `${Math.round(d.isComfortable * 100)}%` : Math.round(d.utci);
        });
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
        .attr("stroke", "#1f2937") // Dark grey
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
    let aggregatedData: { x0: number, x1: number, valueAll: number, valueSelected: number | null, comfortRatioAll: number, comfortRatioSelected: number | null, minSelected?: number, maxSelected?: number, month: number }[] = [];
    
    if (aggregation === 'hour') {
      aggregatedData = utciData.map(d => {
        const selected = isSelected(d);
        const val = convertUtci(d.utci);
        return {
          x0: d.dayOfYear + d.hour / 24,
          x1: d.dayOfYear + (d.hour + 1) / 24,
          valueAll: val,
          valueSelected: selected ? val : null,
          comfortRatioAll: d.isComfortable,
          comfortRatioSelected: selected ? d.isComfortable : null,
          month: d.month
        };
      });
    } else if (aggregation === 'day') {
      const days = d3.group(utciData, d => d.dayOfYear);
      aggregatedData = Array.from(days, ([day, values]) => {
        const selectedValues = values.filter(isSelected);
        return {
          x0: day,
          x1: day + 1,
          valueAll: convertUtci(d3.mean(values, d => d.utci) || 0),
          valueSelected: selectedValues.length > 0 ? convertUtci(d3.mean(selectedValues, d => d.utci) || 0) : null,
          comfortRatioAll: d3.mean(values, d => d.isComfortable) || 0,
          comfortRatioSelected: selectedValues.length > 0 ? (d3.mean(selectedValues, d => d.isComfortable) || 0) : null,
          month: values[0].month
        };
      });
    } else if (aggregation === 'week') {
      const weeks = d3.group(utciData, d => Math.floor((d.dayOfYear - 1) / 7));
      aggregatedData = Array.from(weeks, ([week, values]) => {
        const selectedValues = values.filter(isSelected);
        return {
          x0: week * 7 + 1,
          x1: Math.min((week + 1) * 7 + 1, 366),
          valueAll: convertUtci(d3.mean(values, d => d.utci) || 0),
          valueSelected: selectedValues.length > 0 ? convertUtci(d3.mean(selectedValues, d => d.utci) || 0) : null,
          comfortRatioAll: d3.mean(values, d => d.isComfortable) || 0,
          comfortRatioSelected: selectedValues.length > 0 ? (d3.mean(selectedValues, d => d.isComfortable) || 0) : null,
          month: values[0].month
        };
      });
    } else { // month
      const months = d3.group(utciData, d => d.month);
      aggregatedData = Array.from(months, ([month, values]) => {
        const startDay = values[0].dayOfYear;
        const endDay = values[values.length - 1].dayOfYear + 1;
        const selectedValues = values.filter(isSelected);
        return {
          x0: startDay,
          x1: endDay,
          valueAll: convertUtci(d3.mean(values, d => d.utci) || 0),
          valueSelected: selectedValues.length > 0 ? convertUtci(d3.mean(selectedValues, d => d.utci) || 0) : null,
          comfortRatioAll: d3.mean(values, d => d.isComfortable) || 0,
          comfortRatioSelected: selectedValues.length > 0 ? (d3.mean(selectedValues, d => d.isComfortable) || 0) : null,
          minSelected: selectedValues.length > 0 ? convertUtci(d3.min(selectedValues, d => d.utci) || 0) : null,
          maxSelected: selectedValues.length > 0 ? convertUtci(d3.max(selectedValues, d => d.utci) || 0) : null,
          month: month
        };
      });
    }

    // Y Scale for Bar Chart
    const yMin = colorMode === 'comfortTime' ? 0 : Math.min(0, d3.min(aggregatedData, d => Math.min(d.valueAll, d.minSelected ?? d.valueAll)) || 0);
    const yMax = colorMode === 'comfortTime' ? 1 : (d3.max(aggregatedData, d => Math.max(d.valueAll, d.maxSelected ?? d.valueAll)) || convertUtci(40));

    const yScaleBar = d3.scaleLinear()
      .domain([yMin, yMax])
      .range([barChartHeight, 0])
      .nice();

    const getFillColor = (val: number, comfortRatio: number) => {
      const metricValue = unitSystem === 'imperial' ? (val - 32) * 5/9 : val;
      if (colorMode === 'categories') {
        return UTCI_COLORS[getUtciCategoryForValue(metricValue)] || '#cccccc';
      } else if (colorMode === 'gradient') {
        return gradientColorScale(metricValue);
      } else {
        return comfortTimeColorScale(comfortRatio);
      }
    };

    // Draw background bars (All Data)
    barChartG.selectAll(".bar-bg")
      .data(aggregatedData)
      .join("rect")
      .attr("class", "bar-bg")
      .attr("x", d => xScale(d.x0))
      .attr("y", d => yScaleBar(Math.max(0, colorMode === 'comfortTime' ? d.comfortRatioAll : d.valueAll)))
      .attr("width", d => Math.max(1, xScale(d.x1) - xScale(d.x0) - (aggregation === 'hour' ? 0 : 4)))
      .attr("height", d => Math.abs(yScaleBar(colorMode === 'comfortTime' ? d.comfortRatioAll : d.valueAll) - yScaleBar(0)))
      .style("fill", d => getFillColor(d.valueAll, d.comfortRatioAll))
      .style("opacity", 0.2)
      .attr("rx", aggregation === 'hour' ? 0 : 8)
      .attr("ry", aggregation === 'hour' ? 0 : 8)
      .append("title")
      .text(d => {
        const metricValue = unitSystem === 'imperial' ? (d.valueAll - 32) * 5/9 : d.valueAll;
        if (colorMode === 'comfortTime') {
          return `All Hours Comfort Time: ${(d.comfortRatioAll * 100).toFixed(1)}%`;
        } else {
          return `All Hours Avg UTCI: ${d.valueAll.toFixed(1)}${utciUnit}\n${getUtciCategoryForValue(metricValue)}`;
        }
      });

    // Draw foreground bars (Selected Data)
    barChartG.selectAll(".bar-fg")
      .data(aggregatedData.filter(d => d.valueSelected !== null))
      .join("rect")
      .attr("class", "bar-fg")
      .attr("x", d => xScale(d.x0))
      .attr("y", d => yScaleBar(Math.max(0, colorMode === 'comfortTime' ? d.comfortRatioSelected! : d.valueSelected!)))
      .attr("width", d => Math.max(1, xScale(d.x1) - xScale(d.x0) - (aggregation === 'hour' ? 0 : 4)))
      .attr("height", d => Math.abs(yScaleBar(colorMode === 'comfortTime' ? d.comfortRatioSelected! : d.valueSelected!) - yScaleBar(0)))
      .style("fill", d => getFillColor(d.valueSelected!, d.comfortRatioSelected!))
      .style("opacity", 1.0)
      .style("stroke", (aggregation === 'month' || aggregation === 'week') ? "rgba(0,0,0,0.1)" : "none")
      .style("stroke-width", "1px")
      .attr("rx", aggregation === 'hour' ? 0 : 8)
      .attr("ry", aggregation === 'hour' ? 0 : 8)
      .append("title")
      .text(d => {
        const metricValue = unitSystem === 'imperial' ? (d.valueSelected! - 32) * 5/9 : d.valueSelected!;
        if (colorMode === 'comfortTime') {
          return `Selected Hours Comfort Time: ${(d.comfortRatioSelected! * 100).toFixed(1)}%`;
        } else {
          return `Selected Hours Avg UTCI: ${d.valueSelected!.toFixed(1)}${utciUnit}\n${getUtciCategoryForValue(metricValue)}`;
        }
      });

    // Draw whiskers for month aggregation (only if not comfortTime)
    if (aggregation === 'month' && colorMode !== 'comfortTime') {
      const whiskers = barChartG.selectAll(".whisker-group")
        .data(aggregatedData.filter(d => d.minSelected !== null && d.maxSelected !== null))
        .join("g")
        .attr("class", "whisker-group");

      whiskers.each(function(d) {
        const g = d3.select(this);
        const barW = Math.max(1, xScale(d.x1) - xScale(d.x0) - 4);
        const cx = xScale(d.x0) + barW / 2;
        const whiskerW = barW * 0.3;

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
    const yAxisBar = d3.axisLeft(yScaleBar).ticks(5)
      .tickFormat(d => colorMode === 'comfortTime' ? `${(d as number * 100)}%` : `${d}${utciUnit}`);
      
    barChartG.append("g")
      .call(yAxisBar)
      .call(g => g.select(".domain").style("stroke", theme === 'dark' ? '#6b7280' : '#4b5563').style("stroke-width", '2px'))
      .call(g => g.selectAll(".tick line").attr("x2", innerWidth).style("stroke", theme === 'dark' ? '#374151' : '#e5e7eb').style("stroke-width", '1.5px').attr("stroke-opacity", 0.5))
      .call(g => g.selectAll(".tick text").style("fill", heatmapTextColor).style("font-weight", "bold").style("font-size", `10px`));

    // Zero line for UTCI values
    if (colorMode !== 'comfortTime') {
      barChartG.append("line")
        .attr("x1", 0)
        .attr("x2", innerWidth)
        .attr("y1", yScaleBar(0))
        .attr("y2", yScaleBar(0))
        .attr("stroke", theme === 'dark' ? '#6b7280' : '#4b5563')
        .attr("stroke-width", '2px')
        .attr("stroke-opacity", 0.5);
    }

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

  }, [utciData, aggregation, colorMode, gradientId, gradients, filter, dimensions.width, unitSystem, heatmapTextColor, theme, scale]);

  // Calculate local stats for filtered data
  const filteredData = utciData.filter(d => {
    const isMonthMatch = filter.startMonth <= filter.endMonth
      ? (d.month >= filter.startMonth && d.month <= filter.endMonth)
      : (d.month >= filter.startMonth || d.month <= filter.endMonth);
    return isMonthMatch && 
           d.hour >= filter.startHour && 
           d.hour <= filter.endHour;
  });

  const categoryCounts = d3.rollup(filteredData, v => v.length, d => d.utciCategory);
  const categoryPercentages = Array.from(categoryCounts).map(([category, count]) => ({
    category,
    percentage: (count / filteredData.length) * 100,
    color: UTCI_COLORS[category] || '#cccccc'
  })).sort((a, b) => {
    // Sort by stress level (cold to hot)
    const order = Object.keys(UTCI_COLORS);
    return order.indexOf(a.category) - order.indexOf(b.category);
  });

  const stats = {
    avg: convertUtci(d3.mean(filteredData, d => d.utci) || 0),
    min: convertUtci(d3.min(filteredData, d => d.utci) || 0),
    max: convertUtci(d3.max(filteredData, d => d.utci) || 0),
    total: convertUtci(d3.sum(filteredData, d => d.utci) || 0),
    count: filteredData.length,
    comfortRatio: d3.mean(filteredData, d => d.isComfortable) || 0,
    categoryPercentages
  };

  return (
    <div 
      ref={outerRef}
      className={`w-full h-fit flex flex-col relative transition-colors duration-300 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}
      style={{ 
        '--scale': scale,
        fontSize: `calc(14px * ${scale})`
      } as any}
    >
      <div 
        className={`flex flex-col sm:flex-row justify-between items-start sm:items-center border-b ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-white'}`}
        style={{ padding: `calc(16px * ${scale})`, gap: `calc(12px * ${scale})` }}
      >
        <div className="flex items-center justify-between w-full sm:w-auto" style={{ gap: `calc(12px * ${scale})` }}>
          <div className="flex items-center min-w-0" style={{ gap: `calc(12px * ${scale})` }}>
            <h3 
              className={`font-semibold whitespace-nowrap uppercase tracking-wider ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}
              style={{ fontSize: `calc(14px * ${scale})` }}
            >
              UTCI Comfort
            </h3>
          </div>
          {onRemove && (
            <button 
              onClick={onRemove} 
              className={`sm:hidden rounded-md transition-colors ${theme === 'dark' ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/30' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
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
                  ? (theme === 'dark' ? 'bg-blue-900/50 border-blue-800 text-blue-400' : 'bg-blue-50 border-blue-100 text-blue-600') 
                  : (theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700')
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
                  ? (theme === 'dark' ? 'bg-blue-900/50 border-blue-800 text-blue-400' : 'bg-blue-50 border-blue-100 text-blue-600') 
                  : (theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600')
              }`}
              style={{ padding: `calc(6px * ${scale})` }}
              title="Chart Settings"
            >
              <Settings2 style={{ width: `calc(16px * ${scale})`, height: `calc(16px * ${scale})` }} />
            </button>
            {onRemove && (
              <button 
                onClick={onRemove} 
                className={`hidden sm:block rounded-md transition-colors ${theme === 'dark' ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/30' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
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
              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Comfort Statistics</h3>
              <button onClick={() => setShowStats(false)} className={`p-1 rounded-md ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Average UTCI</div>
                <div className={`text-xl font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.avg.toFixed(1)} {utciUnit}</div>
              </div>
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Comfort Ratio</div>
                <div className={`text-xl font-medium ${theme === 'dark' ? 'text-green-400' : 'text-green-600'}`}>{(stats.comfortRatio * 100).toFixed(1)}%</div>
              </div>
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Min / Max</div>
                <div className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.min.toFixed(1)} / {stats.max.toFixed(1)} {utciUnit}</div>
              </div>
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Samples</div>
                <div className={`text-xl font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.count}</div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className={`text-sm font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Stress Category Breakdown</h4>
              <div className="space-y-2">
                {stats.categoryPercentages.map(cat => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className={`capitalize ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>{cat.category}</span>
                      <span className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>{cat.percentage.toFixed(1)}%</span>
                    </div>
                    <div className={`h-1.5 w-full rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <div 
                        className="h-full rounded-full" 
                        style={{ backgroundColor: UTCI_COLORS[cat.category], width: `${cat.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
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
              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>UTCI Chart Settings</h3>
              <button onClick={() => setShowSettings(false)} className={`p-1 rounded-md ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Calculation Inputs</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={includeSun} 
                        onChange={e => setIncludeSun(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Include Solar Radiation</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={includeWind} 
                        onChange={e => setIncludeWind(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Include Wind Speed</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Visualization Mode</label>
                  <select 
                    value={colorMode} 
                    onChange={e => setColorMode(e.target.value as any)}
                    className={`w-full p-2 rounded-md border text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${
                      theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="categories">Stress Categories</option>
                    <option value="comfortTime">Comfort Ratio</option>
                    <option value="gradient">Temperature Gradient</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
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

                {colorMode === 'gradient' && (
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
                )}
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
        
        {/* Custom Legend for UTCI */}
        <div style={{ marginTop: `calc(16px * ${scale})` }} className="flex-shrink-0">
          {colorMode === 'categories' ? (
            <div 
              className={`border shadow-sm ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'}`}
              style={{ padding: `${12 * scale}px`, borderRadius: `${12 * scale}px` }}
            >
              <h4 className={`font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`} style={{ fontSize: `${12 * scale}px`, marginBottom: `${8 * scale}px` }}>UTCI Categories</h4>
              <div className="flex flex-wrap" style={{ gap: `${16 * scale}px ${8 * scale}px` }}>
                {Object.entries(UTCI_COLORS).map(([category, color]) => (
                  <div key={category} className={`flex items-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`} style={{ gap: `${6 * scale}px`, fontSize: `${12 * scale}px` }}>
                    <div className="rounded-sm" style={{ backgroundColor: color, width: `${12 * scale}px`, height: `${12 * scale}px` }}></div>
                    <span className="capitalize">{category.replace(' stress', '')}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : colorMode === 'gradient' ? (
            <InteractiveLegend 
              variable={{ id: 'utci', name: 'UTCI', unit: '°C', min: utciMin, max: utciMax, category: 'Comfort' }} 
              gradientId={gradientId} 
              setGradientId={setGradientId} 
              gradients={gradients}
              theme={theme}
              fontScale={scale}
            />
          ) : (
            <div 
              className={`border shadow-sm ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'}`}
              style={{ padding: `${12 * scale}px`, borderRadius: `${12 * scale}px` }}
            >
              <h4 className={`font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`} style={{ fontSize: `${12 * scale}px`, marginBottom: `${8 * scale}px` }}>Time in Comfort Zone</h4>
              <div className="flex items-center" style={{ gap: `${12 * scale}px` }}>
                <span className={`font-medium ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`} style={{ fontSize: `${12 * scale}px` }}>0%</span>
                <div className={`flex-1 rounded-full border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-200'}`} style={{ background: 'linear-gradient(to right, #ffffff, #22c55e)', height: `${12 * scale}px` }}></div>
                <span className={`font-medium ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`} style={{ fontSize: `${12 * scale}px` }}>100%</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
