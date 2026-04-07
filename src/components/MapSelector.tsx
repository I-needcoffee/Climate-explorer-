import { useState, useRef, ChangeEvent, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Upload, ExternalLink, Database } from 'lucide-react';
import L from 'leaflet';
import { parseEPW, ParsedEPW } from '../lib/epwParser';

// Fix Leaflet icon issue in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const smallIcon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [12, 20],
  iconAnchor: [6, 20],
  popupAnchor: [1, -16],
  shadowSize: [20, 20]
});

interface EPWLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  url: string;
}

interface MapSelectorProps {
  onSelect: (data: ParsedEPW) => void;
}

// Component to handle bounding box filtering
function MapBoundsListener({ 
  locations, 
  setVisibleLocations 
}: { 
  locations: EPWLocation[], 
  setVisibleLocations: (locs: EPWLocation[]) => void 
}) {
  const map = useMapEvents({
    moveend: () => {
      updateVisible();
    },
    zoomend: () => {
      updateVisible();
    }
  });

  const updateVisible = () => {
    try {
      const bounds = map.getBounds();
      if (!bounds || !bounds.isValid()) return;
      
      // Add a small buffer to the bounds
      const paddedBounds = bounds.pad(0.1);
      
      const visible = locations.filter(loc => {
        if (typeof loc.lat !== 'number' || isNaN(loc.lat) || !isFinite(loc.lat) ||
            typeof loc.lng !== 'number' || isNaN(loc.lng) || !isFinite(loc.lng)) {
          return false;
        }
        return paddedBounds.contains([loc.lat, loc.lng]);
      });
      
      // Limit to 500 markers to prevent browser freeze
      setVisibleLocations(visible.slice(0, 500));
    } catch (e) {
      console.warn("Error updating visible locations:", e);
    }
  };

  // Initial update
  useEffect(() => {
    updateVisible();
  }, [locations]);

  return null;
}

// Component to handle flying to user location
function LocationFlyer({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (center && center.length === 2 && 
        typeof center[0] === 'number' && !isNaN(center[0]) && isFinite(center[0]) &&
        typeof center[1] === 'number' && !isNaN(center[1]) && isFinite(center[1])) {
      
      const size = map.getSize();
      if (size.x > 0 && size.y > 0) {
        map.flyTo(center, zoom, { duration: 1.5 });
      } else {
        map.setView(center, zoom);
      }
    }
  }, [center, zoom, map]);
  return null;
}

