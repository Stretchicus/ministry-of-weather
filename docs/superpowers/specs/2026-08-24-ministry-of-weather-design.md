# The Ministry of Weather — Design Spec

**Date:** 2026-08-24  
**Status:** Draft for user review  
**Working title:** The Ministry of Weather (rebrandable)

A parody website where visitors “order” weather. The joke is bureaucratic: the Ministry files the chit, reality does what it likes, and if the sky disagrees someone else had already booked it. The site is entertainment only. Neither the site, its operators, visitors, nor any AI can change the weather.

---

## 1. Product

### 1.1 What v1 is

A small Node site. Visitors give a display name (remembered on a cookie), file at most one new weather request per UTC day, and come back to see queued / aimed / settled results. The homepage is a steampunk–Monty Python weather machine plus a public board of theatre and real filings.

### 1.2 What v1 is not

- Real accounts, email, or passwords (planned for a later monetisation phase; visitor rows must stay easy to attach to a user).
- Paid weather APIs, ads, or checkout (leave empty “departmental notice” slots under the home board only).
- Historical bookings (past dates). Today is not bookable.
- Editing an order. Cancel and refile is the only correction.
- 3D / WebGL. The machine is a 2D illustration with CSS/SVG motion.

### 1.3 Brand

- Default name: **The Ministry of Weather**.
- Tagline: **Purveyors of unlikely skies**.
- All user-facing brand strings live in one config module (`config/brand.js`). Changing the name or domain later is a config edit, not a rewrite.
- Voice: official, incompetent, slightly annoyed clerks. Never cruel; never claim supernatural or scientific power over weather.

---

## 2. Architecture

Server-rendered Express app. SQLite via `better-sqlite3`. No SPA. Browser never calls Open-Meteo; the server does, and only when cache policy allows.

```
[Browser] → Express pages + forms
                ↓
         SQLite (visitors, orders, caches)
                ↓
         Open-Meteo (geocode / forecast / archive / current)
         only on cache miss
```

**Pages**

| Path | Purpose |
|------|---------|
| `GET /` | Home: disclaimer, machine, ticker, CTA, notice cards |
| `GET/POST /request` | Form 27B |
| `GET /ledger` | This visitor’s orders |
| `POST /orders/:id/cancel` | Cancel if allowed |

Static assets under `/public` (CSS, machine SVG layers, hero illustration).

Cookie `ministry_visitor`: random token, HttpOnly, SameSite=Lax, Max-Age 1 year, `Secure` when the site is served over HTTPS. Server loads or creates a `visitors` row from that token.

---

## 3. Visual system

### 3.1 Look

**Pamphlet + monster:** cream parchment page, brass and ink, red disclaimer bar, cartoon steampunk engine as the hero. Not a dark engine-room skin. Not a sterile government PDF.

### 3.2 Home layout (“steam then stamp”)

1. Sticky red disclaimer bar (every page).
2. Header: brand + nav (Home, File 27B, My ledger).
3. Illustrated weather machine (full width of the content column).
4. Ticker of recent chits, as if puffing from the pipe.
5. Primary button: **File Form 27B**.
6. Public notice cards (featured cities + recent real orders).
7. Optional empty departmental-notice slots (unused in v1; ads later). Never inside the machine. Never inside the disclaimer.

On mobile the same stack, one-column cards. The machine scales down. The ticker still crawls.

### 3.3 Machine

One high-quality illustration (AI-generated, then cropped) as the base. Overlay HTML/CSS/SVG:

- three cogs rotating continuously (slow, different speeds)
- a pipe emitting looping cloud/steam puffs
- a small pressure gauge needle ticking

No autoplay video. Respect `prefers-reduced-motion`: freeze cogs and steam; illustration still shows.

### 3.4 Site chrome

Serif headings, readable body, brass buttons, dashed ledger rules on cards. Shared CSS on all pages so the site feels like one Ministry, not three templates.

---

## 4. Filing rules

### 4.1 Who you are

First visit (or missing name): ask **Call me…** (display name, 2–40 characters, e.g. `Darren G`). Stored on the visitor row and reused. Submit is rejected without a name. Names and reasons are **public** on the ticker and notice board. The form states that clearly.

### 4.2 When

- Future only. Not today in the **location’s local calendar**.
- The chosen slot’s **start** must be at least **24 hours** after “now” (server time compared to that start, using the location timezone).
- Helper copy: the machine takes at least 24 hours to be aimed at a specific place.
- Any future date is allowed (birthdays, Christmas). Dates beyond the forecast window are **shown** as queued (status is derived, not stored).

