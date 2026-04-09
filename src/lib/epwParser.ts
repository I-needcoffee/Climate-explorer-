export interface EPWMetadata {
  city: string;
  state: string;
  country: string;
  source: string;
  wmo: string;
  lat: number;
  lng: number;
  timeZone: number;
  elevation: number;
}

export interface EPWDataRow {
  date: Date;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfYear: number;
  [key: string]: any;
}

export interface EPWVariable {
  id: string;
  name: string;
  unit: string;
  min: number;
  max: number;
  category: string;
}

export const EPW_COLUMNS: { id: string; name: string; unit: string; missing: number; index: number; category: string }[] = [
  { id: 'dryBulbTemperature', name: 'Dry Bulb Temperature', unit: '°C', missing: 99.9, index: 6, category: 'Temperature' },
  { id: 'dewPointTemperature', name: 'Dew Point Temperature', unit: '°C', missing: 99.9, index: 7, category: 'Temperature' },
  { id: 'relativeHumidity', name: 'Relative Humidity', unit: '%', missing: 999, index: 8, category: 'Humidity' },
  { id: 'atmosphericPressure', name: 'Atmospheric Station Pressure', unit: 'Pa', missing: 999999, index: 9, category: 'Other' },
  { id: 'extraterrestrialHorizontalRadiation', name: 'Extraterrestrial Horizontal Radiation', unit: 'Wh/m²', missing: 9999, index: 10, category: 'Solar' },
  { id: 'extraterrestrialDirectNormalRadiation', name: 'Extraterrestrial Direct Normal Radiation', unit: 'Wh/m²', missing: 9999, index: 11, category: 'Solar' },
  { id: 'horizontalInfraredRadiation', name: 'Horizontal Infrared Radiation Intensity', unit: 'Wh/m²', missing: 9999, index: 12, category: 'Solar' },
  { id: 'globalHorizontalRadiation', name: 'Global Horizontal Radiation', unit: 'Wh/m²', missing: 9999, index: 13, category: 'Solar' },
  { id: 'directNormalRadiation', name: 'Direct Normal Radiation', unit: 'Wh/m²', missing: 9999, index: 14, category: 'Solar' },
  { id: 'diffuseHorizontalRadiation', name: 'Diffuse Horizontal Radiation', unit: 'Wh/m²', missing: 9999, index: 15, category: 'Solar' },
  { id: 'globalHorizontalIlluminance', name: 'Global Horizontal Illuminance', unit: 'lux', missing: 999999, index: 16, category: 'Solar' },
  { id: 'directNormalIlluminance', name: 'Direct Normal Illuminance', unit: 'lux', missing: 999999, index: 17, category: 'Solar' },
  { id: 'diffuseHorizontalIlluminance', name: 'Diffuse Horizontal Illuminance', unit: 'lux', missing: 999999, index: 18, category: 'Solar' },
  { id: 'zenithLuminance', name: 'Zenith Luminance', unit: 'Cd/m²', missing: 9999, index: 19, category: 'Solar' },
  { id: 'windDirection', name: 'Wind Direction', unit: 'deg', missing: 999, index: 20, category: 'Wind' },
  { id: 'windSpeed', name: 'Wind Speed', unit: 'm/s', missing: 999, index: 21, category: 'Wind' },
  { id: 'totalSkyCover', name: 'Total Sky Cover', unit: 'tenths', missing: 99, index: 22, category: 'Other' },
  { id: 'opaqueSkyCover', name: 'Opaque Sky Cover', unit: 'tenths', missing: 99, index: 23, category: 'Other' },
  { id: 'visibility', name: 'Visibility', unit: 'km', missing: 9999, index: 24, category: 'Other' },
  { id: 'ceilingHeight', name: 'Ceiling Height', unit: 'm', missing: 99999, index: 25, category: 'Other' },
  { id: 'precipitableWater', name: 'Precipitable Water', unit: 'mm', missing: 999, index: 28, category: 'Precipitation' },
  { id: 'aerosolOpticalDepth', name: 'Aerosol Optical Depth', unit: 'thousandths', missing: 0.999, index: 29, category: 'Other' },
  { id: 'snowDepth', name: 'Snow Depth', unit: 'cm', missing: 999, index: 30, category: 'Precipitation' },
  { id: 'daysSinceLastSnowfall', name: 'Days Since Last Snowfall', unit: 'days', missing: 99, index: 31, category: 'Precipitation' },
  { id: 'albedo', name: 'Albedo', unit: '', missing: 999, index: 32, category: 'Other' },
  { id: 'liquidPrecipitationDepth', name: 'Liquid Precipitation Depth', unit: 'mm', missing: 999, index: 33, category: 'Precipitation' },
  { id: 'liquidPrecipitationQuantity', name: 'Liquid Precipitation Quantity', unit: 'hr', missing: 99, index: 34, category: 'Precipitation' },
];

