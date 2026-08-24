const { FEATURED_CITIES } = require('../../config/weather');
const copy = require('../../config/copy');
const { theatreFiler } = require('./rival');
const { deriveStatus, localDateString } = require('./time');

function realCards(db, now) {
  return db.prepare(`
    SELECT
      orders.place_name AS place,
      orders.condition,
      orders.temperature_c AS temperatureC,
      orders.local_date AS localDate,
      orders.period,
      orders.timezone,
      visitors.display_name AS name,
      orders.reason
    FROM orders
    JOIN visitors ON visitors.id = orders.visitor_id
    WHERE orders.cancelled_at IS NULL
    ORDER BY orders.created_at DESC
    LIMIT 8
  `).all().map((order) => {
    const status = deriveStatus({
      localDate: order.localDate,
      period: order.period,
      timeZone: order.timezone,
      now,
      cancelledAt: null
    });
    return {
      place: order.place,
      condition: order.condition,
      temperatureC: order.temperatureC,
      name: order.name,
      reason: order.reason,
      kind: 'real',
      stamped: status === 'settled'
    };
  });
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
      kind: 'theatre',
      stamped: true
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
    kind: 'theatre',
    stamped: true
  };
}

async function buildBoard({ db, weather, now }) {
  const theatre = await Promise.all(
    FEATURED_CITIES.map((city) => theatreCard(city, weather, now))
  );
  const real = realCards(db, now);
  return { theatre, real, ticker: [...theatre, ...real] };
}

module.exports = { buildBoard };