**Periods** (location local time):

| Period | Hour band (inclusive start, exclusive end) | Slot start used for the 24h rule |
|--------|--------------------------------------------|----------------------------------|
| Morning | 06:00–12:00 | 06:00 local |
| Afternoon | 12:00–18:00 | 12:00 local |
| Evening | 18:00–24:00 | 18:00 local |

### 4.3 What they specify

- Place (free text → Open-Meteo geocoding; user picks from matches)
- Date
- Period (morning / afternoon / evening)
- Condition: sun, rain, snow, drizzle, fog, storm
- Temperature: integer °C, allowed range −20 to 45
- Wind: calm, breeze, gale
- Humidity: dry, pleasant, muggy
- Reason (short public text, required, max 140 characters)

### 4.4 Rate limit

One **active** (not cancelled) order **created** on this visitor’s current **UTC calendar date**.

Cancel **refunds** that day’s stamp: they may file a replacement before UTC midnight.

### 4.5 Cancel

Allowed only if the slot start is still ≥ 24 hours away **and** the order belongs to this visitor. No edits: cancel, then file a new form.

Cancel is a confirmation step with clerk copy. `cancel_count` on the visitor increments. Copy gets ruder on repeats (sigh → red ink → small petition). Always allowed when the time rule passes; never actually blocked or fined. After cancel: stamp returned, “do not make a habit of this.”

---

## 5. Order lifecycle

| Status | When | What the ledger shows |
|--------|------|------------------------|
| `queued` | `local_date` is after `location_today + 15 days` (Open-Meteo 16-day forecast includes today, so the last forecastable local date is today+15) | “Queued — machine not yet aimed.” No real weather. |
| `aimed` | `local_date` is on or before `location_today + 15 days` and the slot has not ended | Forecast slice vs requested knobs. Still pending the day. |
| `settled` | Slot end (period end local time) has passed | Comparison. Match or mismatch. |
| `cancelled` | Visitor withdrew in time | Struck through; not on the public board. |

Status is derived when the page loads (and when cache is refreshed), not a manual admin step.

A slot has **ended** when local now ≥ period end (morning ends 12:00, afternoon 18:00, evening 24:00 / next local midnight).

---

## 6. Weather, cache, and comparison

### 6.1 Provider

**Open-Meteo only** in v1 (no API key). Endpoints used:

- Geocoding (place search)
- Forecast (hourly), when the date is in window
- Archive (hourly), when the slot has ended
- Current weather for featured home-board cities

### 6.2 Cache (SQLite)

| Kind | Key | TTL |
|------|-----|-----|
| Geocode | search string, trimmed, lowercased, whitespace collapsed | 30 days |
| Forecast | rounded lat/lon (3 decimal places) + local date | 12 hours (refresh at most twice a day per cell) |
| Archive | rounded lat/lon + local date | **forever** after first successful fetch |
| Current | featured city id | 60 minutes |

**Do not** call forecast or archive for `queued` orders. **Do not** call archive until the slot has ended. After one successful archive fetch, never call again for that key.

Featured cities (config, swap without schema changes): London, New York, Tokyo, Cairo, Sydney, Reykjavík — each with fixed coordinates and timezone.

### 6.3 Representative slice

From hourly series in the period band, compute:

- Temperature: mean of hourly °C, rounded to nearest integer
- Wind: map mean wind speed to calm / breeze / gale (`< 12 km/h` calm, `12–40` breeze, `> 40` gale)
- Humidity: map mean relative humidity to dry / pleasant / muggy (`< 40%` dry, `40–70` pleasant, `> 70` muggy)
- Condition: dominant weather-code bucket in the band (map WMO codes onto sun / rain / snow / drizzle / fog / storm)

### 6.4 Match

A settled order **matches** if all four hold:

- Condition equal
- Temperature within **±3 °C**
- Wind category equal
- Humidity category equal

Otherwise **mismatch**.

### 6.5 Match copy vs rival

- **Match:** Ministry takes cautious credit. Example: “A satisfactory outcome. Coincidence remains a leading theory.”
- **Mismatch:** A **fictional rival** already held the chit for the *actual* weather. Seed string: `round(lat,3)|round(lon,3)|YYYY-MM-DD|period`. SHA-256 of that UTF-8 string; interpret the first 8 hex characters as an integer seed. Same inputs → same rival forever. Reason is chosen from that condition’s list (rain → marrow show, fog → hiding from relations, and so on). Pools in code: 24 invented names, 6 reasons per condition.