export interface ParsedEPW {
  metadata: EPWMetadata;
  data: EPWDataRow[];
  variables: EPWVariable[];
}

export function parseEPW(csvString: string): ParsedEPW {
  // Remove BOM if present and split into lines
  const cleanString = csvString.replace(/^\uFEFF/, '');
  const lines = cleanString.split(/\r?\n/).map(l => l.trim());
  
  // Find the LOCATION line
  let locationLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('LOCATION,')) {
      locationLineIndex = i;
      break;
    }
  }

  if (locationLineIndex === -1) {
    throw new Error("Invalid EPW file: Missing LOCATION header");
  }

  // Parse Header (LOCATION line)
  // LOCATION,City,State,Country,Source,WMO,Lat,Lon,TimeZone,Elevation
  const headerParts = lines[locationLineIndex].split(',');
  
  const metadata: EPWMetadata = {
    city: headerParts[1]?.trim() || 'Unknown',
    state: headerParts[2]?.trim() || '',
    country: headerParts[3]?.trim() || '',
    source: headerParts[4]?.trim() || '',
    wmo: headerParts[5]?.trim() || '',
    lat: parseFloat(headerParts[6]),
    lng: parseFloat(headerParts[7]),
    timeZone: parseFloat(headerParts[8]),
    elevation: parseFloat(headerParts[9]),
  };

  const data: EPWDataRow[] = [];
  const varMinMax: Record<string, { min: number; max: number }> = {};

  EPW_COLUMNS.forEach(col => {
    varMinMax[col.id] = { min: Infinity, max: -Infinity };
  });

  // Parse Data (usually starts 8 lines after LOCATION, but let's be safe and look for the first line that looks like data)
  // Data lines start with Year, Month, Day, Hour... (all numbers)
  for (let i = locationLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    const parts = line.split(',');
    // Data lines in EPW have many columns (usually 35+)
    if (parts.length < 30) continue;
    
    // Check if the first few parts are numbers (Year, Month, Day, Hour)
    if (isNaN(parseInt(parts[0], 10)) || isNaN(parseInt(parts[1], 10))) continue;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const hour = parseInt(parts[3], 10);
    const minute = parseInt(parts[4], 10);

    // EPW hours are 1-24. We want 0-23 for JS Date.
    // Hour 1 is 00:00 to 01:00, so we map it to 0.
    // Hour 24 is 23:00 to 24:00, so we map it to 23.
    const jsHour = hour - 1;
    const jsDate = new Date(year, month - 1, day, jsHour, minute);
    
    // Calculate day of year
    const start = new Date(year, 0, 0);
    const diff = (jsDate.getTime() - start.getTime()) + ((start.getTimezoneOffset() - jsDate.getTimezoneOffset()) * 60 * 1000);
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    const row: EPWDataRow = {
      date: jsDate,
      year,
      month,
      day,
      hour: jsHour,
      minute,
      dayOfYear,
    };

    EPW_COLUMNS.forEach(col => {
      let val = parseFloat(parts[col.index]);
      // Handle missing values
      if (val === col.missing || isNaN(val)) {
        val = null as any; 
      } else {
        if (val < varMinMax[col.id].min) varMinMax[col.id].min = val;
        if (val > varMinMax[col.id].max) varMinMax[col.id].max = val;
      }
      row[col.id] = val;
    });

    data.push(row);
  }

  // Create variables list, filtering out ones that have no variation (min === max === Infinity)
  const variables: EPWVariable[] = EPW_COLUMNS.map(col => {
    const minMax = varMinMax[col.id];
    return {
      id: col.id,
      name: col.name,
      unit: col.unit,
      min: minMax.min === Infinity ? 0 : minMax.min,
      max: minMax.max === -Infinity ? 100 : minMax.max,
      category: col.category,
    };
  }).filter(v => v.min !== v.max); // Optional: filter out constants, but maybe keep them

  return { metadata, data, variables: EPW_COLUMNS.map(col => {
    const minMax = varMinMax[col.id];
    return {
      id: col.id,
      name: col.name,
      unit: col.unit,
      min: minMax.min === Infinity ? 0 : minMax.min,
      max: minMax.max === -Infinity ? 100 : minMax.max,
      category: col.category,
    };
  }) };
}
