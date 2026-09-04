const { FEATURED_CITIES } = require('../../config/weather');
const { theatreFiler, theatreRequestedWeather, roundCoord, seedInt } = require('./rival');
const { hydrateOrder } = require('./orders');
const { localDateString, formatWeatherLine } = require('./time');

function utcDateString(now) {
  return now.toISOString().slice(0, 10);
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function seededShuffle(items, seedKey) {
  const copy = items.slice();
  let a = seedInt(seedKey) || 1;
  function rnd() {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function asCard({ place, name, reason, requested, actual }) {
  return {
    place,
    name,
    reason,
    requestedWeather: formatWeatherLine(requested),
    actualWeather: formatWeatherLine(actual),
    condition: requested.condition,
    stamped: true
  };
}

function occupiesCity(order, city) {
  return roundCoord(order.latitude) === roundCoord(city.latitude)
    && roundCoord(order.longitude) === roundCoord(city.longitude);
}

async function realCards(db, weather, now) {
  const todayUtc = utcDateString(now);
  const from = addDaysYmd(todayUtc, -1);
  const to = addDaysYmd(todayUtc, 1);
  const rows = db.prepare(`
    SELECT orders.*, visitors.display_name AS filer_name
    FROM orders
    JOIN visitors ON visitors.id = orders.visitor_id
    WHERE orders.cancelled_at IS NULL
      AND orders.local_date >= ?
      AND orders.local_date <= ?
    ORDER BY orders.created_at DESC
  `).all(from, to);

  const cards = [];
  const occupied = [];
  for (const row of rows) {
    const view = await hydrateOrder(row, { db, weather, now });
    if (view.verdict !== 'accepted') continue;
    if (localDateString(now, row.timezone) !== row.local_date) continue;
    cards.push(asCard({
      place: row.place_name,
      name: row.filer_name,
      reason: row.reason,
      requested: {
        condition: row.condition,
        temperatureC: row.temperature_c,
        wind: row.wind,
        humidity: row.humidity
      },
      actual: view.actual
    }));
    occupied.push(row);
  }
  return { cards, occupied };
}

async function fakeCards(weather, now, occupied) {
  const cards = [];
  for (const city of FEATURED_CITIES) {
    if (occupied.some((order) => occupiesCity(order, city))) continue;
    const actual = await weather.currentForCity(city);
    if (!actual) continue;
    const localDate = localDateString(now, city.timezone);
    const filer = theatreFiler({ cityId: city.id, localDate, condition: actual.condition });
    const requested = theatreRequestedWeather({ cityId: city.id, localDate, actual });
    cards.push(asCard({
      place: city.name,
      name: filer.name,
      reason: filer.reason,
      requested,
      actual
    }));
  }
  return cards;
}

async function buildBoard({ db, weather, now }) {
  const real = await realCards(db, weather, now);
  const fakes = await fakeCards(weather, now, real.occupied);
  const needed = Math.max(0, 6 - real.cards.length);
  const cards = seededShuffle([...real.cards, ...fakes.slice(0, needed)], utcDateString(now));
  return { cards, ticker: cards };
}

module.exports = { buildBoard };
