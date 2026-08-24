const { PERIODS } = require('./time');
const {
  TEMP_TOLERANCE_C,
  CONDITIONS,
  WMO_TO_CONDITION
} = require('../../config/weather');

function windCategory(kmh) {
  if (kmh < 12) return 'calm';
  if (kmh <= 40) return 'breeze';
  return 'gale';
}

function humidityCategory(rh) {
  if (rh < 40) return 'dry';
  if (rh <= 70) return 'pleasant';
  return 'muggy';
}

function wmoToCondition(code) {
  return WMO_TO_CONDITION[code] || 'sun';
}

function hourFromTime(timeStr) {
  return Number(timeStr.slice(11, 13));
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function dominantCondition(codes) {
  const counts = Object.create(null);
  for (const code of codes) {
    const condition = wmoToCondition(code);
    counts[condition] = (counts[condition] || 0) + 1;
  }
  let best = CONDITIONS[0];
  let bestCount = -1;
  for (const condition of CONDITIONS) {
    const count = counts[condition] || 0;
    if (count > bestCount) {
      bestCount = count;
      best = condition;
    }
  }
  return best;
}

function representativeSlice(hourly, period) {
  const { startHour, endHour } = PERIODS[period];
  const indices = hourly.time
    .map((t, i) => ({ hour: hourFromTime(t), i }))
    .filter(({ hour }) => hour >= startHour && hour < endHour)
    .map(({ i }) => i);

  const temps = indices.map((i) => hourly.temperature_2m[i]);
  const humidityValues = indices.map((i) => hourly.relative_humidity_2m[i]);
  const windValues = indices.map((i) => hourly.wind_speed_10m[i]);
  const codes = indices.map((i) => hourly.weather_code[i]);

  return {
    temperatureC: Math.round(mean(temps)),
    wind: windCategory(mean(windValues)),
    humidity: humidityCategory(mean(humidityValues)),
    condition: dominantCondition(codes)
  };
}

function isMatch(requested, actual) {
  if (requested.condition !== actual.condition) return false;
  if (requested.wind !== actual.wind) return false;
  if (requested.humidity !== actual.humidity) return false;
  if (Math.abs(requested.temperatureC - actual.temperatureC) > TEMP_TOLERANCE_C) return false;
  return true;
}

module.exports = {
  windCategory,
  humidityCategory,
  wmoToCondition,
  representativeSlice,
  isMatch
};
