# Ministry of Weather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build The Ministry of Weather, a parody Express + SQLite site where visitors file future weather requests and compare them to Open-Meteo reality.

**Architecture:** Server-rendered Express pages (no SPA). SQLite holds visitors, orders, and weather cache. The browser never calls Open-Meteo. Status (queued / aimed / settled) is derived at read time. Brand copy lives in `config/brand.js`.

**Tech Stack:** Node 20+, Express 4, EJS, better-sqlite3, cookie-parser, Node built-in `node:test`. Open-Meteo (no API key). CommonJS (`require`).

**Spec:** `docs/superpowers/specs/2026-08-24-ministry-of-weather-design.md`

## Global Constraints

- Working title: The Ministry of Weather. Tagline: Purveyors of unlikely skies. All user-facing brand strings in `config/brand.js`.
- Entertainment only. Site, operators, visitors, and AI cannot change the weather. Disclaimer on every page. Never promise a request will come true. Never imply weather as a weapon. Invented rival names only.
- Future bookings only. Not today in the location’s local calendar. Slot start ≥ 24 hours from now. Helper copy: the machine takes at least 24 hours to be aimed.
- Periods (location local): morning 06:00–12:00, afternoon 12:00–18:00, evening 18:00–24:00.
- Knobs: condition (sun, rain, snow, drizzle, fog, storm), temperature integer °C −20 to 45, wind (calm, breeze, gale), humidity (dry, pleasant, muggy), reason max 140 chars public.
- One active (not cancelled) order created per visitor per UTC calendar date. Cancel refunds that day’s stamp. Cancel only if slot start ≥ 24 hours away and order belongs to this visitor. No edits.
- Cookie `ministry_visitor`: HttpOnly, SameSite=Lax, Max-Age 1 year, Secure when HTTPS.
- Open-Meteo only. No forecast/archive fetch for queued orders. Archive once then freeze. Forecast cache 12h. Current 60 minutes. Geocode 30 days.
- Forecast window: last forecastable local date is `location_today + 15 days`.
- Match: condition equal, temp ±3 °C, wind equal, humidity equal.
- Rival seed: `round(lat,3)|round(lon,3)|YYYY-MM-DD|period` SHA-256, first 8 hex chars as integer. Theatre seed: `cityId|YYYY-MM-DD` using that city’s local date.
- Home layout: disclaimer, header, machine, ticker, File Form 27B, notice cards, empty departmental-notice slots. Parchment + brass. Three spinning cogs, steam from pipe, gauge needle. `prefers-reduced-motion` freezes motion.
- v1 is not: accounts, ads, payments, past dates, 3D/WebGL.
- `npm start` on port 3000. Voice: official, incompetent, slightly annoyed clerks. Never cruel.
- Tests use a temp or `:memory:` SQLite file. Never the real `data/ministry.sqlite`.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `package.json` | scripts `start` / `test`, dependencies |
| `.gitignore` | `node_modules/`, `data/`, `.superpowers/` |
| `config/brand.js` | name, tagline, disclaimers, nav labels |
| `config/weather.js` | conditions, periods, bands, featured cities, match tolerance, WMO map, wind/humidity cuts |
| `config/rivals.js` | 24 names, 6 reasons per condition |
| `config/copy.js` | clerk cancel lines, form helpers, observatory error |
| `src/db.js` | open SQLite, `CREATE TABLE IF NOT EXISTS`, helpers |
| `src/lib/time.js` | local dates, slot start/end UTC, 24h rule, `deriveStatus` |
| `src/lib/slice.js` | WMO map, wind/humidity buckets, representative slice, `isMatch` |
| `src/lib/rival.js` | seeded rival and theatre filer |
| `src/lib/weather.js` | Open-Meteo + cache; injectable `fetchFn` |
| `src/lib/orders.js` | daily stamp, file, cancel |
| `src/lib/board.js` | theatre + recent real orders for home |
| `src/middleware/visitor.js` | cookie → visitor row |
| `src/app.js` | `createApp({ db, now, weather })` Express app |
| `src/server.js` | production db + listen 3000 |
| `views/layout.ejs` | disclaimer, header, footer |
| `views/home.ejs` | machine, ticker, CTA, cards |
| `views/request.ejs` | Form 27B |
| `views/ledger.ejs` | this visitor’s orders |
| `public/css/ministry.css` | parchment chrome + machine animation |
| `public/img/machine.png` | illustrated engine |
| `tests/*.test.js` | unit + HTTP tests |
| `data/ministry.sqlite` | runtime db (gitignored) |

---

### Task 1: Scaffold, brand config, gitignore

**Files:**
- Create: `package.json`, `.gitignore`, `config/brand.js`, `tests/brand.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `brand.name` string, `brand.tagline` string, `brand.disclaimerShort` string, `brand.disclaimerFull` string, `brand.nav` object

- [ ] **Step 1: Write the failing test**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const brand = require('../config/brand');

test('brand strings are the Ministry', () => {
  assert.equal(brand.name, 'The Ministry of Weather');
  assert.equal(brand.tagline, 'Purveyors of unlikely skies');
  assert.match(brand.disclaimerFull, /cannot change the weather/i);
  assert.match(brand.disclaimerFull, /\bAI\b/);
  assert.equal(brand.nav.file, 'File 27B');
  assert.equal(brand.nav.ledger, 'My ledger');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/brand.test.js`

Expected: FAIL with `Cannot find module`

- [ ] **Step 3: Write minimal implementation**

`package.json`:

```json
{
  "name": "ministry-of-weather",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test tests"
  },
  "engines": { "node": ">=20" },
  "dependencies": {
    "better-sqlite3": "^11.6.0",
    "cookie-parser": "^1.4.7",
    "ejs": "^3.1.10",
    "express": "^4.21.2"
  }
}
```

