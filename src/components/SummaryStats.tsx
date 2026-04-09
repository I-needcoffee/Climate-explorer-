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
  theme: 'light' | 'dark';
}

export function SummaryStats({ data, variables, filter, unitSystem, theme }: SummaryStatsProps) {
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
    <div className={`flex flex-wrap border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`} style={{ padding: '16px', gap: '32px' }}>
      <div className="flex flex-col">
        <span className={`font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} style={{ fontSize: '10px' }}>Avg Temp</span>
        <span className={`font-medium ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`} style={{ fontSize: '18px' }}>{avgTemp.toFixed(1)}{unitSystem === 'imperial' ? '°F' : '°C'}</span>
      </div>
      <div className={`w-px hidden sm:block ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`} style={{ height: '40px' }}></div>
      <div className="flex flex-col">
        <span className={`font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} style={{ fontSize: '10px' }}>Avg Humidity</span>
        <span className={`font-medium ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`} style={{ fontSize: '18px' }}>{avgRh.toFixed(0)}%</span>
      </div>
      <div className={`w-px hidden sm:block ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`} style={{ height: '40px' }}></div>
      <div className="flex flex-col">
        <span className={`font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} style={{ fontSize: '10px' }}>Avg Wind</span>
        <span className={`font-medium ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`} style={{ fontSize: '18px' }}>{avgWind.toFixed(1)} {unitSystem === 'imperial' ? 'mph' : 'm/s'}</span>
      </div>
      <div className={`w-px hidden sm:block ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`} style={{ height: '40px' }}></div>
      <div className="flex flex-col">
        <span className={`font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} style={{ fontSize: '10px' }}>Total Rainfall</span>
        <span className={`font-medium ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`} style={{ fontSize: '18px' }}>{totalRain.toFixed(unitSystem === 'imperial' ? 2 : 0)} {unitSystem === 'imperial' ? 'in' : 'mm'}</span>
      </div>
      {utciCount > 0 && (
        <>
          <div className={`w-px hidden sm:block ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`} style={{ height: '40px' }}></div>
          <div className="flex flex-col">
            <span className={`font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} style={{ fontSize: '10px' }}>Avg UTCI</span>
            <span className={`font-medium ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`} style={{ fontSize: '18px' }}>{avgUtci.toFixed(1)}{unitSystem === 'imperial' ? '°F' : '°C'}</span>
          </div>
          <div className={`w-px hidden sm:block ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`} style={{ height: '40px' }}></div>
          <div className="flex flex-col">
            <span className={`font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} style={{ fontSize: '10px' }}>Comfort Time</span>
            <span className={`font-medium ${theme === 'dark' ? 'text-green-400' : 'text-green-600'}`} style={{ fontSize: '18px' }}>{comfortPercent.toFixed(1)}%</span>
          </div>
        </>
      )}
      <div className={`w-px hidden sm:block ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`} style={{ height: '40px' }}></div>
      <div className="flex flex-col">
        <span className={`font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} style={{ fontSize: '10px' }}>Selected Hours</span>
        <span className={`font-medium ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`} style={{ fontSize: '18px' }}>{count}</span>
      </div>
    </div>
  );
}
