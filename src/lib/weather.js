const { utcNowIso } = require('../db');
const { roundCoord } = require('./rival');
const {
  representativeSlice,
  wmoToCondition,
  windCategory,
  humidityCategory
} = require('./slice');

const DAY_MS = 24 * 60 * 60 * 1000;
const TTL = {
  geocode: 30 * DAY_MS,
  forecast: 12 * 60 * 60 * 1000,
  archive: Infinity,
  current: 60 * 60 * 1000
};

function normalizeSearch(query) {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function createWeather({ db, fetchFn, now }) {
  const readCache = db.prepare(
    'SELECT payload_json, fetched_at FROM weather_cache WHERE cache_key = ?'
  );
  const writeCache = db.prepare(`
    INSERT INTO weather_cache (cache_key, kind, payload_json, fetched_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      kind = excluded.kind,
      payload_json = excluded.payload_json,
      fetched_at = excluded.fetched_at
  `);

  async function cachedFetch({ cacheKey, kind, ttl, url }) {
    const cached = readCache.get(cacheKey);
    if (cached && (ttl === Infinity || now().getTime() - Date.parse(cached.fetched_at) < ttl)) {
      return JSON.parse(cached.payload_json);
    }

    try {
      const response = await fetchFn(url);
      if (!response.ok) return null;
      const payload = await response.json();
      writeCache.run(cacheKey, kind, JSON.stringify(payload), utcNowIso(now()));
      return payload;
    } catch {
      return null;
    }
  }

  async function geocode(query) {
    const normalized = normalizeSearch(query);
    const payload = await cachedFetch({
      cacheKey: `geocode:${normalized}`,
      kind: 'geocode',
      ttl: TTL.geocode,
      url: `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=5`
    });
    if (payload === null) return null;
    return (payload.results || []).map(({ name, country, latitude, longitude, timezone }) => ({
      name,
      country,
      latitude,
      longitude,
      timezone
    }));
  }

  async function hourlySlice(kind, args) {
    const { latitude, longitude, localDate, period, timezone } = args;
    const lat3 = roundCoord(latitude);
    const lon3 = roundCoord(longitude);
    const isArchive = kind === 'archive';
    const host = isArchive
      ? 'https://archive-api.open-meteo.com/v1/archive'
      : 'https://api.open-meteo.com/v1/forecast';
    const dateQuery = isArchive ? `&start_date=${localDate}&end_date=${localDate}` : '';
    const url = `${host}?latitude=${latitude}&longitude=${longitude}${dateQuery}&hourly=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=${encodeURIComponent(timezone)}`;
    const payload = await cachedFetch({
      cacheKey: `${kind}:${lat3}:${lon3}:${localDate}`,
      kind,
      ttl: TTL[kind],
      url
    });
    if (payload === null) return null;
    return representativeSlice(payload.hourly, period);
  }

  function forecastSlice(args) {
    return hourlySlice('forecast', args);
  }

  function archiveSlice(args) {
    return hourlySlice('archive', args);
  }

  async function currentForCity(city) {
    const payload = await cachedFetch({
      cacheKey: `current:${city.id}`,
      kind: 'current',
      ttl: TTL.current,
      url: `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=${encodeURIComponent(city.timezone)}`
    });
    if (payload === null) return null;
    const current = payload.current;
    return {
      temperatureC: Math.round(current.temperature_2m),
      condition: wmoToCondition(current.weather_code),
      wind: windCategory(current.wind_speed_10m),
      humidity: humidityCategory(current.relative_humidity_2m)
    };
  }

  return {
    normalizeSearch,
    geocode,
    forecastSlice,
    archiveSlice,
    currentForCity
  };
}

module.exports = { createWeather };
