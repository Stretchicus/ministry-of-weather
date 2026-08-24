const { FEATURED_CITIES } = require('../../config/weather');
const copy = require('../../config/copy');
const { theatreFiler } = require('./rival');
const { localDateString } = require('./time');

function realCards(db) {
  return db.prepare(`
    SELECT
      orders.place_name AS place,
      orders.condition,
      orders.temperature_c AS temperatureC,
      visitors.display_name AS name,
      orders.reason
    FROM orders
    JOIN visitors ON visitors.id = orders.visitor_id
    WHERE orders.cancelled_at IS NULL
    ORDER BY orders.created_at DESC
    LIMIT 8
  `).all().map((order) => ({ ...order, kind: 'real' }));
}

async function theatreCard(city, weather, now) {
  const current = await weather.currentForCity(city);
  if (!current) {
    return {
      place: city.name,
      condition: null,
      temperatureC: null,
      name: 'The Observatory',
      reason: copy.observatory,
      kind: 'theatre'
    };
  }

  const filer = theatreFiler({
    cityId: city.id,
    localDate: localDateString(now, city.timezone),
    condition: current.condition
  });
  return {
    place: city.name,
    condition: current.condition,
    temperatureC: current.temperatureC,
    name: filer.name,
    reason: filer.reason,
    kind: 'theatre'
  };
}

async function buildBoard({ db, weather, now }) {
  const theatre = await Promise.all(
    FEATURED_CITIES.map((city) => theatreCard(city, weather, now))
  );
  const real = realCards(db);
  return { theatre, real, ticker: [...theatre, ...real] };
}

module.exports = { buildBoard };
