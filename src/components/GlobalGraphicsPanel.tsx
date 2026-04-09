import { useState } from 'react';
import { Settings2, ChevronDown, ChevronUp, Palette, Moon, Sun } from 'lucide-react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';

interface GlobalGraphicsPanelProps {
  heatmapTextColor: string;
  setHeatmapTextColor: (color: string) => void;
  setShowGradientModal: (show: boolean) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  fontScale: number;
  setFontScale: (scale: number) => void;
}

export function GlobalGraphicsPanel({ 
  heatmapTextColor, 
  setHeatmapTextColor, 
  setShowGradientModal, 
  theme, 
  setTheme, 
  fontScale,
  setFontScale
}: GlobalGraphicsPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

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
    <div className={`border-b z-10 shadow-sm rounded-b-2xl mx-4 mt-2 overflow-hidden border-x border-t transition-colors duration-300 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <div 
        className={`flex items-center justify-between px-4 py-2 cursor-pointer transition-colors ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className={`flex items-center gap-2 font-semibold text-sm ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
          <Settings2 className="w-4 h-4 text-purple-500" />
          <span>Global Graphics Adjustments</span>
          <span className={`font-normal ml-2 text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            Text Color: {heatmapTextColor.toUpperCase()} | Theme: {theme === 'dark' ? 'Dark' : 'Light'}
          </span>
        </div>
        {isCollapsed ? <ChevronDown className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} /> : <ChevronUp className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />}
      </div>

      {!isCollapsed && (
        <div className={`flex flex-col p-4 gap-6 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Text Color Slider */}
            <div className="flex flex-col gap-3 flex-1">
              <div className={`flex items-center justify-between font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                <span className="font-semibold text-sm">Text Color</span>
                <div className="flex items-center gap-2">
                  <div 
                    className={`w-3 h-3 rounded border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-200'}`} 
                    style={{ backgroundColor: heatmapTextColor }}
                  />
                  <span className={`font-mono px-2 py-0.5 rounded font-medium border text-xs ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                    {heatmapTextColor.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 px-2 py-2">
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

            <div className={`hidden lg:block w-px h-auto ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}></div>

            {/* Theme Toggle */}
            <div className="flex flex-col gap-3 flex-1">
              <div className={`flex items-center justify-between font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                <span className="font-semibold text-sm">Interface Theme</span>
              </div>
              <div className="flex items-center gap-2 px-2 py-2">
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

            <div className={`hidden lg:block w-px h-auto ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}></div>

            {/* Font Scale Slider */}
            <div className="flex flex-col gap-3 flex-1">
              <div className={`flex items-center justify-between font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                <span className="font-semibold text-sm">Chart Font Size</span>
                <span className={`font-mono px-2 py-0.5 rounded font-medium border text-xs ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                  {Math.round(fontScale * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-3 px-2 py-2">
                <span className={`font-bold uppercase tracking-wider text-[10px] ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>50%</span>
                <div className="flex-1">
                  <Slider 
                    min={0.5} 
                    max={2.0} 
                    step={0.05}
                    value={fontScale} 
                    onChange={(val) => {
                      if (typeof val === 'number') {
                        setFontScale(val);
                      }
                    }}
                    trackStyle={[{ backgroundColor: '#3b82f6', height: '4px' }]}
                    handleStyle={[
                      { borderColor: '#3b82f6', backgroundColor: 'white', opacity: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', width: '14px', height: '14px', marginTop: '-5px' }
                    ]}
                    railStyle={{ backgroundColor: theme === 'dark' ? '#374151' : '#e5e7eb', height: '4px' }}
                  />
                </div>
                <span className={`font-bold uppercase tracking-wider text-[10px] ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>200%</span>
              </div>
            </div>

            <div className={`hidden lg:block w-px h-auto ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}></div>

            {/* Color Palettes */}
            <div className="flex flex-col gap-3 flex-1">
              <div className={`flex items-center justify-between font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                <span className="font-semibold text-sm">Color Palettes</span>
              </div>
              <div className="flex items-center px-2 py-2">
                <button
                  onClick={() => setShowGradientModal(true)}
                  className={`flex items-center justify-center gap-1.5 w-full rounded-lg font-medium transition-colors border text-sm p-2 ${theme === 'dark' ? 'bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border-purple-800' : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-100'}`}
                >
                  <Palette className="w-4 h-4" />
                  Create New Gradient
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
