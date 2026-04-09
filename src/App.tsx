/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { MapSelector } from './components/MapSelector';
import { SunPath } from './components/SunPath';
import { DataExplorer } from './components/DataExplorer';
import { WindExplorer } from './components/WindExplorer';
import { UtciExplorer } from './components/UtciExplorer';
import { GlobalFilterState } from './components/GlobalFilterPanel';
import { SettingsModal } from './components/SettingsModal';
import { SummaryStats } from './components/SummaryStats';
import { ParsedEPW } from './lib/epwParser';
import { MapPin, ArrowLeft, Plus, Sun, BarChart2, Wind, ThermometerSun, Activity, Settings2 } from 'lucide-react';
import { GRADIENTS } from './lib/constants';
import { GradientDef } from './components/InteractiveLegend';

type ChartType = 'sunpath' | 'explorer' | 'wind' | 'utci';

interface ActiveChart {
  id: string;
  type: ChartType;
}

export type UnitSystem = 'metric' | 'imperial';

export default function App() {
  const [epwData, setEpwData] = useState<ParsedEPW | null>(null);
  const [activeCharts, setActiveCharts] = useState<ActiveChart[]>([
    { id: 'initial-sunpath', type: 'sunpath' },
    { id: 'initial-explorer', type: 'explorer' },
    { id: 'initial-wind', type: 'wind' },
    { id: 'initial-utci', type: 'utci' }
  ]);
  const [customGradients, setCustomGradients] = useState<GradientDef[]>([]);
  const [showGradientModal, setShowGradientModal] = useState(false);
  const [newGradientName, setNewGradientName] = useState('');
  const [newGradientColors, setNewGradientColors] = useState<string[]>(['#ff0000', '#0000ff']);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [heatmapTextColor, setHeatmapTextColor] = useState<string>('#000000');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [showSummaryStats, setShowSummaryStats] = useState(false);
  const summaryStatsRef = useRef<HTMLDivElement>(null);
  
  const [globalFilter, setGlobalFilter] = useState<GlobalFilterState>({
    startMonth: 1,
    endMonth: 12,
    startHour: 0,
    endHour: 23
  });

  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const allGradients = [...GRADIENTS, ...customGradients];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (summaryStatsRef.current && !summaryStatsRef.current.contains(event.target as Node)) {
        setShowSummaryStats(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddGradient = () => {
    if (newGradientName && newGradientColors.length >= 2) {
      setCustomGradients(prev => [...prev, {
        id: `custom-${Date.now()}`,
        name: newGradientName,
        colors: newGradientColors
      }]);
      setShowGradientModal(false);
      setNewGradientName('');
      setNewGradientColors(['#ff0000', '#0000ff']);
    }
  };

  const handleSelectEPW = (data: ParsedEPW) => {
    setEpwData(data);
  };

  const addChart = (type: ChartType) => {
    const newId = `${type}-${Date.now()}`;
    setActiveCharts(prev => [...prev, { id: newId, type }]);
    setLayouts(prev => {
      const newLayouts = { ...prev };
      Object.keys(newLayouts).forEach(key => {
        const layout = newLayouts[key] || [];
        const maxY = Math.max(0, ...layout.map(l => l.y + l.h));
        const w = key === 'lg' ? 6 : 12;
        newLayouts[key] = [...layout, { i: newId, x: 0, y: maxY, w, h: 5, minW: 4, minH: 4 }];
      });
      return newLayouts;
    });
  };

  const removeChart = (id: string) => {
    setActiveCharts(prev => prev.filter(chart => chart.id !== id));
    setLayouts(prev => {
      const newLayouts = { ...prev };
      Object.keys(newLayouts).forEach(key => {
        newLayouts[key] = newLayouts[key].filter(l => l.i !== id);
      });
      return newLayouts;
    });
  };

  if (!epwData) {
    return (
      <div className="h-screen w-screen overflow-hidden font-sans bg-gray-50">
        <MapSelector onSelect={handleSelectEPW} />
      </div>
    );
  }

  return (
    <div className={`h-screen w-screen overflow-hidden flex flex-col font-sans transition-colors duration-300 ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-[#f2f2f2] text-gray-900'}`}>
      {/* Top Navigation Bar */}
      <div className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 z-20 flex-shrink-0 shadow-sm transition-colors duration-300`}>
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <button 
            onClick={() => setEpwData(null)}
            className={`p-2 rounded-full transition-colors border border-transparent ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-300 hover:border-gray-600' : 'hover:bg-gray-100 text-gray-600 hover:border-gray-200'}`}
            title="Back to Map"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border flex-1 sm:flex-none ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
            <MapPin className={`w-4 h-4 flex-shrink-0 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} />
            <span className={`text-sm font-medium truncate max-w-[200px] sm:max-w-md ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
              {epwData.metadata.city}, {epwData.metadata.country}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap pb-2 sm:pb-0">
          <button
            onClick={() => setShowSettingsModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border active:scale-95 rounded-lg text-sm font-medium transition-all shadow-sm whitespace-nowrap ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            title="Global Settings"
          >
            <Settings2 className="w-4 h-4 text-gray-500" />
            <span className="inline">Settings</span>
          </button>
          
          <div className={`h-6 w-px mx-1 hidden sm:block ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
          
          <div className="relative" ref={summaryStatsRef}>
            <button
              onClick={() => setShowSummaryStats(!showSummaryStats)}
              className={`flex items-center gap-1.5 px-3 py-1.5 border active:scale-95 rounded-lg text-sm font-medium transition-all shadow-sm whitespace-nowrap ${showSummaryStats ? (theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-100 border-gray-300 text-gray-900') : (theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}`}
              title="Overall Averages"
            >
              <Activity className="w-4 h-4 text-blue-500" />
              <span className="inline">Averages</span>
            </button>

            {showSummaryStats && (
              <div className={`absolute right-0 sm:right-0 mt-2 w-screen max-w-[calc(100vw-2rem)] sm:w-[800px] rounded-xl shadow-xl border z-50 overflow-hidden ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`} style={{ right: 'auto', left: '50%', transform: 'translateX(-50%)', marginLeft: '0' }}>
                <SummaryStats data={epwData.data} variables={epwData.variables} filter={globalFilter} unitSystem={unitSystem} theme={theme} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gradient Creator Modal */}
      {showGradientModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-4">Create Custom Gradient</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input 
                  type="text" 
                  value={newGradientName}
                  onChange={e => setNewGradientName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="e.g., My Cool Gradient"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colors</label>
                <div className="space-y-2">
                  {newGradientColors.map((color, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input 
                        type="color" 
                        value={color}
                        onChange={e => {
                          const newColors = [...newGradientColors];
                          newColors[i] = e.target.value;
                          setNewGradientColors(newColors);
                        }}
                        className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                      />
                      <input 
                        type="text" 
                        value={color}
                        onChange={e => {
                          const newColors = [...newGradientColors];
                          newColors[i] = e.target.value;
                          setNewGradientColors(newColors);
                        }}
                        className="flex-1 border border-gray-300 rounded-md px-3 py-1 text-sm font-mono"
                      />
                      {newGradientColors.length > 2 && (
                        <button 
                          onClick={() => setNewGradientColors(newGradientColors.filter((_, idx) => idx !== i))}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => setNewGradientColors([...newGradientColors, '#ffffff'])}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  + Add Color
                </button>
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <button 
                  onClick={() => setShowGradientModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-md"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddGradient}
                  disabled={!newGradientName || newGradientColors.length < 2}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                >
                  Save Gradient
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Area */}
      <div className="flex-1 overflow-y-auto relative">
        <div className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
          {showSettingsModal && (
            <SettingsModal
              onClose={() => setShowSettingsModal(false)}
              filter={globalFilter}
              onChangeFilter={setGlobalFilter}
              theme={theme}
              setTheme={setTheme}
              unitSystem={unitSystem}
              setUnitSystem={setUnitSystem}
              heatmapTextColor={heatmapTextColor}
              setHeatmapTextColor={setHeatmapTextColor}
              setShowGradientModal={setShowGradientModal}
            />
          )}

          {activeCharts.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-gray-400">
              <div className="w-24 h-24 mb-6 rounded-full bg-gray-100 flex items-center justify-center">
                <Plus className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-xl font-medium text-gray-600 mb-2">Your Dashboard is Empty</h3>
              <p className="text-sm max-w-md text-center">
                Add widgets below to start exploring the climate data for {epwData.metadata.city}.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {activeCharts.map(chart => (
                <div key={chart.id} className={`w-full h-fit flex flex-col bg-white dark:bg-gray-800 rounded-xl border transition-all ${theme === 'dark' ? 'border-gray-700 shadow-sm' : 'border-gray-200 shadow-[5px_5px_0px_0px_#d9d9d9]'} overflow-hidden`}>
                  <div className="flex-1">
                    {chart.type === 'sunpath' && (
                      <SunPath
                        metadata={epwData.metadata}
                        data={epwData.data}
                        variables={epwData.variables}
                        onRemove={() => removeChart(chart.id)}
                        gradients={allGradients}
                        filter={globalFilter}
                        unitSystem={unitSystem}
                        heatmapTextColor={heatmapTextColor}
                        theme={theme}
                        setShowGradientModal={setShowGradientModal}
                      />
                    )}
                    {chart.type === 'explorer' && (
                      <DataExplorer
                        data={epwData.data}
                        variables={epwData.variables}
                        onRemove={() => removeChart(chart.id)}
                        gradients={allGradients}
                        filter={globalFilter}
                        unitSystem={unitSystem}
                        heatmapTextColor={heatmapTextColor}
                        theme={theme}
                        setShowGradientModal={setShowGradientModal}
                      />
                    )}
                    {chart.type === 'wind' && (
                      <WindExplorer
                        data={epwData.data}
                        variables={epwData.variables}
                        onRemove={() => removeChart(chart.id)}
                        gradients={allGradients}
                        filter={globalFilter}
                        unitSystem={unitSystem}
                        heatmapTextColor={heatmapTextColor}
                        theme={theme}
                        setShowGradientModal={setShowGradientModal}
                      />
                    )}
                    {chart.type === 'utci' && (
                      <UtciExplorer
                        data={epwData.data}
                        onRemove={() => removeChart(chart.id)}
                        gradients={allGradients}
                        filter={globalFilter}
                        unitSystem={unitSystem}
                        heatmapTextColor={heatmapTextColor}
                        theme={theme}
                        setShowGradientModal={setShowGradientModal}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Chart Buttons (at the bottom of scroll) */}
          <div className="pt-12 pb-20">
            <div className={`flex flex-col items-center gap-6 p-8 rounded-3xl border-2 border-dashed transition-colors ${theme === 'dark' ? 'bg-gray-800/30 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              <div className="text-center">
                <h4 className={`text-lg font-semibold mb-1 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>Add More Analysis</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Expand your dashboard with additional visualizations</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-6">
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => addChart('sunpath')}
                    className={`w-16 h-16 flex items-center justify-center rounded-2xl transition-all hover:scale-110 shadow-md border-2 ${
                      theme === 'dark' 
                        ? 'bg-amber-900/20 border-amber-800 text-amber-400 hover:bg-amber-900/40' 
                        : 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100'
                    }`}
                    title="Add Sun Path"
                  >
                    <Sun className="w-8 h-8" />
                  </button>
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Sun Path</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => addChart('explorer')}
                    className={`w-16 h-16 flex items-center justify-center rounded-2xl transition-all hover:scale-110 shadow-md border-2 ${
                      theme === 'dark' 
                        ? 'bg-blue-900/20 border-blue-800 text-blue-400 hover:bg-blue-900/40' 
                        : 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100'
                    }`}
                    title="Add Data Explorer"
                  >
                    <BarChart2 className="w-8 h-8" />
                  </button>
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Explorer</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => addChart('wind')}
                    className={`w-16 h-16 flex items-center justify-center rounded-2xl transition-all hover:scale-110 shadow-md border-2 ${
                      theme === 'dark' 
                        ? 'bg-teal-900/20 border-teal-800 text-teal-400 hover:bg-teal-900/40' 
                        : 'bg-teal-50 border-teal-200 text-teal-600 hover:bg-teal-100'
                    }`}
                    title="Add Wind Explorer"
                  >
                    <Wind className="w-8 h-8" />
                  </button>
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Wind Rose</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => addChart('utci')}
                    className={`w-16 h-16 flex items-center justify-center rounded-2xl transition-all hover:scale-110 shadow-md border-2 ${
                      theme === 'dark' 
                        ? 'bg-orange-900/20 border-orange-800 text-orange-400 hover:bg-orange-900/40' 
                        : 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100'
                    }`}
                    title="Add UTCI Comfort"
                  >
                    <ThermometerSun className="w-8 h-8" />
                  </button>
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">UTCI</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
