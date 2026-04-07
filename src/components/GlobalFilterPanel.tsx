import { useState } from 'react';
import { Calendar, Clock, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';

export interface GlobalFilterState {
  startMonth: number; // 1-12
  endMonth: number; // 1-12
  startHour: number; // 0-23
  endHour: number; // 0-23
}

interface GlobalFilterPanelProps {
  filter: GlobalFilterState;
  onChange: (filter: GlobalFilterState) => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function GlobalFilterPanel({ filter, onChange }: GlobalFilterPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="bg-white border-b border-gray-200 z-10 shadow-sm rounded-b-2xl mx-4 mt-2 overflow-hidden border-x border-t">
      <div 
        className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2 text-gray-700 font-semibold">
          <Filter className="w-4 h-4 text-blue-600" />
          <span>Global Time Filters</span>
          <span className="text-xs font-normal text-gray-500 ml-2">
            {filter.startMonth <= filter.endMonth 
              ? `${MONTHS[filter.startMonth - 1]} - ${MONTHS[filter.endMonth - 1]}`
              : `${MONTHS[filter.startMonth - 1]} - ${MONTHS[filter.endMonth - 1]} (Over Year)`} 
            | {filter.startHour.toString().padStart(2, '0')}:00 - {filter.endHour.toString().padStart(2, '0')}:59
          </span>
        </div>
        {isCollapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
      </div>

      {!isCollapsed && (
        <div className="px-4 py-4 flex flex-col gap-6 border-t border-gray-100">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Month Filter */}
            <div className="flex flex-col gap-3 flex-1">
              <div className="flex items-center justify-between text-gray-700 font-medium">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-semibold">Months</span>
                </div>
                <span className="text-xs text-gray-500 font-mono bg-gray-50 px-2 py-0.5 rounded font-medium border border-gray-100">
                  {filter.startMonth <= filter.endMonth 
                    ? `${MONTHS[filter.startMonth - 1]} - ${MONTHS[filter.endMonth - 1]}`
                    : `${MONTHS[filter.startMonth - 1]} - ${MONTHS[filter.endMonth - 1]} (Wrap)`}
                </span>
              </div>
              <div className="flex items-center gap-2 px-2 py-2">
                <Slider 
                  range 
                  min={1} 
                  max={12} 
                  value={[filter.startMonth, filter.endMonth]} 
                  onChange={(val) => {
                    if (Array.isArray(val)) {
                      onChange({ ...filter, startMonth: val[0], endMonth: val[1] });
                    }
                  }}
                  trackStyle={[{ backgroundColor: '#3b82f6' }]}
                  handleStyle={[
                    { borderColor: '#3b82f6', backgroundColor: 'white', opacity: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
                    { borderColor: '#3b82f6', backgroundColor: 'white', opacity: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                  ]}
                  railStyle={{ backgroundColor: '#f3f4f6' }}
                />
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {[
                  { label: 'Spring', range: [3, 5] },
                  { label: 'Summer', range: [6, 8] },
                  { label: 'Fall', range: [9, 11] },
                  { label: 'Winter', range: [12, 2] },
                  { label: 'Annual', range: [1, 12] }
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => onChange({ ...filter, startMonth: preset.range[0], endMonth: preset.range[1] })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors border ${
                      filter.startMonth === preset.range[0] && filter.endMonth === preset.range[1]
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="hidden lg:block w-px h-auto bg-gray-100"></div>

            {/* Hour Filter */}
            <div className="flex flex-col gap-3 flex-1">
              <div className="flex items-center justify-between text-gray-700 font-medium">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-semibold">Hours</span>
                </div>
                <span className="text-xs text-gray-500 font-mono bg-gray-50 px-2 py-0.5 rounded font-medium border border-gray-100">
                  {filter.startHour.toString().padStart(2, '0')}:00 - {filter.endHour.toString().padStart(2, '0')}:59
                </span>
              </div>
              <div className="flex items-center gap-2 px-2 py-2">
                <Slider 
                  range 
                  min={0} 
                  max={23} 
                  value={[filter.startHour, filter.endHour]} 
                  onChange={(val) => {
                    if (Array.isArray(val)) {
                      onChange({ ...filter, startHour: val[0], endHour: val[1] });
                    }
                  }}
                  trackStyle={[{ backgroundColor: '#f59e0b' }]}
                  handleStyle={[
                    { borderColor: '#f59e0b', backgroundColor: 'white', opacity: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
                    { borderColor: '#f59e0b', backgroundColor: 'white', opacity: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                  ]}
                  railStyle={{ backgroundColor: '#f3f4f6' }}
                />
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {[
                  { label: '7am - 7pm', range: [7, 19] },
                  { label: 'Morning (7-11)', range: [7, 11] },
                  { label: 'Midday (11-3)', range: [11, 15] },
                  { label: 'Afternoon (4-7)', range: [16, 19] },
                  { label: 'All Day', range: [0, 23] }
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => onChange({ ...filter, startHour: preset.range[0], endHour: preset.range[1] })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors border ${
                      filter.startHour === preset.range[0] && filter.endHour === preset.range[1]
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
