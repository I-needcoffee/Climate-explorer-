/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { MapSelector } from './components/MapSelector';
import { SunPath } from './components/SunPath';
import { DataExplorer } from './components/DataExplorer';
import { WindExplorer } from './components/WindExplorer';
import { UtciExplorer } from './components/UtciExplorer';
import { GlobalFilterPanel, GlobalFilterState } from './components/GlobalFilterPanel';
import { SummaryStats } from './components/SummaryStats';
import { ParsedEPW } from './lib/epwParser';
import { MapPin, ArrowLeft, Plus, Sun, BarChart2, Wind, ThermometerSun, Palette } from 'lucide-react';
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
  
  const [globalFilter, setGlobalFilter] = useState<GlobalFilterState>({
    startMonth: 1,
    endMonth: 12,
    startHour: 0,
    endHour: 23
  });

  const allGradients = [...GRADIENTS, ...customGradients];

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
    setActiveCharts(prev => [...prev, { id: `${type}-${Date.now()}`, type }]);
  };

  const removeChart = (id: string) => {
    setActiveCharts(prev => prev.filter(chart => chart.id !== id));
  };

  if (!epwData) {
    return (
      <div className="h-screen w-screen overflow-hidden font-sans bg-gray-50">
        <MapSelector onSelect={handleSelectEPW} />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-50 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 z-20 flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <button 
            onClick={() => setEpwData(null)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600 border border-transparent hover:border-gray-200"
            title="Back to Map"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200 flex-1 sm:flex-none">
            <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700 truncate max-w-[200px] sm:max-w-md">
              {epwData.metadata.city}, {epwData.metadata.country}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
          <div className="flex items-center bg-gray-100 p-1 rounded-lg mr-2">
            <button
              onClick={() => setUnitSystem('metric')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${unitSystem === 'metric' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Metric
            </button>
            <button
              onClick={() => setUnitSystem('imperial')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${unitSystem === 'imperial' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Imperial
            </button>
          </div>
          <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block"></div>
          <button
            onClick={() => addChart('sunpath')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 active:scale-95 text-gray-700 rounded-lg text-sm font-medium transition-all shadow-sm whitespace-nowrap"
            title="Add Sun Path"
          >
            <Sun className="w-4 h-4 text-amber-500" />
            <span className="inline">Sun Path</span>
          </button>
          <button
            onClick={() => addChart('explorer')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 active:scale-95 text-gray-700 rounded-lg text-sm font-medium transition-all shadow-sm whitespace-nowrap"
            title="Add Data Explorer"
          >
            <BarChart2 className="w-4 h-4 text-blue-500" />
            <span className="inline">Data Explorer</span>
          </button>
          <button
            onClick={() => addChart('wind')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 active:scale-95 text-gray-700 rounded-lg text-sm font-medium transition-all shadow-sm whitespace-nowrap"
            title="Add Wind Explorer"
          >
            <Wind className="w-4 h-4 text-teal-500" />
            <span className="inline">Wind</span>
          </button>
          <button
            onClick={() => addChart('utci')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 active:scale-95 text-gray-700 rounded-lg text-sm font-medium transition-all shadow-sm whitespace-nowrap"
            title="Add UTCI Comfort"
          >
            <ThermometerSun className="w-4 h-4 text-orange-500" />
            <span className="inline">UTCI</span>
          </button>
          <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block"></div>
          <button
            onClick={() => setShowGradientModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 active:scale-95 text-gray-700 rounded-lg text-sm font-medium transition-all shadow-sm whitespace-nowrap"
            title="Create Custom Gradient"
          >
            <Palette className="w-4 h-4 text-purple-500" />
            <span className="inline">New Gradient</span>
          </button>
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

      {/* Global Filter Panel */}
      <GlobalFilterPanel filter={globalFilter} onChange={setGlobalFilter} />
      
      {/* Summary Stats */}
      <SummaryStats data={epwData.data} variables={epwData.variables} filter={globalFilter} unitSystem={unitSystem} />

      {/* Dashboard Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {activeCharts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <div className="w-24 h-24 mb-6 rounded-full bg-gray-100 flex items-center justify-center">
              <Plus className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="text-xl font-medium text-gray-600 mb-2">Your Dashboard is Empty</h3>
            <p className="text-sm max-w-md text-center">
              Add widgets from the top menu to start exploring the climate data for {epwData.metadata.city}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {activeCharts.map(chart => (
              <div key={chart.id} className="w-full flex justify-center">
                <div className="w-full max-w-4xl">
                  {chart.type === 'sunpath' && (
                    <SunPath
                      metadata={epwData.metadata}
                      data={epwData.data}
                      variables={epwData.variables}
                      onRemove={() => removeChart(chart.id)}
                      gradients={allGradients}
                      filter={globalFilter}
                      unitSystem={unitSystem}
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
                    />
                  )}
                  {chart.type === 'utci' && (
                    <UtciExplorer
                      data={epwData.data}
                      onRemove={() => removeChart(chart.id)}
                      gradients={allGradients}
                      filter={globalFilter}
                      unitSystem={unitSystem}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
