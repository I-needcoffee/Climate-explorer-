import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
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

export function UtciExplorer({ data, onRemove, gradients, filter, unitSystem }: UtciExplorerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [aggregation, setAggregation] = useState<'hour' | 'day' | 'week' | 'month'>('month');
  const [aspectRatio, setAspectRatio] = useState('1/1');
  const [includeSun, setIncludeSun] = useState(true);
  const [includeWind, setIncludeWind] = useState(true);
  const [colorMode, setColorMode] = useState<'categories' | 'comfortTime' | 'gradient'>('categories');
  const [gradientId, setGradientId] = useState(gradients[0].id);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);

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

  useEffect(() => {
    if (!svgRef.current || !utciData.length) return;

    const width = 900;
    const [aspectW, aspectH] = aspectRatio.split('/').map(Number);
    const height = width * (aspectH / aspectW);
    
    const margin = { top: 20, right: 40, bottom: 40, left: 60 };
    
    const barChartHeight = Math.max(150, height * 0.25);
    const heatmapHeight = height - margin.top - margin.bottom - barChartHeight - 40;
    
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
    const utciMin = d3.min(utciData, d => d.utci) || -40;
    const utciMax = d3.max(utciData, d => d.utci) || 50;
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
      .range([heatmapHeight, 0]);

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
      .attr("transform", d => `translate(${xScale(d.x0)}, ${yScaleHeatmap(d.y + 1)})`);

    cells.append("rect")
      .attr("width", d => Math.max(1, xScale(d.x1) - xScale(d.x0) - 4)) // -4 for gap
      .attr("height", cellHeight - 4) // -4 for gap
      .attr("rx", 8) // Rounded corners
      .attr("ry", 8)
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
        .attr("x", d => (xScale(d.x1) - xScale(d.x0)) / 2)
        .attr("y", cellHeight / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .style("fill", d => {
          // Use white or black text depending on background intensity
          let colorStr = '#cccccc';
          if (colorMode === 'categories') {
            colorStr = UTCI_COLORS[d.utciCategory] || '#cccccc';
          } else if (colorMode === 'gradient') {
            colorStr = gradientColorScale(d.utci);
          } else {
            colorStr = comfortTimeColorScale(d.isComfortable);
          }
          const rgb = d3.color(colorStr)?.rgb();
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
    const yAxisBar = d3.axisLeft(yScaleBar).ticks(5)
      .tickFormat(d => colorMode === 'comfortTime' ? `${(d as number * 100)}%` : `${d}${utciUnit}`);
      
    barChartG.append("g")
      .call(yAxisBar)
      .call(g => g.select(".domain").style("stroke", "#4b5563").style("stroke-width", "2px"))
      .call(g => g.selectAll(".tick line").attr("x2", innerWidth).style("stroke", "#4b5563").style("stroke-width", "1.5px").attr("stroke-opacity", 0.2))
      .call(g => g.selectAll(".tick text").style("fill", "#4b5563").style("font-weight", "bold").style("font-size", "13px"));

    // Zero line for UTCI values
    if (colorMode !== 'comfortTime') {
      barChartG.append("line")
        .attr("x1", 0)
        .attr("x2", innerWidth)
        .attr("y1", yScaleBar(0))
        .attr("y2", yScaleBar(0))
        .attr("stroke", "#4b5563")
        .attr("stroke-width", 2)
        .attr("stroke-opacity", 0.5);
    }

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

  }, [utciData, aggregation, colorMode, gradientId, gradients, filter, aspectRatio, unitSystem]);

  const utciMin = d3.min(utciData, d => d.utci) || -40;
  const utciMax = d3.max(utciData, d => d.utci) || 50;

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
    <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between w-full sm:w-auto gap-3">
          <h3 className="text-sm font-semibold text-gray-800 whitespace-nowrap">UTCI Comfort</h3>
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
        <div className="px-4 py-3 bg-white border-b border-gray-50 flex flex-col gap-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex flex-col">
              <span className="text-gray-500 font-semibold uppercase tracking-wider text-[10px] mb-1">Average UTCI</span>
              <span className="font-medium text-gray-900 text-base">{stats.avg.toFixed(1)}{utciUnit}</span>
            </div>
            <div className="w-px h-8 bg-gray-100"></div>
            <div className="flex flex-col">
              <span className="text-gray-500 font-semibold uppercase tracking-wider text-[10px] mb-1">Min / Max</span>
              <span className="font-medium text-gray-900 text-base">{stats.min.toFixed(1)} / {stats.max.toFixed(1)}{utciUnit}</span>
            </div>
            <div className="w-px h-8 bg-gray-100"></div>
            <div className="flex flex-col">
              <span className="text-gray-500 font-semibold uppercase tracking-wider text-[10px] mb-1">Comfort Time</span>
              <span className="font-medium text-green-600 text-base">{(stats.comfortRatio * 100).toFixed(1)}%</span>
            </div>
            <div className="w-px h-8 bg-gray-100"></div>
            <div className="flex flex-col">
              <span className="text-gray-500 font-semibold uppercase tracking-wider text-[10px] mb-1">Samples</span>
              <span className="font-medium text-gray-900 text-base">{stats.count}</span>
            </div>
          </div>

          {/* Category Distribution Bar */}
          <div className="flex flex-col gap-2">
            <span className="text-gray-500 font-semibold uppercase tracking-wider text-[10px]">Stress Category Distribution</span>
            <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden flex">
              {stats.categoryPercentages.map((cp, i) => (
                <div 
                  key={i}
                  style={{ width: `${cp.percentage}%`, backgroundColor: cp.color }}
                  className="h-full transition-all duration-500"
                  title={`${cp.category}: ${cp.percentage.toFixed(1)}%`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {stats.categoryPercentages.map((cp, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cp.color }} />
                  <span className="text-[10px] text-gray-600 capitalize">
                    {cp.category}: <span className="font-semibold">{cp.percentage.toFixed(1)}%</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="p-4 bg-white border-b border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Color Mode</label>
            <div className="flex bg-gray-50 border border-gray-200 p-1 rounded-lg">
              <button
                onClick={() => setColorMode('categories')}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  colorMode === 'categories' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Categories
              </button>
              <button
                onClick={() => setColorMode('gradient')}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  colorMode === 'gradient' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Gradient
              </button>
              <button
                onClick={() => setColorMode('comfortTime')}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  colorMode === 'comfortTime' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Comfort
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Include Factors</label>
            <div className="flex gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={includeSun} 
                  onChange={e => setIncludeSun(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-all"
                />
                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Sun</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={includeWind} 
                  onChange={e => setIncludeWind(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-all"
                />
                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Wind</span>
              </label>
            </div>
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

      <div className="p-4 flex-1 flex flex-col">
        <div className="w-full" style={{ aspectRatio: aspectRatio }}>
          <svg ref={svgRef} className="w-full h-full" />
        </div>
        
        {/* Custom Legend for UTCI */}
        <div className="mt-4">
          {colorMode === 'categories' ? (
            <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">UTCI Categories</h4>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {Object.entries(UTCI_COLORS).map(([category, color]) => (
                  <div key={category} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }}></div>
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
            />
          ) : (
            <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Time in Comfort Zone</h4>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 font-medium">0%</span>
                <div className="h-3 flex-1 rounded-full" style={{ background: 'linear-gradient(to right, #ffffff, #22c55e)', border: '1px solid #e5e7eb' }}></div>
                <span className="text-xs text-gray-500 font-medium">100%</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
