export const REGIONS = [
  'Baltic / Continent',
  'Mediterranean',
  'Black Sea',
  'Red Sea',
  'Persian Gulf',
  'India',
  'Far East',
  'Southeast Asia',
  'Africa',
  'West Africa',
  'East Africa',
  'North America',
  'South America',
  'Caribbean',
  'Australia',
  'Other / TBA'
];

export const parseRegion = (port: string, regionField?: string): string => {
  if (regionField && REGIONS.includes(regionField)) return regionField;
  if (!port) return 'Other / TBA';
  const p = port.toLowerCase();
  
  if (p.includes('baltic') || p.includes('continent') || p.includes('ara') || p.includes('rotterdam') || p.includes('antwerp') || p.includes('hamburg')) return 'Baltic / Continent';
  if (p.includes('med') || p.includes('genoa') || p.includes('barcelona') || p.includes('piraeus')) return 'Mediterranean';
  if (p.includes('black sea') || p.includes('novorossiysk') || p.includes('odessa') || p.includes('constanta')) return 'Black Sea';
  if (p.includes('red sea') || p.includes('jeddah') || p.includes('suez')) return 'Red Sea';
  if (p.includes('pg') || p.includes('persian gulf') || p.includes('jebel ali') || p.includes('fujairah')) return 'Persian Gulf';
  if (p.includes('india') || p.includes('mumbai') || p.includes('kandla') || p.includes('chennai')) return 'India';
  if (p.includes('far east') || p.includes('china') || p.includes('shanghai') || p.includes('qingdao') || p.includes('korea') || p.includes('busan') || p.includes('japan')) return 'Far East';
  if (p.includes('southeast asia') || p.includes('singapore') || p.includes('indonesia') || p.includes('malaysia')) return 'Southeast Asia';
  if (p.includes('west africa') || p.includes('nigeria') || p.includes('lagos')) return 'West Africa';
  if (p.includes('east africa') || p.includes('mombasa') || p.includes('dar es salaam')) return 'East Africa';
  if (p.includes('africa') || p.includes('durban') || p.includes('cape town')) return 'Africa';
  if (p.includes('usa') || p.includes('houston') || p.includes('new orleans') || p.includes('us gulf') || p.includes('canada')) return 'North America';
  if (p.includes('brazil') || p.includes('argentina') || p.includes('santos') || p.includes('paranagua')) return 'South America';
  if (p.includes('caribbean') || p.includes('panama')) return 'Caribbean';
  if (p.includes('australia') || p.includes('brisbane') || p.includes('perth') || p.includes('newcastle')) return 'Australia';
  
  return 'Other / TBA';
};

export const isDateInRange = (dateStr: string, range: string): boolean => {
  if (!dateStr || dateStr.toLowerCase().includes('prompt') || dateStr.toLowerCase().includes('spot')) {
    return range === 'prompt';
  }
  
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  
  const now = new Date();
  const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  
  switch(range) {
    case 'prompt': return diffDays >= -7 && diffDays <= 3;
    case 'this_week': return diffDays >= -1 && diffDays <= 7;
    case 'next_7': return diffDays >= 0 && diffDays <= 7;
    case 'next_14': return diffDays >= 0 && diffDays <= 14;
    case 'next_30': return diffDays >= 0 && diffDays <= 30;
    case 'expired': return diffDays < -1;
    default: return true;
  }
}

export const parseNumericValue = (valStr: string | number | undefined): number | null => {
  if (valStr === undefined || valStr === null || valStr === '') return null;
  if (typeof valStr === 'number') return valStr;
  const matches = String(valStr).replace(/,/g, '').match(/\d+(\.\d+)?/);
  return matches ? parseFloat(matches[0]) : null;
};

export const matchMinMax = (valueStr: string | number | undefined, minStr: string, maxStr: string): boolean => {
  if (!minStr && !maxStr) return true;
  const val = parseNumericValue(valueStr);
  if (val === null) return false; // Exclude when specific numeric boundaries are requested but value is unknown
  
  const min = minStr ? parseFloat(minStr) : 0;
  const max = maxStr ? parseFloat(maxStr) : Infinity;
  
  return val >= min && val <= max;
};

export const parseGearCategory = (gearStr: string | undefined): string => {
  if (!gearStr) return 'unknown';
  const s = gearStr.toLowerCase();
  
  if (s.includes('gearless') || s === 'no' || s === 'none') return 'gearless';
  
  let isHeavy = false;
  if (s.includes('heavy') || s.includes('hl')) {
    isHeavy = true;
  } else {
    // Try to find weights
    const weights = s.match(/\d+(?:\.\d+)?(?=\s*(?:t|mt))/g);
    let maxWeight = 0;
    if (weights) {
       maxWeight = Math.max(...weights.map(Number));
    } else {
       const cpMatches = s.match(/\d+(?:x|\*| x )(\d+)/g);
       if (cpMatches) {
           maxWeight = Math.max(...cpMatches.map(m => {
             const parts = m.split(/[x*]/i);
             return parseFloat(parts[1].trim());
           }));
       }
    }
    if (maxWeight >= 150) isHeavy = true;
  }
  
  if (isHeavy) return 'heavy_lift';
  if (s.includes('crane') || s.includes('geared') || s.includes('mt') || s.match(/\d+(?:x|\*)\d+/)) return 'geared';
  
  return 'unknown';
};
