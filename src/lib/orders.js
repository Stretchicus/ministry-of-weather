const { CONDITIONS, WINDS, HUMIDITIES } = require('../../config/weather');
const { cancelClerks } = require('../../config/copy');
const {
  PERIODS,
  assertSlotBookable,
  slotStartUtc
} = require('./time');

const DAY_MS = 24 * 60 * 60 * 1000;

function hasActiveFilingToday(db, visitorId, now) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM orders
    WHERE visitor_id = ?
      AND cancelled_at IS NULL
      AND substr(created_at, 1, 10) = substr(?, 1, 10)
  `).get(visitorId, now.toISOString());
  return row.count > 0;
}

function validKnobs(payload) {
  return Object.hasOwn(PERIODS, payload.period)
    && CONDITIONS.includes(payload.condition)
    && Number.isInteger(payload.temperatureC)
    && payload.temperatureC >= -20
    && payload.temperatureC <= 45
    && WINDS.includes(payload.wind)
    && HUMIDITIES.includes(payload.humidity);
}

function fileOrder(db, visitor, payload, now) {
  if (!visitor.display_name || !visitor.display_name.trim()) {
    return { ok: false, code: 'no_name' };
  }

  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
  if (reason.length < 1 || reason.length > 140) {
    return { ok: false, code: 'bad_reason' };
  }
  if (!validKnobs(payload)) {
    return { ok: false, code: 'bad_knobs' };
  }

  const bookable = assertSlotBookable({
    localDate: payload.localDate,
    period: payload.period,
    timeZone: payload.timezone,
    now
  });
  if (!bookable.ok) return bookable;

  return db.transaction(() => {
    if (hasActiveFilingToday(db, visitor.id, now)) {
      return { ok: false, code: 'already_filed' };
    }

    const result = db.prepare(`
      INSERT INTO orders (
        visitor_id, place_name, country, latitude, longitude, timezone,
        local_date, period, condition, temperature_c, wind, humidity,
        reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      visitor.id,
      payload.placeName,
      payload.country ?? null,
      payload.latitude,
      payload.longitude,
      payload.timezone,
      payload.localDate,
      payload.period,
      payload.condition,
      payload.temperatureC,
      payload.wind,
      payload.humidity,
      reason,
      now.toISOString()
    );

    const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(result.lastInsertRowid);
    return { ok: true, order };
  })();
}

function clerkCopy(cancelCount) {
  return cancelClerks[Math.min(cancelCount, 3)];
}

function cancelOrder(db, visitor, orderId, now) {
  return db.transaction(() => {
    const order = db.prepare(`
      SELECT *
      FROM orders
      WHERE id = ? AND visitor_id = ? AND cancelled_at IS NULL
    `).get(orderId, visitor.id);

    if (!order) return { ok: false, code: 'not_found' };

    const start = slotStartUtc(order.local_date, order.period, order.timezone);
    if (start.getTime() - now.getTime() < DAY_MS) {
      return { ok: false, code: 'too_late' };
    }

    db.prepare(`UPDATE orders SET cancelled_at = ? WHERE id = ?`).run(now.toISOString(), order.id);
    db.prepare(`UPDATE visitors SET cancel_count = cancel_count + 1 WHERE id = ?`).run(visitor.id);
    const { cancel_count: cancelCount } = db.prepare(
      `SELECT cancel_count FROM visitors WHERE id = ?`
    ).get(visitor.id);

    return { ok: true, cancelCount, copy: clerkCopy(cancelCount) };
  })();
}

module.exports = {
  hasActiveFilingToday,
  fileOrder,
  cancelOrder,
  clerkCopy
};
