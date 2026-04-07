import { useState } from 'react';
import { EPWDataRow, EPWVariable } from '../lib/epwParser';
import { GlobalFilterState } from './GlobalFilterPanel';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { UnitSystem } from '../App';
import tc from 'jsthermalcomfort';

interface SummaryStatsProps {
  data: EPWDataRow[];
  variables: EPWVariable[];
  filter: GlobalFilterState;
  unitSystem: UnitSystem;
}

export function SummaryStats({ data, variables, filter, unitSystem }: SummaryStatsProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  // Filter data based on the global filter
  const filteredData = data.filter(d => {
    const isMonthMatch = filter.startMonth <= filter.endMonth
      ? (d.month >= filter.startMonth && d.month <= filter.endMonth)
      : (d.month >= filter.startMonth || d.month <= filter.endMonth);
    return isMonthMatch && 
           d.hour >= filter.startHour && 
           d.hour <= filter.endHour;
  });

  if (filteredData.length === 0) {
    return null;
  }

  // Calculate averages and totals
  const tempVar = variables.find(v => v.id === 'dryBulbTemperature');
  const rhVar = variables.find(v => v.id === 'relativeHumidity');
  const windVar = variables.find(v => v.id === 'windSpeed');
  const rainVar = variables.find(v => v.id === 'liquidPrecipitationDepth');

  let avgTemp = 0;
  let avgRh = 0;
  let avgWind = 0;
  let totalRain = 0;
  let avgUtci = 0;
  let utciCount = 0;
  let comfortHours = 0;

  filteredData.forEach(d => {
    if (tempVar) avgTemp += (d[tempVar.id] as number) || 0;
    if (rhVar) avgRh += (d[rhVar.id] as number) || 0;
    if (windVar) avgWind += (d[windVar.id] as number) || 0;
    if (rainVar) totalRain += (d[rainVar.id] as number) || 0;
    
    // Calculate UTCI
    const tdb = (d.dryBulbTemperature as number) || 20;
    const rh = (d.relativeHumidity as number) || 50;
    const windSpeed = (d.windSpeed as number) || 0.5;
    const ghr = (d.globalHorizontalRadiation as number) || 0;

    const v = Math.max(0.5, windSpeed);
    const tr = tdb + (0.02 * ghr);

    const result = tc.models.utci(tdb, tr, v, rh, 'SI', true, false);
    const utciVal = isNaN(result.utci) ? tdb : result.utci;
    
    avgUtci += utciVal;
    utciCount++;
    
    if (utciVal >= 9 && utciVal <= 26) {
      comfortHours++;
    }
  });

  const count = filteredData.length;
  avgTemp /= count;
  avgRh /= count;
  avgWind /= count;
  if (utciCount > 0) avgUtci /= utciCount;

  // Convert units if imperial
  if (unitSystem === 'imperial') {
    avgTemp = avgTemp * 9/5 + 32;
    avgWind = avgWind * 2.23694; // m/s to mph
    totalRain = totalRain / 25.4; // mm to inches
    avgUtci = avgUtci * 9/5 + 32;
  }

  // Calculate comfort percentage (UTCI between 9 and 26)
  const comfortPercent = utciCount > 0 ? (comfortHours / utciCount) * 100 : 0;

  return (
    <div className="bg-white border-b border-gray-200 z-10 shadow-sm text-sm rounded-b-2xl mx-4 mb-4 overflow-hidden border-x border-t">
      <div className="px-4 py-2 flex items-center justify-between bg-white cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setIsCollapsed(!isCollapsed)}>
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Primary Averages</span>
        {isCollapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
      </div>
      
      {!isCollapsed && (
        <div className="px-4 py-4 flex flex-wrap gap-8 border-t border-gray-100">
          <div className="flex flex-col">
            <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Avg Temp</span>
            <span className="font-medium text-gray-900 text-lg">{avgTemp.toFixed(1)}{unitSystem === 'imperial' ? '°F' : '°C'}</span>
          </div>
          <div className="w-px h-10 bg-gray-200 hidden sm:block"></div>
          <div className="flex flex-col">
            <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Avg Humidity</span>
            <span className="font-medium text-gray-900 text-lg">{avgRh.toFixed(0)}%</span>
          </div>
          <div className="w-px h-10 bg-gray-200 hidden sm:block"></div>
          <div className="flex flex-col">
            <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Avg Wind</span>
            <span className="font-medium text-gray-900 text-lg">{avgWind.toFixed(1)} {unitSystem === 'imperial' ? 'mph' : 'm/s'}</span>
          </div>
          <div className="w-px h-10 bg-gray-200 hidden sm:block"></div>
          <div className="flex flex-col">
            <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Total Rainfall</span>
            <span className="font-medium text-gray-900 text-lg">{totalRain.toFixed(unitSystem === 'imperial' ? 2 : 0)} {unitSystem === 'imperial' ? 'in' : 'mm'}</span>
          </div>
          {utciCount > 0 && (
            <>
              <div className="w-px h-10 bg-gray-200 hidden sm:block"></div>
              <div className="flex flex-col">
                <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Avg UTCI</span>
                <span className="font-medium text-gray-900 text-lg">{avgUtci.toFixed(1)}{unitSystem === 'imperial' ? '°F' : '°C'}</span>
              </div>
              <div className="w-px h-10 bg-gray-200 hidden sm:block"></div>
              <div className="flex flex-col">
                <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Comfort Time</span>
                <span className="font-medium text-green-600 text-lg">{comfortPercent.toFixed(1)}%</span>
              </div>
            </>
          )}
          <div className="w-px h-10 bg-gray-200 hidden sm:block"></div>
          <div className="flex flex-col">
            <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Selected Hours</span>
            <span className="font-medium text-gray-900 text-lg">{count}</span>
          </div>
        </div>
      )}
    </div>
  );
}
