const TEMP_TOLERANCE_C = 3;

const CONDITIONS = ['sun', 'rain', 'snow', 'drizzle', 'fog', 'storm'];
const WINDS = ['calm', 'breeze', 'gale'];
const HUMIDITIES = ['dry', 'pleasant', 'muggy'];

const FEATURED_CITIES = [
  { id: 'london', name: 'London', latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London' },
  { id: 'new-york', name: 'New York', latitude: 40.7128, longitude: -74.006, timezone: 'America/New_York' },
  { id: 'tokyo', name: 'Tokyo', latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo' },
  { id: 'cairo', name: 'Cairo', latitude: 30.0444, longitude: 31.2357, timezone: 'Africa/Cairo' },
  { id: 'sydney', name: 'Sydney', latitude: -33.8688, longitude: 151.2093, timezone: 'Australia/Sydney' },
  { id: 'reykjavik', name: 'Reykjavík', latitude: 64.1466, longitude: -21.9426, timezone: 'Atlantic/Reykjavik' }
];

const WMO_TO_CONDITION = {};
for (const code of [0, 1, 2, 3]) WMO_TO_CONDITION[code] = 'sun';
for (const code of [45, 48]) WMO_TO_CONDITION[code] = 'fog';
for (const code of [51, 53, 55, 56, 57]) WMO_TO_CONDITION[code] = 'drizzle';
for (const code of [61, 63, 65, 66, 67, 80, 81, 82]) WMO_TO_CONDITION[code] = 'rain';
for (const code of [71, 73, 75, 77, 85, 86]) WMO_TO_CONDITION[code] = 'snow';
for (const code of [95, 96, 99]) WMO_TO_CONDITION[code] = 'storm';

module.exports = {
  TEMP_TOLERANCE_C,
  CONDITIONS,
  WINDS,
  HUMIDITIES,
  FEATURED_CITIES,
  WMO_TO_CONDITION
};
