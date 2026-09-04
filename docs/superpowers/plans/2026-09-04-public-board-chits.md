# Public Board Chits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the home board a single mixed grid of indistinguishable stamped 27B chits, and freeze settled actual weather plus denied rivals on the order row so later loads never change.

**Architecture:** Add settlement columns on `orders`. `hydrateOrder` writes the snapshot the first time a slot is settled with an archive slice, then reads only that snapshot. `buildBoard` hydrates candidate filings, keeps today’s accepted ones, pads with fake city 27Bs to at least six, and shuffles with a UTC-date seed. Home renders `board.cards` only.

**Tech Stack:** Node 20+, Express 4, EJS, better-sqlite3, CommonJS, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-04-public-board-chits-design.md`

## Global Constraints

- Entertainment only. Invented rival names only. Never imply the Ministry changes the weather.
- Match: same condition, wind, humidity; temperature ±3°C (`TEMP_TOLERANCE_C`).
- Rival seed: `round(lat,3)|round(lon,3)|YYYY-MM-DD|period`. Theatre seed: `cityId|YYYY-MM-DD` using that city’s local date.
- Fake requested weather: same condition/wind/humidity as live actual; temperature offset −3..+3°C from the city-day seed, clamped −20..45.
- Real board cards: not cancelled; slot settled; `outcome === 'accepted'`; place local date is still the order `local_date`.
- Pad with featured-city fakes to at least six cards. Skip a city if weather is missing or an accepted real sits on the same rounded lat/lon.
- Shuffle seed: today’s UTC `YYYY-MM-DD`. Ticker is `cards`.
- Name pool: 50 invented people, 25 first-name only, 25 `Jon H` (no full stop). Same pool for fakes and denied rivals.
- Tests use `:memory:` or a temp SQLite file. Never `data/ministry.sqlite`.
- Do not create git commits unless the user explicitly asked to commit in this session. If they did not, skip every Commit step.
- Voice: official, incompetent clerks. Never cruel.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `config/rivals.js` | 50 invented names + reason pools |
| `src/db.js` | schema + `ALTER TABLE` for settlement columns on existing files |
| `src/lib/orders.js` | `hydrateOrder(order, { db, weather, now })` freeze/read snapshot |
| `src/lib/rival.js` | `theatreRequestedWeather`, export `seedInt` |
| `src/lib/board.js` | mixed `cards` + ticker |
| `src/app.js` | pass `db` into `hydrateOrder` |
| `views/home.ejs` | one chit layout; no fake/real labels |
| `public/css/ministry.css` | requested/actual lines on notice cards |
| `tests/rivals.test.js` | pool length and name shapes |
| `tests/db.test.js` | settlement columns exist |
| `tests/orders.test.js` | freeze on hydrate |
| `tests/rival.test.js` | requested-weather nudge |
| `tests/board.test.js` | mix, pad, skip, filter, shuffle |
| `tests/http-visitor.test.js` | home HTML has no kind labels |

---

### Task 1: Fifty invented names

**Files:**
- Create: `tests/rivals.test.js`
- Modify: `config/rivals.js`

**Interfaces:**
- Consumes: existing `reasons` object (unchanged)
- Produces: `names` array length 50; exactly 25 strings include a space; none end with `.`

- [ ] **Step 1: Write the failing test**

Create `tests/rivals.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { names } = require('../config/rivals');

