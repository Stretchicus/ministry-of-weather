const FORECAST_HORIZON_DAYS = 15;

const PERIODS = {
  morning: { startHour: 6, endHour: 12 },
  afternoon: { startHour: 12, endHour: 18 },
  evening: { startHour: 18, endHour: 24 }
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function localDateString(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function zoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - date.getTime();
}

function wallTimeToUtc(timeZone, year, month, day, hour) {
  let utc = Date.UTC(year, month - 1, day, hour, 0, 0);
  utc -= zoneOffsetMs(new Date(utc), timeZone);
  utc -= zoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

function ymd(localDate) {
  const [y, m, d] = localDate.split('-').map(Number);
  return { y, m, d };
}

function addDays(localDate, days) {
  const { y, m, d } = ymd(localDate);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function slotStartUtc(localDate, period, timeZone) {
  const spec = PERIODS[period];
  if (!spec) throw new Error('unknown period');
  const { y, m, d } = ymd(localDate);
  return wallTimeToUtc(timeZone, y, m, d, spec.startHour);
}

function slotEndUtc(localDate, period, timeZone) {
  const spec = PERIODS[period];
  const { y, m, d } = ymd(localDate);
  if (spec.endHour === 24) return wallTimeToUtc(timeZone, y, m, d + 1, 0);
  return wallTimeToUtc(timeZone, y, m, d, spec.endHour);
}

function assertSlotBookable({ localDate, period, timeZone, now }) {
  if (localDate === localDateString(now, timeZone)) {
    return { ok: false, code: 'not_today' };
  }
  if (localDate < localDateString(now, timeZone)) {
    return { ok: false, code: 'not_today' };
  }
  const start = slotStartUtc(localDate, period, timeZone);
  if (start.getTime() - now.getTime() < 24 * 60 * 60 * 1000) {
    return { ok: false, code: 'too_soon' };
  }
  return { ok: true };
}

function deriveStatus({ localDate, period, timeZone, now, cancelledAt }) {
  if (cancelledAt) return 'cancelled';
  if (now.getTime() >= slotEndUtc(localDate, period, timeZone).getTime()) return 'settled';
  const todayLocal = localDateString(now, timeZone);
  if (localDate > addDays(todayLocal, FORECAST_HORIZON_DAYS)) return 'queued';
  return 'aimed';
}

module.exports = {
  FORECAST_HORIZON_DAYS,
  PERIODS,
  localDateString,
  slotStartUtc,
  slotEndUtc,
  assertSlotBookable,
  deriveStatus,
  addDays
};
