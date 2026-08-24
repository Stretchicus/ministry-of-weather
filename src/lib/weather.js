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

function sameName(a, b) {
  return normalizeSearch(a || '') === normalizeSearch(b || '');
}

function formatPlaceLabel(place, { includeAdmin2 = false } = {}) {
  const parts = [place.name];
  if (
    includeAdmin2
    && place.admin2
    && !sameName(place.admin2, place.name)
    && !sameName(place.admin2, place.admin1)
  ) {
    parts.push(place.admin2);
  }
  if (place.admin1 && !sameName(place.admin1, place.name)) {
    parts.push(place.admin1);
  }
  if (place.country) parts.push(place.country);
  return parts.join(', ');
}

function shortPlaceName(place) {
  if (place.admin1 && !sameName(place.admin1, place.name)) {
    return `${place.name}, ${place.admin1}`;
  }
  return place.name;
}

function decoratePlaces(places) {
  const counts = new Map();
  for (const place of places) {
    const label = formatPlaceLabel(place);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return places.map((place) => {
    const includeAdmin2 = counts.get(formatPlaceLabel(place)) > 1;
    return {
      ...place,
      label: formatPlaceLabel(place, { includeAdmin2 }),
      shortName: shortPlaceName(place)
    };
  });
}

function selectGeocodeResults(query, rawResults) {
  const mapped = (rawResults || []).map((raw) => ({
    name: raw.name,
    admin1: raw.admin1 || '',
    admin2: raw.admin2 || '',
    country: raw.country || '',
    latitude: raw.latitude,
    longitude: raw.longitude,
    timezone: raw.timezone,
    population: Number(raw.population) || 0
  }));
  const normalised = normalizeSearch(query);
  const exact = mapped.filter((place) => normalizeSearch(place.name) === normalised);
  const pool = (exact.length ? exact : mapped)
    .slice()
    .sort((a, b) => b.population - a.population);

  const seen = new Set();
  const unique = [];
  for (const place of pool) {
    const key = `${roundCoord(place.latitude)}:${roundCoord(place.longitude)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(place);
  }
  return decoratePlaces(unique);
}

function localityFromNominatim(payload) {
  if (!payload || payload.error) return 'Hereabouts';
  const address = payload.address || {};
  return address.city
    || address.town
    || address.village
    || address.municipality
    || address.hamlet
    || payload.name
    || 'Hereabouts';
}

function hourlyForDate(hourly, localDate) {
  const indices = hourly.time
    .map((time, index) => ({ time, index }))
    .filter(({ time }) => time.slice(0, 10) === localDate)
    .map(({ index }) => index);

  return {
    time: indices.map((index) => hourly.time[index]),
    temperature_2m: indices.map((index) => hourly.temperature_2m[index]),
    relative_humidity_2m: indices.map((index) => hourly.relative_humidity_2m[index]),
    weather_code: indices.map((index) => hourly.weather_code[index]),
    wind_speed_10m: indices.map((index) => hourly.wind_speed_10m[index])
  };
}

function createWeather({ db, fetchFn, now }) {
  const inFlight = new Map();
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

  async function cachedFetch({ cacheKey, kind, ttl, url, headers }) {
    const cached = readCache.get(cacheKey);
    if (cached && (ttl === Infinity || now().getTime() - Date.parse(cached.fetched_at) < ttl)) {
      return JSON.parse(cached.payload_json);
    }

    const pending = inFlight.get(cacheKey);
    if (pending) return pending;

    const request = (async () => {
      try {
        const response = await fetchFn(url, headers ? { headers } : undefined);
        if (!response.ok) return null;
        const payload = await response.json();
        writeCache.run(cacheKey, kind, JSON.stringify(payload), utcNowIso(now()));
        return payload;
      } catch {
        return null;
      }
    })();
    inFlight.set(cacheKey, request);

    try {
      return await request;
    } finally {
      inFlight.delete(cacheKey);
    }
  }

  async function geocode(query) {
    const normalized = normalizeSearch(query);
    const payload = await cachedFetch({
      cacheKey: `geocode:${normalized}`,
      kind: 'geocode',
      ttl: TTL.geocode,
      url: `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=10&language=en`
    });
    if (payload === null) return null;
    return selectGeocodeResults(query, payload.results);
  }

  async function reverseGeocode(latitude, longitude) {
    const lat3 = roundCoord(latitude);
    const lon3 = roundCoord(longitude);
    const [nominatim, forecast] = await Promise.all([
      cachedFetch({
        cacheKey: `reverse:${lat3}:${lon3}`,
        kind: 'geocode',
        ttl: TTL.geocode,
        url: `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2&addressdetails=1`,
        headers: {
          'User-Agent': 'MinistryOfWeather/1.0 (parody weather bureau)',
          'Accept-Language': 'en'
        }
      }),
      cachedFetch({
        cacheKey: `timezone:${lat3}:${lon3}`,
        kind: 'geocode',
        ttl: TTL.geocode,
        url: `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&timezone=auto`
      })
    ]);
    const timezone = forecast && forecast.timezone;
    if (!timezone) return [];
    const address = (nominatim && nominatim.address) || {};
    return decoratePlaces([{
      name: localityFromNominatim(nominatim),
      admin1: address.state || address.region || '',
      admin2: address.county || '',
      country: address.country || '',
      latitude,
      longitude,
      timezone,
      population: 0
    }]);
  }

  async function hourlySlice(kind, args) {
    const { latitude, longitude, localDate, period, timezone } = args;
    const lat3 = roundCoord(latitude);
    const lon3 = roundCoord(longitude);
    const isArchive = kind === 'archive';
    const host = isArchive
      ? 'https://archive-api.open-meteo.com/v1/archive'
      : 'https://api.open-meteo.com/v1/forecast';
    const dateQuery = `&start_date=${localDate}&end_date=${localDate}`;
    const url = `${host}?latitude=${latitude}&longitude=${longitude}${dateQuery}&hourly=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=${encodeURIComponent(timezone)}`;
    const payload = await cachedFetch({
      cacheKey: `${kind}:${lat3}:${lon3}:${localDate}`,
      kind,
      ttl: TTL[kind],
      url
    });
    if (payload === null) return null;
    return representativeSlice(hourlyForDate(payload.hourly, localDate), period);
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
    reverseGeocode,
    forecastSlice,
    archiveSlice,
    currentForCity
  };
}

module.exports = { createWeather };