test('invented pool is fifty names, half with an initial', () => {
  assert.equal(names.length, 50);
  assert.equal(new Set(names).size, 50);
  const withInitial = names.filter((name) => name.includes(' '));
  assert.equal(withInitial.length, 25);
  for (const name of names) {
    assert.doesNotMatch(name, /\.$/);
    assert.ok(name.length >= 2);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/rivals.test.js`

Expected: FAIL (`names.length` is 24).

- [ ] **Step 3: Replace the names array**

In `config/rivals.js`, set `names` to exactly:

```js
names: [
  'Horatio', 'Agnes', 'Mildred', 'Nigel', 'Barnaby',
  'Winifred', 'Prudence', 'Cedric', 'Hortense', 'Oswald',
  'Beatrice', 'Thaddeus', 'Constance', 'Algernon', 'Muriel',
  'Rupert', 'Sybil', 'Gertrude', 'Percival', 'Dorothea',
  'Reginald', 'Lesley', 'Rowan', 'Jules', 'Morgan',
  'Jon H', 'Sam K', 'Pat L', 'Alex M', 'Robin D',
  'Chris R', 'Kim W', 'Ellis B', 'Frankie C', 'Jamie F',
  'Casey Q', 'Drew U', 'Quinn A', 'Clive U', 'Ethel A',
  'Penelope Z', 'Ivor N', 'Mabel J', 'Basil F', 'Enid P',
  'Cyril W', 'Nora G', 'Hector S', 'Ida V', 'Walter Q'
],
```

Leave `reasons` unchanged.

- [ ] **Step 4: Run tests**

Run: `node --test tests/rivals.test.js tests/rival.test.js`

Expected: PASS.

- [ ] **Step 5: Commit (only if the user asked)**

```bash
git add config/rivals.js tests/rivals.test.js
git commit -m "feat: expand invented filer names to fifty mixed forms"
```

---

### Task 2: Settlement columns on orders

**Files:**
- Modify: `src/db.js`
- Modify: `tests/db.test.js`

**Interfaces:**
- Consumes: existing `openDb`
- Produces: every `orders` row can store `outcome`, `actual_condition`, `actual_temperature_c`, `actual_wind`, `actual_humidity`, `rival_name`, `rival_reason`, `settled_recorded_at` (all nullable)

- [ ] **Step 1: Write the failing test**

Append to `tests/db.test.js`:

```js
test('orders can freeze a settled outcome', () => {
  const db = openDb(':memory:');
  const cols = db.prepare(`PRAGMA table_info(orders)`).all().map((row) => row.name);
  for (const name of [
    'outcome',
    'actual_condition',
    'actual_temperature_c',
    'actual_wind',
    'actual_humidity',
    'rival_name',
    'rival_reason',
    'settled_recorded_at'
  ]) {
    assert.ok(cols.includes(name), name);
  }
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/db.test.js`

Expected: FAIL (missing `outcome`).

- [ ] **Step 3: Add columns to CREATE TABLE and migrate existing files**

In `src/db.js`, add these columns to the `CREATE TABLE IF NOT EXISTS orders` body (after `created_at TEXT NOT NULL`):

```sql
outcome TEXT,
actual_condition TEXT,
actual_temperature_c INTEGER,
actual_wind TEXT,
actual_humidity TEXT,
rival_name TEXT,
rival_reason TEXT,
settled_recorded_at TEXT
```

After `db.exec(...)`, call:

```js
ensureOrderSettlementColumns(db);
```

Add:

```js
function ensureOrderSettlementColumns(db) {
  const cols = db.prepare(`PRAGMA table_info(orders)`).all().map((row) => row.name);
  const add = [
    ['outcome', 'TEXT'],
    ['actual_condition', 'TEXT'],
    ['actual_temperature_c', 'INTEGER'],
    ['actual_wind', 'TEXT'],
    ['actual_humidity', 'TEXT'],
    ['rival_name', 'TEXT'],
    ['rival_reason', 'TEXT'],
    ['settled_recorded_at', 'TEXT']
  ];
  for (const [name, type] of add) {
    if (!cols.includes(name)) {
      db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
    }
  }
}
```

This covers live `data/ministry.sqlite` files created before the new CREATE TABLE.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/db.test.js`

Expected: PASS.

- [ ] **Step 5: Commit (only if the user asked)**

```bash
git add src/db.js tests/db.test.js
git commit -m "feat: store frozen settlement on weather orders"
```

---

### Task 3: Freeze hydrateOrder

**Files:**
- Modify: `src/lib/orders.js`
- Modify: `src/app.js` (pass `{ db, weather, now }`)
- Modify: `tests/orders.test.js`

**Interfaces:**
- Consumes: `hydrateOrder(order, { db, weather, now })`, new settlement columns
- Produces: first settled archive write of `outcome` (`accepted` \| `denied`), actual knobs, optional rival; later calls return that snapshot and do not call `archiveSlice`. `view.outcome` is `'accepted'`, `'denied'`, or `null` (no longer `matchCredit`). `view.verdict` stays `accepted` / `denied` / `pending` / `withdrawn` / `observatory`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/orders.test.js` (require `hydrateOrder` from `../src/lib/orders`):

```js
function insertSettledOrder(db, visitorId, knobs) {
  const result = db.prepare(`
    INSERT INTO orders (
      visitor_id, place_name, latitude, longitude, timezone, local_date,
      period, condition, temperature_c, wind, humidity, reason, created_at
    ) VALUES (?, 'Croydon', 51.376, -0.098, 'UTC', '2026-08-20', 'morning', ?, ?, ?, ?, 'a picnic', '2026-08-01T12:00:00.000Z')
  `).run(visitorId, knobs.condition, knobs.temperatureC, knobs.wind, knobs.humidity);
  return db.prepare(`SELECT * FROM orders WHERE id = ?`).get(result.lastInsertRowid);
}

test('first settled mismatch freezes rival and actual weather', async () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  const order = insertSettledOrder(db, visitor.id, {
    condition: 'sun', temperatureC: 22, wind: 'calm', humidity: 'dry'
  });
  let archiveCalls = 0;
  const weather = {
    archiveSlice: async () => {
      archiveCalls += 1;
      return { temperatureC: 8, condition: 'rain', wind: 'gale', humidity: 'muggy' };
    }
  };
  const now = new Date('2026-08-24T12:00:00Z');
  const first = await hydrateOrder(order, { db, weather, now });
  assert.equal(first.verdict, 'denied');
  assert.equal(first.outcome, 'denied');
  assert.equal(first.actualWeather, 'rain, 8°C, gale, muggy');
  assert.ok(first.rival.name);
  assert.ok(first.rival.reason);
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(order.id);
  assert.equal(row.outcome, 'denied');
  assert.equal(row.rival_name, first.rival.name);
  assert.equal(row.rival_reason, first.rival.reason);

  const weather2 = {
    archiveSlice: async () => {
      archiveCalls += 1;
      return { temperatureC: 1, condition: 'snow', wind: 'calm', humidity: 'dry' };
    }
  };
  const frozen = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(order.id);
  const second = await hydrateOrder(frozen, { db, weather: weather2, now });
  assert.equal(archiveCalls, 1);
  assert.equal(second.verdict, 'denied');
  assert.equal(second.rival.name, first.rival.name);
  assert.equal(second.actualWeather, 'rain, 8°C, gale, muggy');
  db.close();
});

test('first settled match freezes actual weather without a rival', async () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  const order = insertSettledOrder(db, visitor.id, {
    condition: 'sun', temperatureC: 22, wind: 'calm', humidity: 'dry'
  });
  let archiveCalls = 0;
  const weather = {
    archiveSlice: async () => {
      archiveCalls += 1;
      return { temperatureC: 22, condition: 'sun', wind: 'calm', humidity: 'dry' };
    }
  };
  const now = new Date('2026-08-24T12:00:00Z');
  const first = await hydrateOrder(order, { db, weather, now });
  assert.equal(first.verdict, 'accepted');
  assert.equal(first.outcome, 'accepted');
  assert.equal(first.rival, null);
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(order.id);
  assert.equal(row.outcome, 'accepted');
  assert.equal(row.rival_name, null);
  const weather2 = {
    archiveSlice: async () => {
      archiveCalls += 1;
      return { temperatureC: 0, condition: 'fog', wind: 'gale', humidity: 'muggy' };
    }
  };
  const frozen = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(order.id);
  const second = await hydrateOrder(frozen, { db, weather: weather2, now });
  assert.equal(archiveCalls, 1);
  assert.equal(second.verdict, 'accepted');
  assert.equal(second.actualWeather, 'sun, 22°C, calm, dry');
  db.close();
});

test('observatory on first settled load leaves the snapshot empty', async () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  const order = insertSettledOrder(db, visitor.id, {
    condition: 'sun', temperatureC: 22, wind: 'calm', humidity: 'dry'
  });
  const first = await hydrateOrder(order, {
    db,
    weather: { archiveSlice: async () => null },
    now: new Date('2026-08-24T12:00:00Z')
  });
  assert.equal(first.verdict, 'observatory');
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(order.id);
  assert.equal(row.outcome, null);
  const second = await hydrateOrder(row, {
    db,
    weather: {
      archiveSlice: async () => ({ temperatureC: 22, condition: 'sun', wind: 'calm', humidity: 'dry' })
    },
    now: new Date('2026-08-24T12:00:00Z')
  });
  assert.equal(second.verdict, 'accepted');
  assert.equal(db.prepare(`SELECT outcome FROM orders WHERE id = ?`).get(order.id).outcome, 'accepted');
  db.close();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/orders.test.js`

Expected: FAIL (`hydrateOrder` is not exported / `db` unused / `outcome` not written).

- [ ] **Step 3: Implement freeze in `hydrateOrder`**

Export `hydrateOrder` (already exported). Change signature to `hydrateOrder(order, { db, weather, now })`.

After building `view` and handling cancelled/queued:

If `status === 'settled'` and `order.outcome` is `'accepted'` or `'denied'`, fill `view` from the snapshot and **return without calling weather**:

```js
function applyFrozenSnapshot(view, order) {
  const actual = {
    condition: order.actual_condition,
    temperatureC: order.actual_temperature_c,
    wind: order.actual_wind,
    humidity: order.actual_humidity
  };
  view.actual = actual;
  view.actualWeather = formatWeatherLine(actual);
  view.outcome = order.outcome;
  if (order.outcome === 'accepted') {
    view.verdict = 'accepted';
    view.rival = null;
    return;
  }
  view.rival = { name: order.rival_name, reason: order.rival_reason };
  view.verdict = 'denied';
  view.denialReason = deniedReason(order.rival_name);
}
```

If settled (or aimed) without a snapshot, keep the existing forecast/archive fetch. If settled and `actual` is missing, keep observatory and do not UPDATE.

If settled and `actual` exists, compute `isMatch`, then:

```js
function freezeSettlement(db, order, now, { actual, outcome, rival }) {
  db.prepare(`
    UPDATE orders SET
      outcome = ?,
      actual_condition = ?,
      actual_temperature_c = ?,
      actual_wind = ?,
      actual_humidity = ?,
      rival_name = ?,
      rival_reason = ?,
      settled_recorded_at = ?
    WHERE id = ?
  `).run(
    outcome,
    actual.condition,
    actual.temperatureC,
    actual.wind,
    actual.humidity,
    rival ? rival.name : null,
    rival ? rival.reason : null,
    now.toISOString(),
    order.id
  );
}
```

Set `view.outcome` to `'accepted'` or `'denied'` (stop assigning `matchCredit` to `view.outcome`). `matchCredit` may remain unused.

In `src/app.js` ledger GET:

```js
orders.push(await hydrateOrder(order, { db, weather, now: now() }));
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/orders.test.js tests/http-ledger.test.js`

Expected: PASS.

- [ ] **Step 5: Commit (only if the user asked)**

```bash
git add src/lib/orders.js src/app.js tests/orders.test.js
git commit -m "feat: freeze settled weather and denied rivals on the order"
```

---

### Task 4: Seeded fake requested weather

**Files:**
- Modify: `src/lib/rival.js`
- Modify: `tests/rival.test.js`

**Interfaces:**
- Consumes: `seedInt`, live `actual` slice `{ condition, temperatureC, wind, humidity }`
- Produces:
  - `seedInt(s) => number` (exported)
  - `theatreRequestedWeather({ cityId, localDate, actual }) => { condition, temperatureC, wind, humidity }`
  - same condition/wind/humidity as `actual`; `|temperatureC - actual.temperatureC| <= 3`; clamped to −20..45; stable for city-day

- [ ] **Step 1: Write the failing test**

Append to `tests/rival.test.js`:

```js
const { rivalForSlot, theatreFiler, theatreRequestedWeather } = require('../src/lib/rival');

test('theatre requested weather nudges temperature within three degrees', () => {
  const actual = { temperatureC: 14, condition: 'drizzle', wind: 'calm', humidity: 'pleasant' };
  const a = theatreRequestedWeather({ cityId: 'london', localDate: '2026-08-24', actual });
  const b = theatreRequestedWeather({ cityId: 'london', localDate: '2026-08-24', actual });
  assert.deepEqual(a, b);
  assert.equal(a.condition, 'drizzle');
  assert.equal(a.wind, 'calm');
  assert.equal(a.humidity, 'pleasant');
  assert.ok(Math.abs(a.temperatureC - 14) <= 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/rival.test.js`

Expected: FAIL (`theatreRequestedWeather` is not a function).

- [ ] **Step 3: Implement**

In `src/lib/rival.js`:

```js
function theatreRequestedWeather({ cityId, localDate, actual }) {
  const seed = seedInt(`${cityId}|${localDate}`);
  const offset = (seed % 7) - 3;
  let temperatureC = actual.temperatureC + offset;
  if (temperatureC < -20) temperatureC = -20;
  if (temperatureC > 45) temperatureC = 45;
  return {
    condition: actual.condition,
    temperatureC,
    wind: actual.wind,
    humidity: actual.humidity
  };
}

module.exports = { roundCoord, rivalForSlot, theatreFiler, theatreRequestedWeather, seedInt };
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/rival.test.js`

Expected: PASS.

- [ ] **Step 5: Commit (only if the user asked)**

```bash
git add src/lib/rival.js tests/rival.test.js
git commit -m "feat: seed fake 27B requested weather within match tolerance"
```

---

### Task 5: Mixed board cards

**Files:**
- Modify: `src/lib/board.js`
- Modify: `tests/board.test.js`

**Interfaces:**
- Consumes: `hydrateOrder`, `theatreFiler`, `theatreRequestedWeather`, `roundCoord`, `seedInt`, `FEATURED_CITIES`, `formatWeatherLine`, `localDateString`
- Produces: `buildBoard({ db, weather, now }) => { cards: Card[], ticker: Card[] }`
  - `Card`: `{ place, name, reason, requestedWeather, actualWeather, condition, stamped: true }`
  - `ticker === cards`
  - No `kind` required on the card for the template

Helper to insert a board order in tests (UTC, morning of 2026-08-24, which is settled at 15:00 UTC that day):

```js
function insertOrder(db, visitorId, fields) {
  const result = db.prepare(`
    INSERT INTO orders (
      visitor_id, place_name, latitude, longitude, timezone, local_date,
      period, condition, temperature_c, wind, humidity, reason, cancelled_at, created_at
    ) VALUES (?, ?, ?, ?, 'UTC', ?, 'morning', ?, ?, 'calm', 'pleasant', ?, ?, ?)
  `).run(
    visitorId,
    fields.place,
    fields.latitude ?? 1,
    fields.longitude ?? 1,
    fields.localDate ?? '2026-08-24',
    fields.condition ?? 'sun',
    fields.temperatureC ?? 20,
    fields.reason ?? 'reason',
    fields.cancelledAt ?? null,
    fields.createdAt ?? '2026-08-02T00:00:00.000Z'
  );
  return result.lastInsertRowid;
}
```

- [ ] **Step 1: Replace `tests/board.test.js` with these tests**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { buildBoard } = require('../src/lib/board');

function seedVisitor(db) {
  db.prepare(
    'INSERT INTO visitors (token, display_name, created_at) VALUES (?, ?, ?)'
  ).run('board-visitor', 'Pat Pending', '2026-08-01T00:00:00.000Z');
  return db.prepare('SELECT * FROM visitors WHERE token = ?').get('board-visitor');
}

function insertOrder(db, visitorId, fields) {
  const result = db.prepare(`
    INSERT INTO orders (
      visitor_id, place_name, latitude, longitude, timezone, local_date,
      period, condition, temperature_c, wind, humidity, reason, cancelled_at, created_at
    ) VALUES (?, ?, ?, ?, 'UTC', ?, 'morning', ?, ?, 'calm', 'pleasant', ?, ?, ?)
  `).run(
    visitorId,
    fields.place,
    fields.latitude ?? 1,
    fields.longitude ?? 1,
    fields.localDate ?? '2026-08-24',
    fields.condition ?? 'sun',
    fields.temperatureC ?? 20,
    fields.reason ?? 'reason',
    fields.cancelledAt ?? null,
    fields.createdAt ?? '2026-08-02T00:00:00.000Z'
  );
  return result.lastInsertRowid;
}

const matchingWeather = {
  currentForCity: async () => ({ temperatureC: 14, condition: 'drizzle', wind: 'calm', humidity: 'pleasant' }),
  archiveSlice: async () => ({ temperatureC: 20, condition: 'sun', wind: 'calm', humidity: 'pleasant' }),
  forecastSlice: async () => ({ temperatureC: 20, condition: 'sun', wind: 'calm', humidity: 'pleasant' })
};

test('board pads with fake chits to at least six and is stable for a UTC date', async () => {
  const db = openDb(':memory:');
  const now = new Date('2026-08-24T15:00:00Z');
  const a = await buildBoard({ db, weather: matchingWeather, now });
  const b = await buildBoard({ db, weather: matchingWeather, now });
  assert.equal(a.cards.length, 6);
  assert.deepEqual(a.cards, b.cards);
  assert.equal(a.ticker, a.cards);
  for (const card of a.cards) {
    assert.equal(card.stamped, true);
    assert.match(card.requestedWeather, /drizzle/);
    assert.match(card.actualWeather, /drizzle, 14°C/);
    assert.equal(Object.hasOwn(card, 'kind'), false);
  }
  db.close();
});

test('qualifying real filings appear and extra fakes are not required past six', async () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  for (let index = 0; index < 7; index += 1) {
    insertOrder(db, visitor.id, { place: `Place ${index}`, latitude: index + 10, longitude: index + 10 });
  }
  const board = await buildBoard({
    db,
    weather: matchingWeather,
    now: new Date('2026-08-24T15:00:00Z')
  });
  assert.equal(board.cards.length, 7);
  assert.equal(board.cards.filter((card) => card.name === 'Pat Pending').length, 7);
  db.close();
});

test('queued aimed denied cancelled and other-day filings stay off the board', async () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  insertOrder(db, visitor.id, { place: 'Queued', localDate: '2026-12-25' });
  insertOrder(db, visitor.id, { place: 'Aimed', localDate: '2026-08-30' });
  insertOrder(db, visitor.id, {
    place: 'Denied',
    latitude: 20,
    longitude: 20,
    localDate: '2026-08-24',
    condition: 'rain',
    temperatureC: 8
  });
  insertOrder(db, visitor.id, { place: 'Cancelled', cancelledAt: '2026-08-02T00:00:00.000Z' });
  insertOrder(db, visitor.id, { place: 'Yesterday', localDate: '2026-08-23' });
  insertOrder(db, visitor.id, { place: 'Accepted Today' });
  const board = await buildBoard({
    db,
    weather: {
      ...matchingWeather,
      archiveSlice: async ({ latitude }) => {
        if (latitude === 20) {
          return { temperatureC: 8, condition: 'storm', wind: 'gale', humidity: 'muggy' };
        }
        return { temperatureC: 20, condition: 'sun', wind: 'calm', humidity: 'pleasant' };
      }
    },
    now: new Date('2026-08-24T15:00:00Z')
  });
  const names = board.cards.map((card) => card.place);
  assert.ok(names.includes('Accepted Today'));
  assert.ok(!names.includes('Queued'));
  assert.ok(!names.includes('Aimed'));
  assert.ok(!names.includes('Denied'));
  assert.ok(!names.includes('Cancelled'));
  assert.ok(!names.includes('Yesterday'));
  db.close();
});

test('accepted real at a featured city skips that fake', async () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  insertOrder(db, visitor.id, {
    place: 'London parish',
    latitude: 51.5074,
    longitude: -0.1278,
    condition: 'drizzle',
    temperatureC: 14
  });
  const board = await buildBoard({
    db,
    weather: {
      currentForCity: async () => ({ temperatureC: 14, condition: 'drizzle', wind: 'calm', humidity: 'pleasant' }),
      archiveSlice: async () => ({ temperatureC: 14, condition: 'drizzle', wind: 'calm', humidity: 'pleasant' }),
      forecastSlice: async () => null
    },
    now: new Date('2026-08-24T15:00:00Z')
  });
  const londons = board.cards.filter((card) => /London/i.test(card.place));
  assert.equal(londons.length, 1);
  assert.equal(londons[0].name, 'Pat Pending');
  assert.equal(board.cards.length, 6);
  db.close();
});

test('missing current weather omits that fake instead of an observatory chit', async () => {
  const db = openDb(':memory:');
  const board = await buildBoard({
    db,
    weather: { currentForCity: async () => null, archiveSlice: async () => null, forecastSlice: async () => null },
    now: new Date('2026-08-24T15:00:00Z')
  });
  assert.equal(board.cards.length, 0);
  db.close();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/board.test.js`

Expected: FAIL (`board.cards` undefined).

- [ ] **Step 3: Rewrite `src/lib/board.js`**

```js
const { FEATURED_CITIES } = require('../../config/weather');
const { theatreFiler, theatreRequestedWeather, roundCoord, seedInt } = require('./rival');
const { hydrateOrder } = require('./orders');
const { localDateString } = require('./time');
const { formatWeatherLine } = require('./time');

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
```

Deduplicate `formatWeatherLine` import (single require from `./time`).

Padding: take **all** reals, then only as many fakes as needed to reach six. If 7 reals, `needed` is 0. If 1 real and London occupied, fakes are the other cities; slice first 5.

If 0 reals and all cities have weather, 6 fakes.

- [ ] **Step 4: Run tests**

Run: `node --test tests/board.test.js tests/http-ledger.test.js tests/orders.test.js`

Expected: PASS. If the omit test’s aimed order (2026-08-30) is still “aimed” at 2026-08-24, archive is not called; forecast is. `matchingWeather.forecastSlice` returns a match but aimed filings must stay off the board (`verdict !== 'accepted'` until settled). Good.

Queued 2026-12-25 is queued (beyond 15 days) — no weather fetch. Good.

- [ ] **Step 5: Commit (only if the user asked)**

```bash
git add src/lib/board.js tests/board.test.js
git commit -m "feat: mix accepted filings with fake city 27Bs on the home board"
```

---

### Task 6: Home chit layout

**Files:**
- Modify: `views/home.ejs`
- Modify: `public/css/ministry.css`
- Modify: `tests/http-visitor.test.js`

**Interfaces:**
- Consumes: `board.cards` / `board.ticker` with `requestedWeather`, `actualWeather`, `condition`, `name`, `place`, `reason`, `stamped`
- Produces: home HTML with “Weather requested” and “Actual weather”; no “Current atmospheric chit”; no “Filed request”

- [ ] **Step 1: Write the failing HTTP assertions**

In `tests/http-visitor.test.js`, after the existing home assertions, add:

```js
assert.doesNotMatch(res.text, /Current atmospheric chit/);
assert.doesNotMatch(res.text, /Filed request/);
```

Add a new test:

```js
test('home board shows requested and actual weather on mixed chits', async () => {
  const db = openDb(':memory:');
  const app = createApp({
    db,
    now: () => new Date('2026-08-24T15:00:00Z'),
    weather: {
      currentForCity: async () => ({ temperatureC: 14, condition: 'drizzle', wind: 'calm', humidity: 'pleasant' }),
      archiveSlice: async () => null,
      forecastSlice: async () => null
    }
  });
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /Weather requested/);
  assert.match(res.text, /Actual weather/);
  assert.match(res.text, /drizzle, 14°C/);
  assert.doesNotMatch(res.text, /Current atmospheric chit/);
  assert.doesNotMatch(res.text, /Filed request/);
  db.close();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/http-visitor.test.js`

Expected: FAIL (old labels still present / no “Weather requested”).

- [ ] **Step 3: Update `views/home.ejs`**

Ticker loop stays on `board.ticker` (already uses `card.condition`).

Replace the notice grid loop with:

```ejs
    <div class="notice-grid">
      <% for (const card of board.cards) { %>
        <article class="notice-card notice-stamped">
          <h3><%= card.place %></h3>
          <dl class="notice-facts">
            <dt>Weather requested</dt>
            <dd><%= card.requestedWeather %></dd>
            <dt>Actual weather</dt>
            <dd><%= card.actualWeather %></dd>
          </dl>
          <p><%= card.reason %></p>
          <p class="notice-filer">Filed by <strong><%= card.name || 'an unnamed petitioner' %></strong></p>
        </article>
      <% } %>
    </div>
```

- [ ] **Step 4: CSS for `.notice-facts`**

In `public/css/ministry.css`, after `.notice-weather`:

```css
.notice-facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem 0.75rem;
  margin: 0 0 0.75rem;
  padding-block: 0.65rem;
  border-block: 1px dashed #9f7d50;
}

.notice-facts dt {
  margin: 0;
  color: #6b4423;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.notice-facts dd {
  margin: 0;
}
```

Keep `.notice-weather` for now or delete if unused.

- [ ] **Step 5: Run the full suite**

Run: `npm test`

Expected:  all tests PASS (count will be higher than 54).

- [ ] **Step 6: Commit (only if the user asked)**

```bash
git add views/home.ejs public/css/ministry.css tests/http-visitor.test.js
git commit -m "feat: render mixed 27B chits with requested and actual weather"
```

---

## Self-review

| Spec section | Task |
|--------------|------|
| 1 What appears | 6 |
| 2 Real filings | 5 (filter) + 3 (frozen actual) |
| 3 Fake city filings | 4 + 5 |
| 4 Mixing / shuffle / ticker | 5 |
| 5 Fifty names | 1 |
| 6 Freeze settlement | 2 + 3 |
| 7 Empty / skip observatory | 5 missing-weather test |
| 8 Tests listed | 1–6 |
| 9 Out of scope | denial sentence unchanged |
