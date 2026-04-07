import { addHours, startOfYear } from 'date-fns';

export interface WeatherData {
  date: Date;
  hour: number;
  dayOfYear: number;
  month: number;
  temperature: number;
  radiation: number;
  windSpeed: number;
  humidity: number;
}

export interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
}

export const LOCATIONS: Location[] = [
  { id: 'nyc', name: 'New York, USA', lat: 40.7128, lng: -74.0060, type: 'TMY3' },
  { id: 'lon', name: 'London, UK', lat: 51.5074, lng: -0.1278, type: 'TMYx' },
  { id: 'tok', name: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503, type: 'TMY3' },
  { id: 'syd', name: 'Sydney, Australia', lat: -33.8688, lng: 151.2093, type: 'TMY3' },
  { id: 'sf', name: 'San Francisco, USA', lat: 37.7749, lng: -122.4194, type: 'TMY3' },
  { id: 'rio', name: 'Rio de Janeiro, Brazil', lat: -22.9068, lng: -43.1729, type: 'TMYx' },
  { id: 'cpt', name: 'Cape Town, South Africa', lat: -33.9249, lng: 18.4241, type: 'TMY3' },
];

export function generateWeatherData(location: Location): WeatherData[] {
  const data: WeatherData[] = [];
  const yearStart = startOfYear(new Date(2024, 0, 1)); // Use a non-leap year for simplicity (8760 hours)

  // Base profiles for different locations
  const isSouthern = location.lat < 0;
  const absLat = Math.abs(location.lat);
  const baseTemp = absLat > 40 ? 10 : absLat > 20 ? 20 : 25;
  const tempAmplitude = absLat > 40 ? 15 : absLat > 20 ? 10 : 5;

  for (let i = 0; i < 8760; i++) {
    const currentDate = addHours(yearStart, i);
    const hour = currentDate.getHours();
    const month = currentDate.getMonth();
    const dayOfYear = Math.floor(i / 24) + 1;

    // Seasonal variation (cosine wave, shifted for southern hemisphere)
    const seasonPhase = isSouthern ? (dayOfYear + 182) / 365 : dayOfYear / 365;
    const seasonalTemp = baseTemp - tempAmplitude * Math.cos(seasonPhase * 2 * Math.PI);

    // Diurnal variation (sine wave)
    const diurnalTemp = 5 * Math.sin(((hour - 6) / 24) * 2 * Math.PI);

    // Random noise
    const noise = (Math.random() - 0.5) * 4;

    const temperature = seasonalTemp + diurnalTemp + noise;

    // Radiation (depends on hour and season)
    let radiation = 0;
    if (hour > 6 && hour < 18) {
      const sunHeight = Math.sin(((hour - 6) / 12) * Math.PI);
      const summerBoost = isSouthern ? Math.cos(seasonPhase * 2 * Math.PI) : -Math.cos(seasonPhase * 2 * Math.PI);
      radiation = Math.max(0, sunHeight * 800 + summerBoost * 200 + noise * 50);
    }

    const windSpeed = Math.max(0, 3 + Math.sin(dayOfYear / 10) * 2 + noise);
    const humidity = Math.max(20, Math.min(100, 60 + Math.sin(hour / 24 * Math.PI) * 20 + noise * 5));

    data.push({
      date: currentDate,
      hour,
      dayOfYear,
      month,
      temperature,
      radiation,
      windSpeed,
      humidity,
    });
  }

  return data;
}