The same generator supplies fictional filers on featured-city theatre cards. Seed string: `cityId|YYYY-MM-DD` using **that city’s** local date, so the day’s story is stable and can change at local midnight.

Two real visitors may file the same place + date + period. There is no exclusivity. The sky still does what it does.

---

## 7. Public board

**Mix of theatre and real filings.**

- Theatre: 6 featured cities, real **current** weather (cached hourly), credited to a fictional filer for today.
- Real: the 8 newest non-cancelled orders, showing display name, place, requested condition, reason.
- Ticker: concatenation of those items, looping.

Form warning: display name and reason will appear in public.

---

## 8. Data model

SQLite file `data/ministry.sqlite` (gitignored). Schema created with `CREATE TABLE IF NOT EXISTS` on boot. Timestamps (`created_at`, `cancelled_at`, `fetched_at`) are ISO-8601 strings in UTC.

**visitors**

- `id` INTEGER PK
- `token` TEXT UNIQUE NOT NULL
- `display_name` TEXT NULL
- `cancel_count` INTEGER NOT NULL DEFAULT 0
- `created_at` TEXT NOT NULL

Daily stamp is **not** a column: count non-cancelled orders with `created_at` on the current UTC date.

**orders**

- `id` INTEGER PK
- `visitor_id` INTEGER NOT NULL FK
- `place_name` TEXT NOT NULL
- `country` TEXT
- `latitude` REAL NOT NULL
- `longitude` REAL NOT NULL
- `timezone` TEXT NOT NULL
- `local_date` TEXT NOT NULL (`YYYY-MM-DD`)
- `period` TEXT NOT NULL (`morning` \| `afternoon` \| `evening`)
- `condition` TEXT NOT NULL
- `temperature_c` INTEGER NOT NULL
- `wind` TEXT NOT NULL
- `humidity` TEXT NOT NULL
- `reason` TEXT NOT NULL
- `cancelled_at` TEXT NULL
- `created_at` TEXT NOT NULL

**weather_cache**

- `cache_key` TEXT PRIMARY KEY
- `kind` TEXT NOT NULL (`geocode` \| `forecast` \| `archive` \| `current`)
- `payload_json` TEXT NOT NULL
- `fetched_at` TEXT NOT NULL

No separate theatre table; featured cities live in config.

---

## 9. Errors and empty states

Always ministry voice. Never raw stack traces to the browser.

| Case | Behaviour |
|------|-----------|
| Place not found | “The clerks cannot locate that parish.” Show geocode alternatives when any exist. |
| Date too soon / today | “The machine takes at least 24 hours to be aimed.” |
| Active filing already today | Form disabled until UTC midnight, humorous come-back copy. Mention that cancel returns the stamp. |
| Cancel too late | “The engine is already en route.” |
| Open-Meteo failure | Filing still succeeds (request is stored). Aimed/settled weather may show “the observatory has misplaced its glasses” until a cache fill works. |
| New device / no cookie | Empty ledger; prompt to give a name. No history recovery. |
| Reduced motion | Static machine illustration. |

---

## 10. Legal and humour boundaries

Every page: entertainment-only disclaimer. Explicitly: this site, humans, and AI cannot change the weather.

Do not:

- Promise that a request will come true
- Charge for weather (v1 has no payments)
- Imply harm, targeting, or weather as a weapon
- Use real people’s names in the fictional pool (invented names only)

Footer repeats a short disclaimer. Form submit implies they understood the notice.

---

## 11. Testing

- Unit: 24h / not-today rules; UTC daily stamp and cancel refund; match bands; rival hash stability; WMO → condition mapping; wind/humidity bucketing.
- Cache: no forecast fetch when queued; archive once then frozen.
- HTTP: file, reject too-soon, cancel, ledger isolation per cookie; use a temp SQLite file.
- Manual: home, form, ledger on a phone-width and a desktop-width viewport.

---

## 12. Future (out of scope for this spec’s implementation)

- Email/password accounts attached to `visitors`
- Adverts in departmental-notice slots
- Domain / name change via `config/brand.js`
- Optional paid weather extras (maps, alerts) — not required while Open-Meteo covers v1

---

## 13. Implementation notes

- Node 20+, Express 4, better-sqlite3, EJS for HTML.
- `npm start` serves the site locally (default port 3000). Not dependent on Apache/XAMPP.
- `.superpowers/` (visual brainstorm artefacts) is gitignored.
- Brand, featured cities, condition lists, rival name/reason pools, and match tolerances are config/code constants — not magic numbers scattered in templates.
