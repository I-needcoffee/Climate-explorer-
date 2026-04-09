import { useState } from 'react';
import { X, Calendar, Clock, Palette, Sun, Moon, Settings2 } from 'lucide-react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { GlobalFilterState } from './GlobalFilterPanel';
import { UnitSystem } from '../App';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  filter: GlobalFilterState;
  onChangeFilter: (filter: GlobalFilterState) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  unitSystem: UnitSystem;
  setUnitSystem: (unit: UnitSystem) => void;
  heatmapTextColor: string;
  setHeatmapTextColor: (color: string) => void;
  setShowGradientModal: (show: boolean) => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function SettingsModal({
  isOpen,
  onClose,
  filter,
  onChangeFilter,
  theme,
  setTheme,
  unitSystem,
  setUnitSystem,
  heatmapTextColor,
  setHeatmapTextColor,
  setShowGradientModal
}: SettingsModalProps) {
  if (!isOpen) return null;

  const getGrayscaleValue = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    return Math.round((r / 255) * 100);
  };

  const setGrayscaleValue = (val: number) => {
    const gray = Math.round((val / 100) * 255);
    const hex = `#${gray.toString(16).padStart(2, '0').repeat(3)}`;
    setHeatmapTextColor(hex);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className={`rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}>
        <div className={`flex items-center justify-between p-4 border-b sticky top-0 z-10 ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center gap-2 font-semibold">
            <Settings2 className="w-5 h-5 text-blue-500" />
            <span>Settings</span>
          </div>
          <button onClick={onClose} className={`p-1 rounded-full transition-colors ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Unit System */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              Unit System
            </h3>
            <div className={`flex items-center p-1 rounded-lg inline-flex ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
              <button
                onClick={() => setUnitSystem('metric')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${unitSystem === 'metric' ? (theme === 'dark' ? 'bg-gray-600 shadow-sm text-white' : 'bg-white shadow-sm text-gray-900') : (theme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700')}`}
              >
                Metric
              </button>
              <button
                onClick={() => setUnitSystem('imperial')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${unitSystem === 'imperial' ? (theme === 'dark' ? 'bg-gray-600 shadow-sm text-white' : 'bg-white shadow-sm text-gray-900') : (theme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700')}`}
              >
                Imperial
              </button>
            </div>
          </div>

          {/* Time Filters */}
          <div className="space-y-6">
            <h3 className="font-semibold text-sm border-b pb-2 flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-500" />
              Global Time Filters
            </h3>
            
            {/* Month Filter */}
            <div className="space-y-3">
              <div className="flex items-center justify-between font-medium text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span>Months</span>
                </div>
                <span className={`font-mono px-2 py-0.5 rounded border text-xs ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
                  {filter.startMonth <= filter.endMonth 
                    ? `${MONTHS[filter.startMonth - 1]} - ${MONTHS[filter.endMonth - 1]}`
                    : `${MONTHS[filter.startMonth - 1]} - ${MONTHS[filter.endMonth - 1]} (Wrap)`}
                </span>
              </div>
              <div className="px-2">
                <Slider 
                  range 
                  min={1} 
                  max={12} 
                  value={[filter.startMonth, filter.endMonth]} 
                  onChange={(val) => {
                    if (Array.isArray(val)) {
                      onChangeFilter({ ...filter, startMonth: val[0], endMonth: val[1] });
                    }
                  }}
                  trackStyle={[{ backgroundColor: '#3b82f6', height: '4px' }]}
                  handleStyle={[
                    { borderColor: '#3b82f6', backgroundColor: 'white', opacity: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', width: '14px', height: '14px', marginTop: '-5px' },
                    { borderColor: '#3b82f6', backgroundColor: 'white', opacity: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', width: '14px', height: '14px', marginTop: '-5px' }
                  ]}
                  railStyle={{ backgroundColor: theme === 'dark' ? '#374151' : '#f3f4f6', height: '4px' }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Spring', range: [3, 5] },
                  { label: 'Summer', range: [6, 8] },
                  { label: 'Fall', range: [9, 11] },
                  { label: 'Winter', range: [12, 2] },
                  { label: 'Annual', range: [1, 12] }
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => onChangeFilter({ ...filter, startMonth: preset.range[0], endMonth: preset.range[1] })}
                    className={`text-xs font-medium rounded-md transition-colors border px-3 py-1.5 ${
                      filter.startMonth === preset.range[0] && filter.endMonth === preset.range[1]
                        ? (theme === 'dark' ? 'bg-blue-900/50 text-blue-300 border-blue-800' : 'bg-blue-50 text-blue-700 border-blue-200')
                        : (theme === 'dark' ? 'bg-transparent text-gray-400 border-gray-700 hover:bg-gray-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Hour Filter */}
            <div className="space-y-3">
              <div className="flex items-center justify-between font-medium text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span>Hours</span>
                </div>
                <span className={`font-mono px-2 py-0.5 rounded border text-xs ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
                  {filter.startHour.toString().padStart(2, '0')}:00 - {filter.endHour.toString().padStart(2, '0')}:59
                </span>
              </div>
              <div className="px-2">
                <Slider 
                  range 
                  min={0} 
                  max={23} 
                  value={[filter.startHour, filter.endHour]} 
                  onChange={(val) => {
                    if (Array.isArray(val)) {
                      onChangeFilter({ ...filter, startHour: val[0], endHour: val[1] });
                    }
                  }}
                  trackStyle={[{ backgroundColor: '#f59e0b', height: '4px' }]}
                  handleStyle={[
                    { borderColor: '#f59e0b', backgroundColor: 'white', opacity: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', width: '14px', height: '14px', marginTop: '-5px' },
                    { borderColor: '#f59e0b', backgroundColor: 'white', opacity: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', width: '14px', height: '14px', marginTop: '-5px' }
                  ]}
                  railStyle={{ backgroundColor: theme === 'dark' ? '#374151' : '#f3f4f6', height: '4px' }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: '7am - 7pm', range: [7, 19] },
                  { label: 'Morning (7-11)', range: [7, 11] },
                  { label: 'Midday (11-3)', range: [11, 15] },
                  { label: 'Afternoon (4-7)', range: [16, 19] },
                  { label: 'All Day', range: [0, 23] }
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => onChangeFilter({ ...filter, startHour: preset.range[0], endHour: preset.range[1] })}
                    className={`text-xs font-medium rounded-md transition-colors border px-3 py-1.5 ${
                      filter.startHour === preset.range[0] && filter.endHour === preset.range[1]
                        ? (theme === 'dark' ? 'bg-amber-900/50 text-amber-300 border-amber-800' : 'bg-amber-50 text-amber-700 border-amber-200')
                        : (theme === 'dark' ? 'bg-transparent text-gray-400 border-gray-700 hover:bg-gray-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Graphics Adjustments */}
          <div className="space-y-6">
            <h3 className="font-semibold text-sm border-b pb-2 flex items-center gap-2">
              <Palette className="w-4 h-4 text-purple-500" />
              Graphics Adjustments
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Theme Toggle */}
              <div className="space-y-3">
                <span className="font-medium text-sm">Interface Theme</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setTheme('light');
                      setHeatmapTextColor('#000000');
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg font-medium transition-colors border text-sm p-2 ${theme === 'light' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-transparent text-gray-400 border-gray-700 hover:bg-gray-700'}`}
                  >
                    <Sun className="w-4 h-4" />
                    Light
                  </button>
                  <button
                    onClick={() => {
                      setTheme('dark');
                      setHeatmapTextColor('#ffffff');
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg font-medium transition-colors border text-sm p-2 ${theme === 'dark' ? 'bg-indigo-900/50 text-indigo-300 border-indigo-700' : 'bg-transparent text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                  >
                    <Moon className="w-4 h-4" />
                    Dark
                  </button>
                </div>
              </div>

              {/* Text Color Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between font-medium text-sm">
                  <span>Chart Text Color</span>
                  <div className="flex items-center gap-2">
                    <div 
                      className={`w-3 h-3 rounded border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-200'}`} 
                      style={{ backgroundColor: heatmapTextColor }}
                    />
                    <span className={`font-mono px-2 py-0.5 rounded border text-xs ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
                      {heatmapTextColor.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-2">
                  <span className={`font-bold uppercase tracking-wider text-[10px] ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Black</span>
                  <div className="flex-1">
                    <Slider 
                      min={0} 
                      max={100} 
                      value={getGrayscaleValue(heatmapTextColor)} 
                      onChange={(val) => {
                        if (typeof val === 'number') {
                          setGrayscaleValue(val);
                        }
                      }}
                      trackStyle={[{ backgroundColor: '#8b5cf6', height: '4px' }]}
                      handleStyle={[
                        { borderColor: '#8b5cf6', backgroundColor: 'white', opacity: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', width: '14px', height: '14px', marginTop: '-5px' }
                      ]}
                      railStyle={{ background: 'linear-gradient(to right, #000, #fff)', height: '4px' }}
                    />
                  </div>
                  <span className={`font-bold uppercase tracking-wider text-[10px] ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>White</span>
                </div>
              </div>

              {/* Color Palettes */}
              <div className="space-y-3 sm:col-span-2">
                <span className="font-medium text-sm">Color Palettes</span>
                <button
                  onClick={() => {
                    onClose();
                    setShowGradientModal(true);
                  }}
                  className={`flex items-center justify-center gap-1.5 w-full rounded-lg font-medium transition-colors border text-sm p-2 ${theme === 'dark' ? 'bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border-purple-800' : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-100'}`}
                >
                  <Palette className="w-4 h-4" />
                  Create New Gradient
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