`.gitignore`:

```
node_modules/
data/
.superpowers/
```

`config/brand.js`:

```js
module.exports = {
  name: 'The Ministry of Weather',
  tagline: 'Purveyors of unlikely skies',
  disclaimerShort: 'Entertainment only. Humans, websites, and AI cannot change the weather.',
  disclaimerFull: 'For entertainment only. This site, its operators, and any AI involved cannot change the weather — and neither can you. No refunds in sunshine.',
  nav: { home: 'Home', file: 'File 27B', ledger: 'My ledger' },
  cta: 'File Form 27B',
  footer: 'A parody. The Ministry accepts no liability for drizzle, or the lack of it.'
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/brand.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore config/brand.js tests/brand.test.js
git commit -m "chore: scaffold Ministry brand config and gitignore"
```

If git is not initialised, `git init` first, then this commit. Do not commit `node_modules` or `.superpowers/`.

---

### Task 2: SQLite schema

**Files:**
- Create: `src/db.js`, `tests/db.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `openDb(filePath)` → Database; creates `visitors`, `orders`, `weather_cache`; `nowIso()` helper used by later tasks lives in db as `utcNowIso()`

- [ ] **Step 1: Write the failing test**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { openDb } = require('../src/db');

test('creates visitors, orders, weather_cache tables', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ministry-'));
  const db = openDb(path.join(dir, 't.sqlite'));
  const names = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name);
  assert.ok(names.includes('visitors'));
  assert.ok(names.includes('orders'));
  assert.ok(names.includes('weather_cache'));
  db.close();
});

test('inserts a visitor by token', () => {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO visitors (token, created_at) VALUES (?, ?)`).run('abc', '2026-08-24T00:00:00.000Z');
  const row = db.prepare(`SELECT token FROM visitors`).get();
  assert.equal(row.token, 'abc');
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/db.test.js`

Expected: FAIL `Cannot find module`

- [ ] **Step 3: Write minimal implementation**

`src/db.js`:

```js
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function openDb(filePath) {
  if (filePath !== ':memory:') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS visitors (
      id INTEGER PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      display_name TEXT,
      cancel_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      visitor_id INTEGER NOT NULL REFERENCES visitors(id),
      place_name TEXT NOT NULL,
      country TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      timezone TEXT NOT NULL,
      local_date TEXT NOT NULL,
      period TEXT NOT NULL,
      condition TEXT NOT NULL,
      temperature_c INTEGER NOT NULL,
      wind TEXT NOT NULL,
      humidity TEXT NOT NULL,
      reason TEXT NOT NULL,
      cancelled_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS weather_cache (
      cache_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
  `);
  return db;
}

function utcNowIso(date = new Date()) {
  return date.toISOString();
}

module.exports = { openDb, utcNowIso };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/db.test.js`

Expected: PASS. Then `npm install` so `better-sqlite3` is present if it was not.

- [ ] **Step 5: Commit**

```bash
git add src/db.js tests/db.test.js package-lock.json
git commit -m "feat: add SQLite schema for visitors, orders, and weather cache"
```

---

### Task 3: Time, slots, and derived status

**Files:**
- Create: `src/lib/time.js`, `tests/time.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `PERIODS = { morning: { startHour: 6, endHour: 12 }, afternoon: { startHour: 12, endHour: 18 }, evening: { startHour: 18, endHour: 24 } }`
  - `localDateString(date: Date, timeZone: string) => 'YYYY-MM-DD'`
  - `slotStartUtc(localDate: string, period: string, timeZone: string) => Date`
  - `slotEndUtc(localDate: string, period: string, timeZone: string) => Date`
  - `assertSlotBookable({ localDate, period, timeZone, now }) => { ok: true } | { ok: false, code: 'not_today' | 'too_soon' }`
  - `deriveStatus({ localDate, period, timeZone, now, cancelledAt }) => 'queued' | 'aimed' | 'settled' | 'cancelled'`
  - `FORECAST_HORIZON_DAYS = 15`

- [ ] **Step 1: Write the failing test**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const time = require('../src/lib/time');

test('localDateString uses the location timezone', () => {
  const utc = new Date('2026-12-25T02:00:00.000Z');
  assert.equal(time.localDateString(utc, 'America/New_York'), '2026-12-24');
  assert.equal(time.localDateString(utc, 'Europe/London'), '2026-12-25');
});

test('rejects today in the location calendar', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  const result = time.assertSlotBookable({
    localDate: '2026-08-24',
    period: 'evening',
    timeZone: 'UTC',
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'not_today');
});

test('rejects a slot starting in under 24 hours', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  const result = time.assertSlotBookable({
    localDate: '2026-08-25',
    period: 'morning',
    timeZone: 'UTC',
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'too_soon');
});

test('allows tomorrow afternoon when that is >= 24h', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  const result = time.assertSlotBookable({
    localDate: '2026-08-25',
    period: 'afternoon',
    timeZone: 'UTC',
    now
  });
  assert.equal(result.ok, true);
});

test('deriveStatus: cancelled wins', () => {
  assert.equal(time.deriveStatus({
    localDate: '2027-01-01',
    period: 'morning',
    timeZone: 'UTC',
    now: new Date('2026-08-24T00:00:00Z'),
    cancelledAt: '2026-08-24T00:00:00.000Z'
  }), 'cancelled');
});

test('deriveStatus: queued beyond today+15', () => {
  assert.equal(time.deriveStatus({
    localDate: '2026-09-20',
    period: 'morning',
    timeZone: 'UTC',
    now: new Date('2026-08-24T12:00:00Z'),
    cancelledAt: null
  }), 'queued');
});

test('deriveStatus: aimed inside horizon and not ended', () => {
  assert.equal(time.deriveStatus({
    localDate: '2026-08-30',
    period: 'morning',
    timeZone: 'UTC',
    now: new Date('2026-08-24T12:00:00Z'),
    cancelledAt: null
  }), 'aimed');
});

test('deriveStatus: settled after period end', () => {
  assert.equal(time.deriveStatus({
    localDate: '2026-08-20',
    period: 'morning',
    timeZone: 'UTC',
    now: new Date('2026-08-24T12:00:00Z'),
    cancelledAt: null
  }), 'settled');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/time.test.js`

Expected: FAIL `Cannot find module`

- [ ] **Step 3: Write minimal implementation**

`src/lib/time.js` — implement timezone conversion with `Intl.DateTimeFormat` `formatToParts` (hourCycle `h23`). Convert a local wall time to UTC by guessing `Date.UTC(y, m-1, d, hour)` then subtracting the zone offset at that instant, repeating once for DST. `localDateString` uses `en-CA` with `timeZone`. `assertSlotBookable`: if `localDate === localDateString(now, timeZone)` → `not_today`; if `slotStartUtc - now < 24 * 60 * 60 * 1000` → `too_soon`; else ok. `deriveStatus`: if `cancelledAt` → `cancelled`; if `now >= slotEndUtc` → `settled`; if `localDate > addDays(localDateString(now, timeZone), 15)` → `queued`; else `aimed`.

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/time.test.js`

Expected: PASS. If a DST edge fails, fix `wallTimeToUtc` only.

- [ ] **Step 5: Commit**

```bash
git add src/lib/time.js tests/time.test.js
git commit -m "feat: derive booking windows and order status from local time"
```

---

### Task 4: Weather slice and match

**Files:**
- Create: `config/weather.js`, `src/lib/slice.js`, `tests/slice.test.js`

**Interfaces:**
- Consumes: `PERIODS` from `src/lib/time.js` (hour bands)
- Produces:
  - `windCategory(kmh) => 'calm' | 'breeze' | 'gale'`
  - `humidityCategory(rh) => 'dry' | 'pleasant' | 'muggy'`
  - `wmoToCondition(code) =>` one of the six conditions
  - `representativeSlice(hourly, period) => { temperatureC, wind, humidity, condition }`
  - `isMatch(requested, actual) => boolean`
  - `TEMP_TOLERANCE_C = 3`
  - `FEATURED_CITIES` array of `{ id, name, latitude, longitude, timezone }`
  - `CONDITIONS`, `WINDS`, `HUMIDITIES`

Hourly shape: `{ time: string[], temperature_2m: number[], relative_humidity_2m: number[], weather_code: number[], wind_speed_10m: number[] }` with `time` ISO-like `YYYY-MM-DDTHH:00`.

- [ ] **Step 1: Write the failing test**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const slice = require('../src/lib/slice');

test('wind and humidity buckets', () => {
  assert.equal(slice.windCategory(11.9), 'calm');
  assert.equal(slice.windCategory(12), 'breeze');
  assert.equal(slice.windCategory(40), 'breeze');
  assert.equal(slice.windCategory(40.1), 'gale');
  assert.equal(slice.humidityCategory(39.9), 'dry');
  assert.equal(slice.humidityCategory(40), 'pleasant');
  assert.equal(slice.humidityCategory(70), 'pleasant');
  assert.equal(slice.humidityCategory(70.1), 'muggy');
});

test('WMO codes map to Ministry conditions', () => {
  assert.equal(slice.wmoToCondition(0), 'sun');
  assert.equal(slice.wmoToCondition(51), 'drizzle');
  assert.equal(slice.wmoToCondition(61), 'rain');
  assert.equal(slice.wmoToCondition(71), 'snow');
  assert.equal(slice.wmoToCondition(45), 'fog');
  assert.equal(slice.wmoToCondition(95), 'storm');
});

test('representativeSlice averages the morning band', () => {
  const hourly = {
    time: ['2026-08-25T05:00', '2026-08-25T06:00', '2026-08-25T07:00', '2026-08-25T12:00'],
    temperature_2m: [10, 20, 22, 99],
    relative_humidity_2m: [50, 50, 50, 10],
    weather_code: [0, 0, 0, 95],
    wind_speed_10m: [5, 5, 5, 80]
  };
  const actual = slice.representativeSlice(hourly, 'morning');
  assert.equal(actual.temperatureC, 21);
  assert.equal(actual.condition, 'sun');
  assert.equal(actual.wind, 'calm');
  assert.equal(actual.humidity, 'pleasant');
});

test('isMatch uses ±3C and category equality', () => {
  const requested = { condition: 'sun', temperatureC: 20, wind: 'calm', humidity: 'pleasant' };
  assert.equal(slice.isMatch(requested, { condition: 'sun', temperatureC: 23, wind: 'calm', humidity: 'pleasant' }), true);
  assert.equal(slice.isMatch(requested, { condition: 'sun', temperatureC: 24, wind: 'calm', humidity: 'pleasant' }), false);
  assert.equal(slice.isMatch(requested, { condition: 'rain', temperatureC: 20, wind: 'calm', humidity: 'pleasant' }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/slice.test.js`

Expected: FAIL `Cannot find module`

- [ ] **Step 3: Write minimal implementation**

`config/weather.js` must export `TEMP_TOLERANCE_C = 3`, `CONDITIONS`, `WINDS`, `HUMIDITIES`, `FEATURED_CITIES` with London, New York, Tokyo, Cairo, Sydney, Reykjavík (ids `london`, `new-york`, `tokyo`, `cairo`, `sydney`, `reykjavik`) and coordinates/timezones, plus `WMO_TO_CONDITION` map:

- 0, 1, 2, 3 → sun
- 45, 48 → fog
- 51, 53, 55, 56, 57 → drizzle
- 61, 63, 65, 66, 67, 80, 81, 82 → rain
- 71, 73, 75, 77, 85, 86 → snow
- 95, 96, 99 → storm
- default → sun

`src/lib/slice.js`: `windCategory` `< 12` calm, `<= 40` breeze, else gale. `humidityCategory` `< 40` dry, `<= 70` pleasant, else muggy. `representativeSlice` keeps hours where `hour >= startHour && hour < endHour` (evening: hour >= 18). Mean temp rounded `Math.round`. Dominant condition by count, ties pick first in CONDITIONS order. `isMatch` as spec.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/slice.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add config/weather.js src/lib/slice.js tests/slice.test.js
git commit -m "feat: map Open-Meteo hours onto Ministry knobs"
```

---

### Task 5: Seeded rivals

**Files:**
- Create: `config/rivals.js`, `src/lib/rival.js`, `tests/rival.test.js`

**Interfaces:**
- Consumes: `config/rivals.js` names array (length 24) and `reasons[condition]` arrays (length 6 each)
- Produces:
  - `roundCoord(n) => Number(n.toFixed(3))`
  - `rivalForSlot({ latitude, longitude, localDate, period, actualCondition }) => { name, reason }`
  - `theatreFiler({ cityId, localDate, condition }) => { name, reason }`

- [ ] **Step 1: Write the failing test**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rivalForSlot, theatreFiler } = require('../src/lib/rival');

test('same slot always yields the same rival', () => {
  const args = { latitude: 51.5074, longitude: -0.1278, localDate: '2026-12-25', period: 'morning', actualCondition: 'rain' };
  assert.deepEqual(rivalForSlot(args), rivalForSlot(args));
});

test('different period changes the rival seed', () => {
  const a = rivalForSlot({ latitude: 51.5, longitude: -0.1, localDate: '2026-12-25', period: 'morning', actualCondition: 'rain' });
  const b = rivalForSlot({ latitude: 51.5, longitude: -0.1, localDate: '2026-12-25', period: 'evening', actualCondition: 'rain' });
  assert.notDeepEqual(a, b);
});

test('theatre filer is stable for a city-day', () => {
  const a = theatreFiler({ cityId: 'london', localDate: '2026-08-24', condition: 'drizzle' });
  const b = theatreFiler({ cityId: 'london', localDate: '2026-08-24', condition: 'drizzle' });
  assert.deepEqual(a, b);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/rival.test.js`

Expected: FAIL `Cannot find module`

- [ ] **Step 3: Write minimal implementation**

`config/rivals.js`: 24 invented names (e.g. `Mildred P.`, `Nigel B.`, `Agnes T.` — not real public figures). `reasons` object with 6 humorous strings each for sun, rain, snow, drizzle, fog, storm.

`src/lib/rival.js`:

```js
const crypto = require('node:crypto');
const { names, reasons } = require('../../config/rivals');

function roundCoord(n) {
  return Number(Number(n).toFixed(3));
}

function seedInt(s) {
  return parseInt(crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 8), 16);
}

function pick(seed, arr) {
  return arr[seed % arr.length];
}

function rivalForSlot({ latitude, longitude, localDate, period, actualCondition }) {
  const seed = seedInt(`${roundCoord(latitude)}|${roundCoord(longitude)}|${localDate}|${period}`);
  const pool = reasons[actualCondition] || reasons.sun;
  return { name: pick(seed, names), reason: pick(Math.floor(seed / names.length), pool) };
}

function theatreFiler({ cityId, localDate, condition }) {
  const seed = seedInt(`${cityId}|${localDate}`);
  const pool = reasons[condition] || reasons.sun;
  return { name: pick(seed, names), reason: pick(Math.floor(seed / names.length), pool) };
}

module.exports = { roundCoord, rivalForSlot, theatreFiler };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/rival.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add config/rivals.js src/lib/rival.js tests/rival.test.js
git commit -m "feat: add deterministic fictional weather rivals"
```

---

### Task 6: Open-Meteo client and cache

**Files:**
- Create: `src/lib/weather.js`, `tests/weather.test.js`

**Interfaces:**
- Consumes: `openDb`, `roundCoord`, `utcNowIso`, `PERIODS` hour logic via `representativeSlice`
- Produces: `createWeather({ db, fetchFn, now })` with:
  - `geocode(query) => Place[]` (`name`, `country`, `latitude`, `longitude`, `timezone`)
  - `normalizeSearch(query)`
  - `forecastSlice({ latitude, longitude, localDate, period, timezone })`
  - `archiveSlice({ latitude, longitude, localDate, period, timezone })`
  - `currentForCity(city)`
  - fetch counts exposed via the fake `fetchFn` in tests

Cache keys:
- `geocode:${normalizeSearch(query)}` TTL 30d
- `forecast:${lat3}:${lon3}:${localDate}` TTL 12h
- `archive:${lat3}:${lon3}:${localDate}` never expires
- `current:${city.id}` TTL 60m

`normalizeSearch`: trim, lowercase, collapse whitespace.

URLs:
- Geocode: `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5`
- Forecast: `https://api.open-meteo.com/v1/forecast?latitude=&longitude=&hourly=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=`
- Archive: `https://archive-api.open-meteo.com/v1/archive?latitude=&longitude=&start_date=&end_date=&hourly=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=`
- Current: `https://api.open-meteo.com/v1/forecast?latitude=&longitude=&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=`

- [ ] **Step 1: Write the failing test**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createWeather } = require('../src/lib/weather');

function fakeFetch(map) {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    const key = [...map.keys()].find((k) => url.startsWith(k) || url.includes(k));
    const body = map.get(key) ?? map.get('default');
    return { ok: true, json: async () => body };
  };
  fetchFn.calls = calls;
  return fetchFn;
}

test('geocode is cached by normalised query', async () => {
  const db = openDb(':memory:');
  const fetchFn = fakeFetch(new Map([['geocoding-api', { results: [{ name: 'Croydon', country: 'United Kingdom', latitude: 51.376, longitude: -0.098, timezone: 'Europe/London' }] }]]));
  const weather = createWeather({ db, fetchFn, now: () => new Date('2026-08-24T00:00:00Z') });
  const a = await weather.geocode('  Croydon  ');
  const b = await weather.geocode('croydon');
  assert.equal(a[0].name, 'Croydon');
  assert.equal(b[0].name, 'Croydon');
  assert.equal(fetchFn.calls.length, 1);
  db.close();
});

test('archive is fetched once and frozen', async () => {
  const db = openDb(':memory:');
  const hourly = {
    time: ['2026-08-20T06:00', '2026-08-20T07:00'],
    temperature_2m: [10, 10],
    relative_humidity_2m: [50, 50],
    weather_code: [61, 61],
    wind_speed_10m: [5, 5]
  };
  const fetchFn = fakeFetch(new Map([['archive-api', { hourly }]]));
  const weather = createWeather({ db, fetchFn, now: () => new Date('2026-08-24T00:00:00Z') });
  const args = { latitude: 51.5, longitude: -0.1, localDate: '2026-08-20', period: 'morning', timezone: 'UTC' };
  await weather.archiveSlice(args);
  await weather.archiveSlice(args);
  assert.equal(fetchFn.calls.length, 1);
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/weather.test.js`

Expected: FAIL `Cannot find module`

- [ ] **Step 3: Write minimal implementation**

`createWeather` reads/writes `weather_cache`. On miss, `fetchFn(url)` then store `payload_json`. If `fetchFn` throws or `!ok`, return `null` (observatory failure). Geocode maps `results` to places; empty results → `[]`. `forecastSlice` / `archiveSlice` run `representativeSlice` on `payload.hourly`. `currentForCity` maps `current` block to a slice-like object using `wmoToCondition`, `windCategory`, `humidityCategory`.

TTL check: parse `fetched_at`, skip network if `now - fetched < ttl` (archive ttl = Infinity).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/weather.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/weather.js tests/weather.test.js
git commit -m "feat: cache Open-Meteo geocode, forecast, archive, and current"
```

---

### Task 7: File, daily stamp, and cancel

**Files:**
- Create: `src/lib/orders.js`, `config/copy.js`, `tests/orders.test.js`

**Interfaces:**
- Consumes: `assertSlotBookable`, `slotStartUtc`, `openDb`
- Produces:
  - `hasActiveFilingToday(db, visitorId, now) => boolean` (non-cancelled orders whose `created_at` UTC date equals `now` UTC date)
  - `fileOrder(db, visitor, payload, now) => { ok, order } | { ok: false, code }`
  - `cancelOrder(db, visitor, orderId, now) => { ok, cancelCount, copy } | { ok: false, code: 'not_found' | 'too_late' }`
  - `clerkCopy(cancelCount)` after increment: 1 sigh, 2 red ink, 3+ petition

`payload`: `{ placeName, country, latitude, longitude, timezone, localDate, period, condition, temperatureC, wind, humidity, reason }`

Validation codes: `no_name`, `bad_reason`, `bad_knobs`, `not_today`, `too_soon`, `already_filed`.

`fileOrder` requires `visitor.display_name`. Reason trim length 1–140. Temperature integer −20..45. Enums from config.

- [ ] **Step 1: Write the failing test**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { fileOrder, cancelOrder, hasActiveFilingToday } = require('../src/lib/orders');

function seedVisitor(db) {
  db.prepare(`INSERT INTO visitors (token, display_name, created_at) VALUES (?, ?, ?)`).run('t', 'Darren G', '2026-08-01T00:00:00.000Z');
  return db.prepare(`SELECT * FROM visitors`).get();
}

const payload = {
  placeName: 'Croydon',
  country: 'United Kingdom',
  latitude: 51.376,
  longitude: -0.098,
  timezone: 'UTC',
  localDate: '2026-08-26',
  period: 'afternoon',
  condition: 'drizzle',
  temperatureC: 14,
  wind: 'calm',
  humidity: 'pleasant',
  reason: 'a friend\'s wedding'
};

test('one active filing per UTC day; cancel refunds the stamp', () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  const now = new Date('2026-08-24T15:00:00.000Z');
  const first = fileOrder(db, visitor, payload, now);
  assert.equal(first.ok, true);
  assert.equal(hasActiveFilingToday(db, visitor.id, now), true);
  const second = fileOrder(db, visitor, payload, now);
  assert.equal(second.ok, false);
  assert.equal(second.code, 'already_filed');
  const cancel = cancelOrder(db, visitor, first.order.id, now);
  assert.equal(cancel.ok, true);
  assert.equal(hasActiveFilingToday(db, visitor.id, now), false);
  const third = fileOrder(db, visitor, payload, now);
  assert.equal(third.ok, true);
  db.close();
});

test('cannot cancel another visitor\'s order', () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  db.prepare(`INSERT INTO visitors (token, display_name, created_at) VALUES (?, ?, ?)`).run('u', 'Nigel B', '2026-08-01T00:00:00.000Z');
  const other = db.prepare(`SELECT * FROM visitors WHERE token = 'u'`).get();
  const now = new Date('2026-08-24T15:00:00.000Z');
  const first = fileOrder(db, visitor, payload, now);
  const cancel = cancelOrder(db, other, first.order.id, now);
  assert.equal(cancel.ok, false);
  assert.equal(cancel.code, 'not_found');
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/orders.test.js`

Expected: FAIL `Cannot find module`

- [ ] **Step 3: Write minimal implementation**

`config/copy.js` exports `tooSoon`, `notToday`, `alreadyFiled`, `parishNotFound`, `observatory`, `engineEnRoute`, `stampReturned`, and `cancelClerks: { 1, 2, 3 }`.

`src/lib/orders.js`: implement stamp as `SELECT COUNT(*) FROM orders WHERE visitor_id = ? AND cancelled_at IS NULL AND substr(created_at, 1, 10) = substr(nowIso, 1, 10)`. Cancel sets `cancelled_at`, increments `visitors.cancel_count`, returns copy from `cancelClerks[Math.min(count, 3)]`. Too late if `slotStartUtc - now < 24h`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/orders.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/orders.js config/copy.js tests/orders.test.js
git commit -m "feat: enforce daily filing stamp and humorous cancel"
```

---

### Task 8: Express app, visitor cookie, layout

**Files:**
- Create: `src/app.js`, `src/middleware/visitor.js`, `src/server.js`, `views/layout.ejs`, `views/home.ejs` (placeholder heading only), `public/css/ministry.css` (disclaimer + parchment page shell), `tests/http-visitor.test.js`

**Interfaces:**
- Consumes: `openDb`, `brand`
- Produces: `createApp({ db, now, weather })` Express app; `GET /` 200 with disclaimer HTML; cookie `ministry_visitor` set

- [ ] **Step 1: Write the failing test**

Install supertest as a devDependency: `npm install --save-dev supertest`

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

test('home sets a visitor cookie and shows the disclaimer', async () => {
  const db = openDb(':memory:');
  const app = createApp({ db, now: () => new Date('2026-08-24T12:00:00Z'), weather: { currentForCity: async () => null, recentOrders: () => [] } });
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /cannot change the weather/i);
  assert.match(res.headers['set-cookie'].join(';'), /ministry_visitor=/);
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/http-visitor.test.js`

Expected: FAIL `Cannot find module` or missing `createApp`

- [ ] **Step 3: Write minimal implementation**

Visitor middleware: if cookie token exists, `SELECT * FROM visitors WHERE token = ?`; else generate `crypto.randomBytes(24).toString('hex')`, insert visitor, `res.cookie('ministry_visitor', token, { httpOnly: true, sameSite: 'lax', maxAge: 365 * 24 * 60 * 60 * 1000, secure: process.env.NODE_ENV === 'production' })`. Attach `req.visitor`.

`createApp`: `express()`, `cookie-parser`, static `public`, `views` EJS, `app.locals.brand`, visitor middleware, `GET /` render `home` inside layout. Layout includes sticky disclaimer (`brand.disclaimerFull`), header nav, footer.

`src/server.js`: `openDb(path.join(__dirname, '..', 'data', 'ministry.sqlite'))`, real `createWeather` with global `fetch`, `app.listen(3000)`.

Parchment CSS: `#efe4cc` background, `#8b1e1e` disclaimer bar, Georgia headings, brass `#6b4423` links.

Home placeholder may say the Ministry name; machine comes in Task 9.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/http-visitor.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app.js src/middleware/visitor.js src/server.js views/layout.ejs views/home.ejs public/css/ministry.css tests/http-visitor.test.js package.json package-lock.json
git commit -m "feat: serve parchment layout with visitor cookie and disclaimer"
```

---

### Task 9: Home machine, ticker, and board

**Files:**
- Create: `src/lib/board.js`, `tests/board.test.js`
- Modify: `src/app.js`, `views/home.ejs`, `public/css/ministry.css`

**Interfaces:**
- Consumes: `FEATURED_CITIES`, `theatreFiler`, `createWeather.currentForCity`, orders table
- Produces: `buildBoard({ db, weather, now }) => { theatre: Card[], real: Card[], ticker: Card[] }`
  - Card: `{ place, condition, temperatureC, name, reason, kind: 'theatre' | 'real' }`
  - theatre: 6 cities, current weather, filer seeded by city id + city’s local date
  - real: 8 newest non-cancelled orders
  - ticker: theatre + real concatenated

- [ ] **Step 1: Write the failing test**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { buildBoard } = require('../src/lib/board');

test('theatre cards are stable for a given city-day', async () => {
  const db = openDb(':memory:');
  const weather = {
    currentForCity: async (city) => ({ temperatureC: 14, condition: 'drizzle', wind: 'calm', humidity: 'pleasant' })
  };
  const now = new Date('2026-08-24T12:00:00Z');
  const a = await buildBoard({ db, weather, now });
  const b = await buildBoard({ db, weather, now });
  assert.equal(a.theatre.length, 6);
  assert.deepEqual(a.theatre[0], b.theatre[0]);
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/board.test.js`

Expected: FAIL `Cannot find module`

- [ ] **Step 3: Write minimal implementation**

`buildBoard` loops `FEATURED_CITIES`, `localDateString(now, city.timezone)`, `currentForCity` (if null, still show city with observatory copy and skip rival weather digits). Home template: machine figure (illustration + three `.cog` divs, `.pipe` with `.puff` spans, `.gauge`), ticker `<div class="ticker">` with duplicated track for CSS loop, CTA link `/request`, notice card grid, two empty `.departmental-notice` slots with aria-hidden empty parchment boxes.

CSS: cog `animation: spin` at 12s, 18s, 8s linear infinite; puffs rise/fade; gauge needle 6s ease-in-out; `@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }`. Mobile: cards `grid-template-columns: 1fr`; desktop `repeat(3, 1fr)`. Ticker `overflow: hidden; white-space: nowrap`.

`GET /` calls `buildBoard` and renders.

- [ ] **Step 4: Run tests**

Run: `node --test tests/board.test.js tests/http-visitor.test.js`

Expected: PASS. Home HTML contains `File Form 27B` and `departmental-notice`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/board.js tests/board.test.js src/app.js views/home.ejs public/css/ministry.css
git commit -m "feat: add weather machine, ticker, and public notice board"
```

---

### Task 10: Form 27B

**Files:**
- Create: `views/request.ejs`, `tests/http-request.test.js`
- Modify: `src/app.js`

**Interfaces:**
- Consumes: `weather.geocode`, `fileOrder`
- Produces: `GET /request`, `POST /request`

GET: if `hasActiveFilingToday`, show locked form with `copy.alreadyFiled` (mention cancel refunds stamp). Else show fields: Call me (if no `display_name`, else hidden/read-only name), place, date, period, condition, temperature, wind, humidity, reason. Helper: machine takes at least 24 hours. Warning: name and reason are public.

POST flow:
1. If no display name, set `visitors.display_name` from `call_me` (2–40 chars) then reload visitor.
2. `geocode(place)`. If 0 results: re-render with `parishNotFound`. If several and no `place_index`, show alternatives as radio list. If one or `place_index` chosen, use that place.
3. `fileOrder`. On `too_soon` / `not_today`: show `copy.tooSoon`. On `already_filed`: lock. On ok: redirect `/ledger`.

- [ ] **Step 1: Write the failing test**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

function appWithGeo() {
  const db = openDb(':memory:');
  const weather = {
    geocode: async () => [{ name: 'Croydon', country: 'United Kingdom', latitude: 51.376, longitude: -0.098, timezone: 'UTC' }],
    currentForCity: async () => null
  };
  const app = createApp({ db, now: () => new Date('2026-08-24T12:00:00Z'), weather });
  return { db, app };
}

test('rejects a slot that is too soon', async () => {
  const { db, app } = appWithGeo();
  const agent = request.agent(app);
  await agent.get('/');
  const res = await agent
    .post('/request')
    .type('form')
    .send({
      call_me: 'Darren G',
      place: 'Croydon',
      local_date: '2026-08-25',
      period: 'morning',
      condition: 'drizzle',
      temperature_c: '14',
      wind: 'calm',
      humidity: 'pleasant',
      reason: 'a wedding'
    });
  assert.equal(res.status, 200);
  assert.match(res.text, /24 hours/i);
  db.close();
});

test('files a valid request and shows it on the ledger', async () => {
  const { db, app } = appWithGeo();
  const agent = request.agent(app);
  await agent.get('/');
  const res = await agent
    .post('/request')
    .type('form')
    .send({
      call_me: 'Darren G',
      place: 'Croydon',
      local_date: '2026-08-26',
      period: 'afternoon',
      condition: 'drizzle',
      temperature_c: '14',
      wind: 'calm',
      humidity: 'pleasant',
      reason: 'a wedding'
    });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/ledger');
  const ledger = await agent.get('/ledger');
  assert.match(ledger.text, /Croydon/);
  assert.match(ledger.text, /wedding/);
  db.close();
});
```

Note: `GET /ledger` may 404 until this task adds a stub that lists orders. Include a minimal ledger render in this task (status text can be “Queued” via `deriveStatus`) so the redirect test passes. Polish settled/aimed UI in Task 11 if needed — but `GET /ledger` must exist here.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/http-request.test.js`

Expected: FAIL (no `/request` or 404 ledger)

- [ ] **Step 3: Write minimal implementation**

Wire routes in `src/app.js`. `express.urlencoded({ extended: false })`. EJS form with the knobs. No client-side weather calls.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/http-request.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app.js views/request.ejs views/ledger.ejs tests/http-request.test.js
git commit -m "feat: file Form 27B with geocode, 24h rule, and public reason"
```

---

### Task 11: Ledger comparison, cancel, and observatory fallback

**Files:**
- Create: `tests/http-ledger.test.js`
- Modify: `src/app.js`, `src/lib/orders.js` (if needed), `views/ledger.ejs`, `config/copy.js`

**Interfaces:**
- Consumes: `deriveStatus`, `forecastSlice`, `archiveSlice`, `isMatch`, `rivalForSlot`
- Produces: ledger rows with `status`, optional `actual`, optional `rival`, match copy
  - queued: no weather fetch
  - aimed: `forecastSlice` (null → observatory copy)
  - settled: `archiveSlice` once via cache; match → cautious credit copy; mismatch → rival for **actual** condition
  - cancelled: struck through
  - `POST /orders/:id/cancel` with confirm field `confirm=yes`; GET ledger includes cancel form only when `slotStartUtc - now >= 24h`

- [ ] **Step 1: Write the failing test**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { fileOrder } = require('../src/lib/orders');

test('queued orders do not call forecast or archive', async () => {
  const db = openDb(':memory:');
  const calls = [];
  const weather = {
    geocode: async () => [],
    currentForCity: async () => null,
    forecastSlice: async () => { calls.push('forecast'); return null; },
    archiveSlice: async () => { calls.push('archive'); return null; }
  };
  const now = () => new Date('2026-08-24T12:00:00Z');
  const app = createApp({ db, now, weather });
  const agent = request.agent(app);
  await agent.get('/');
  db.prepare(`UPDATE visitors SET display_name = ?`).run('Darren G');
  const visitor = db.prepare(`SELECT * FROM visitors`).get();
  fileOrder(db, visitor, {
    placeName: 'Croydon', country: 'UK', latitude: 51.376, longitude: -0.098,
    timezone: 'UTC', localDate: '2026-12-25', period: 'morning',
    condition: 'sun', temperatureC: 10, wind: 'calm', humidity: 'pleasant', reason: 'Christmas'
  }, now());
  const res = await agent.get('/ledger');
  assert.match(res.text, /not yet aimed/i);
  assert.deepEqual(calls, []);
  db.close();
});

test('settled mismatch names a rival', async () => {
  const db = openDb(':memory:');
  const weather = {
    currentForCity: async () => null,
    forecastSlice: async () => null,
    archiveSlice: async () => ({ temperatureC: 8, condition: 'rain', wind: 'gale', humidity: 'muggy' })
  };
  const now = () => new Date('2026-08-24T12:00:00Z');
  const app = createApp({ db, now, weather });
  const agent = request.agent(app);
  await agent.get('/');
  db.prepare(`UPDATE visitors SET display_name = ?`).run('Darren G');
  const visitor = db.prepare(`SELECT * FROM visitors`).get();
  fileOrder(db, visitor, {
    placeName: 'Croydon', country: 'UK', latitude: 51.376, longitude: -0.098,
    timezone: 'UTC', localDate: '2026-08-20', period: 'morning',
    condition: 'sun', temperatureC: 22, wind: 'calm', humidity: 'dry', reason: 'a picnic'
  }, new Date('2026-08-01T12:00:00Z'));
  const res = await agent.get('/ledger');
  assert.match(res.text, /already/i);
  db.close();
});
```

For the second test, `fileOrder` will reject `2026-08-20` as not_today/past when `assertSlotBookable` uses `now` from the function argument — pass `now` of `2026-08-01` into `fileOrder` as above so the row inserts. `created_at` will be 2026-08-01. Ledger uses `now` of Aug 24 so status is settled.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/http-ledger.test.js`

Expected: FAIL (queued copy missing or rival missing)

- [ ] **Step 3: Write minimal implementation**

Add `hydrateOrder(order, { weather, now })` in `src/lib/orders.js` or `src/lib/board.js` is the wrong place — put `hydrateOrder` in `src/lib/orders.js`. Switch on `deriveStatus`. Cancel POST: if ok, redirect ledger with flash query `?withdrawn=1` showing `stampReturned` plus clerk copy.

Match copy exact: `A satisfactory outcome. Coincidence remains a leading theory.`

- [ ] **Step 4: Run tests**

Run: `node --test tests`

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/app.js src/lib/orders.js views/ledger.ejs tests/http-ledger.test.js config/copy.js
git commit -m "feat: compare ledger orders to actual weather and cancel with clerk copy"
```

---

### Task 12: Machine illustration and visual polish

**Files:**
- Create: `public/img/machine.png` (or `.webp`)
- Modify: `views/home.ejs`, `public/css/ministry.css`, `views/request.ejs`, `views/ledger.ejs`

**Interfaces:**
- Consumes: visual spec §3
- Produces: hero illustration behind overlay cogs/steam/gauge; form and ledger share the same parchment chrome

- [ ] **Step 1: Add the illustration**

Generate a landscape illustration: Monty Python cut-out meets Victorian brass weather engine, cream sky, copper boiler, chimney pipe, not photoreal, not dark grimdark, wide banner crop. Save as `public/img/machine.png`. Home machine `background-image` or `<img>` under the SVG/HTML overlays. Decorative only; ticker remains HTML.

- [ ] **Step 2: Polish CSS**

Shared `.btn-brass`, `.card-notice`, sticky disclaimer `z-index`, header wrapping on small screens, form fields with dashed brass borders, ledger rows for queued/aimed/settled/cancelled. Empty departmental notices remain empty. No ads.

- [ ] **Step 3: Manual check**

Run: `npm start`  
Open `http://localhost:3000` at ~375px and ~1280px width. Confirm: disclaimer, spinning cogs (or static if OS reduced-motion), ticker, Form 27B, ledger nav. File a fake order ≥ 24h out. Confirm cookie survives refresh.

- [ ] **Step 4: Run full test suite**

Run: `npm test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/img/machine.png public/css/ministry.css views/home.ejs views/request.ejs views/ledger.ejs
git commit -m "feat: illustrate the weather machine and polish parchment UI"
```

---

## Self-review

**Spec coverage**

| Spec section | Task |
|--------------|------|
| Brand config / rebrand | 1 |
| SQLite schema | 2 |
| 24h, not today, periods, derived status | 3 |
| Slice, WMO, match ±3 °C | 4 |
| Rival + theatre seeds | 5 |
| Open-Meteo + cache TTLs | 6 |
| Daily stamp, cancel refund, clerk copy | 7 |
| Cookie, disclaimer layout | 8 |
| Home steam-then-stamp, machine, ticker, board, ad slots | 9 |
| Form 27B, public reason, geocode | 10 |
| Ledger hydrate, no fetch when queued, archive freeze (via weather cache), cancel POST | 11 |
| Illustration, reduced motion, mobile | 9 + 12 |
| Legal copy | 1, 8, 10 |
| HTTP isolation per cookie | 10–11 |
| Accounts/ads/payments | out of scope |

**Placeholder scan:** none remaining; template engines locked to EJS; cities locked; rival counts locked.

**Type consistency:** `createApp({ db, now, weather })`, `fileOrder(db, visitor, payload, now)`, `deriveStatus`, `representativeSlice`, `rivalForSlot`, cache kinds `geocode|forecast|archive|current` match the spec.