export function MapSelector({ onSelect }: MapSelectorProps) {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [locations, setLocations] = useState<EPWLocation[]>([]);
  const [visibleLocations, setVisibleLocations] = useState<EPWLocation[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Default to Seattle region
  const [mapCenter, setMapCenter] = useState<[number, number]>([47.6062, -122.3321]);
  const [mapZoom, setMapZoom] = useState(7);

  useEffect(() => {
    // Try to get user's actual location
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = Number(position.coords.latitude);
          const lng = Number(position.coords.longitude);
          if (typeof lat === 'number' && !isNaN(lat) && isFinite(lat) &&
              typeof lng === 'number' && !isNaN(lng) && isFinite(lng)) {
            setMapCenter([lat, lng]);
            setMapZoom(8);
          }
        },
        (error) => {
          console.log("Geolocation error or denied, using default location.", error);
        },
        { timeout: 5000 }
      );
    }

    const fetchLocations = async () => {
      try {
        const response = await fetch('https://raw.githubusercontent.com/NREL/EnergyPlus/develop/weather/master.geojson');
        if (!response.ok) throw new Error('Failed to fetch EPW database');
        
        const geojson = await response.json();
        
        const parsedLocations: EPWLocation[] = geojson.features.map((feature: any, index: number) => {
          // Extract URL from HTML string: <a href=https://...>Download...</a>
          const epwHtml = feature.properties.epw || '';
          const urlMatch = epwHtml.match(/href=([^>]+)>/);
          const url = urlMatch ? urlMatch[1] : '';
          
          const coords = feature.geometry?.coordinates;
          const lat = coords && coords.length >= 2 ? Number(coords[1]) : NaN;
          const lng = coords && coords.length >= 2 ? Number(coords[0]) : NaN;
          
          return {
            id: `epw-${index}`,
            name: feature.properties.title || 'Unknown Location',
            lat,
            lng,
            url: url
          };
        }).filter((loc: EPWLocation) => {
          return loc.url && 
                 typeof loc.lat === 'number' && !isNaN(loc.lat) && isFinite(loc.lat) &&
                 typeof loc.lng === 'number' && !isNaN(loc.lng) && isFinite(loc.lng);
        });
        
        setLocations(parsedLocations);
      } catch (error) {
        console.error("Error loading EPW database:", error);
        setErrorMsg("Failed to load global weather database.");
      } finally {
        setLoadingDb(false);
      }
    };

    fetchLocations();
  }, []);

  const filteredLocations = useMemo(() => {
    if (!search.trim()) return visibleLocations;
    
    const searchLower = search.toLowerCase();
    // When searching, search across ALL locations, not just visible ones
    // Limit to 100 results to prevent lag
    return locations
      .filter(loc => loc.name.toLowerCase().includes(searchLower))
      .slice(0, 100);
  }, [search, locations, visibleLocations]);

  const handleSampleSelect = async (loc: EPWLocation) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch(`/api/proxy-epw?url=${encodeURIComponent(loc.url)}`);
      if (!response.ok) throw new Error("Failed to fetch EPW file");
      const text = await response.text();
      const parsed = parseEPW(text);
      onSelect(parsed);
    } catch (error) {
      console.error(error);
      setErrorMsg("Failed to load weather file. The file might be unavailable.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseEPW(text);
        onSelect(parsed);
      } catch (error) {
        console.error(error);
        setErrorMsg("Failed to parse EPW file. Ensure it is a valid format.");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="h-full w-full relative bg-gray-50">
      {(loading || loadingDb) && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-[2000] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-700 font-medium">
              {loadingDb ? "Loading global weather database..." : "Loading weather data..."}
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[2000] bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl shadow-md flex items-center gap-3">
          <span className="block sm:inline">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-700 hover:text-red-900 font-bold">
            &times;
          </button>
        </div>
      )}

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-3xl px-4 flex flex-col sm:flex-row gap-2 items-center pointer-events-none">
        <div className="relative flex-1 w-full flex items-center gap-2 pointer-events-auto bg-white p-2 rounded-full shadow-sm border border-gray-200">
          <div className="bg-blue-50 p-2 rounded-full text-blue-600 flex-shrink-0" title="Live Database Connected">
            <Database className="w-5 h-5" />
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder={`Search ${locations.length > 0 ? locations.length : '...'} global locations...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-transparent border-none focus:ring-0 outline-none transition-all text-sm text-gray-700"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2 pointer-events-auto">
          <input 
            type="file" 
            accept=".epw" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center w-12 h-12 bg-white text-blue-600 rounded-full shadow-sm hover:bg-gray-50 transition-colors border border-gray-200"
            title="Upload .epw"
          >
            <Upload className="w-5 h-5" />
          </button>
          
          <a
            href="https://climate.onebuilding.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-12 h-12 bg-white text-gray-600 rounded-full shadow-sm hover:bg-gray-50 transition-colors border border-gray-200"
            title="OneBuilding EPW"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
        </div>
      </div>
      
      <div className="h-full w-full z-0">
        {typeof mapCenter[0] === 'number' && !isNaN(mapCenter[0]) && isFinite(mapCenter[0]) &&
         typeof mapCenter[1] === 'number' && !isNaN(mapCenter[1]) && isFinite(mapCenter[1]) ? (
          <MapContainer center={mapCenter} zoom={mapZoom} className="h-full w-full" minZoom={2} zoomControl={false}>
            <LocationFlyer center={mapCenter} zoom={mapZoom} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            <MapBoundsListener locations={locations} setVisibleLocations={setVisibleLocations} />
            
            {filteredLocations.map((loc) => {
              if (typeof loc.lat !== 'number' || isNaN(loc.lat) || !isFinite(loc.lat) ||
                  typeof loc.lng !== 'number' || isNaN(loc.lng) || !isFinite(loc.lng)) {
                return null;
              }
              return (
                <Marker key={loc.id} position={[loc.lat, loc.lng]} icon={smallIcon}>
                  <Popup className="rounded-2xl">
                    <div className="p-2 text-center max-w-[200px]">
                      <h3 className="font-semibold text-gray-900 break-words">{loc.name}</h3>
                      <p className="text-xs text-gray-500 mb-3 mt-1">EnergyPlus Weather Database</p>
                      <button
                        onClick={() => handleSampleSelect(loc)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors w-full shadow-sm"
                      >
                        Load Data
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-gray-100">
            <p className="text-gray-500">Initializing map...</p>
          </div>
        )}
      </div>
    </div>
  );
}
