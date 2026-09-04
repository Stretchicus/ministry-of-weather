# Public board chits — Design Spec

**Date:** 2026-09-04  
**Status:** Draft for user review  
**Amends:** `docs/superpowers/specs/2026-08-24-ministry-of-weather-design.md` section 7 (Public board), the fictional name pool in section 6.5, and settlement on the ledger (actual weather and denied rival must be frozen).

The homepage board is a single mixed grid of stamped Form 27B chits. Fake city filings and real accepted filings use the same card. Clerks do not label which is which.

---

## 1. What appears

One list of notice cards. No “Current atmospheric chit” / “Filed request” split. No `kind` shown in the UI.

Every card has:

- Place as the heading
- **Weather requested** — `condition, °C, wind, humidity` (same `formatWeatherLine` as the ledger)
- **Actual weather** — the same shape of line
- The public reason
- **Filed by** the display name

Every card is stamped. The ticker is this same list, in the same order: name, place, requested condition, reason.

Real petitioners keep the name they typed. Fictional names come from the pool in section 5.

---

## 2. Real filings

A real order appears only when all of these are true:

- Not cancelled
- That place’s local calendar date is the order’s `local_date` (“the day it was requested for”)
- The slot has ended (`deriveStatus` is `settled`)
- The archived slice matches the request (`isMatch`: same condition, wind, and humidity; temperature within ±3°C)

Requested weather is the visitor’s knobs. Actual weather is the **frozen** archived morning/afternoon/evening slice (section 6).

Queued, aimed, denied, withdrawn, observatory, and wrong-day filings never appear. There is no “eight newest” cap: every qualifying real filing is on the board.

---

## 3. Fake city filings

The six featured cities remain the padding source. Each fake is a successful 27B for **live current weather** (cached hourly):

- Actual weather is `currentForCity`
- Weather requested is that reading with a seeded nudge: same condition, wind, and humidity; temperature shifted by −3 to +3°C, then clamped to −20..45. The nudge is stable for `cityId|YYYY-MM-DD` (that city’s local date)
- Name and reason come from `theatreFiler` (same city-day seed, reason pool for the **actual** condition)

Skip a fake when:

- Current weather is missing, or
- An accepted real card is already at those coordinates (lat/lon rounded to 3 decimals, same as the rival seed)

Observatory copy stays on the personal ledger. It does not appear on this board.

---

## 4. Mixing the grid

1. Collect every qualifying real card.
2. Add fake city cards until there are **at least six** cards. If there are ten accepted filings today, the board has ten cards and no padding.
3. Shuffle with a seed from **today’s UTC date** (`YYYY-MM-DD`). A refresh does not reshuffle; the mix changes at UTC midnight.

`buildBoard` returns `{ cards, ticker }` where `ticker` is `cards`. Home renders only `board.cards`. Internal real/fake bookkeeping may exist in tests, but the template must not distinguish them.

---

## 5. Fictional names

The invented pool grows from 24 to **50**. About half first-name only, about half first name plus a surname initial, **no full stop**. Fifty distinct people (no `Horatio` plus `Horatio X`). None are real public figures. The same pool feeds fake board chits and denied-ledger rivals.

**First name only (25):**  
Horatio, Agnes, Mildred, Nigel, Barnaby, Winifred, Prudence, Cedric, Hortense, Oswald, Beatrice, Thaddeus, Constance, Algernon, Muriel, Rupert, Sybil, Gertrude, Percival, Dorothea, Reginald, Lesley, Rowan, Jules, Morgan

**First name and initial (25):**  
Jon H, Sam K, Pat L, Alex M, Robin D, Chris R, Kim W, Ellis B, Frankie C, Jamie F, Casey Q, Drew U, Quinn A, Clive U, Ethel A, Penelope Z, Ivor N, Mabel J, Basil F, Enid P, Cyril W, Nora G, Hector S, Ida V, Walter Q

`pick(seed, names)` is unchanged; it uses whatever length the array has.

---

## 6. Freeze settlement on the ledger

Seeded rivals and the archive cache are *meant* to be stable, but the ledger must not depend on that. The first time a filing is settled **and** an archive slice is available, write the outcome onto the order row and never compute it again.

Columns on `orders` (nullable until frozen):

- `outcome` — `accepted` or `denied`
- `actual_condition`, `actual_temperature_c`, `actual_wind`, `actual_humidity`
- `rival_name`, `rival_reason` — set only when denied; otherwise null
- `settled_recorded_at` — UTC ISO timestamp of the freeze

On that first pass:

- Compare requested knobs to the archive slice with `isMatch`
- Save the actual slice
- If denied, pick the rival once (`rivalForSlot`) and save **that** name and humorous reason
- The denial sentence on the ledger is still `deniedReason(rival_name)` from the saved name

Later loads (ledger, home board, ticker) read the snapshot. No second archive fetch, no second seed. If the first settled load has no archive yet (observatory), leave the columns null and try again next time.

Existing orders without a snapshot freeze the same way on their next settled load.

Accepted filings freeze actual weather too, so a later archive tweak cannot change a stamped “yes”.

---

## 7. Errors and empty states

- A featured city with no current weather is omitted, not shown as a blank or observatory chit.
- A real filing whose archive slice is missing is not “correct”; it stays off the board.
- If every city fetch fails and no real filings qualify, the board (and ticker) may be empty. Do not invent weather.

---

## 8. Tests

Lock at least:

- Padding to six when fewer than six reals qualify
- More than six cards when more than six reals qualify (no truncation)
- Featured city omitted when an accepted real sits on those rounded coordinates
- Queued, aimed, denied, cancelled, and other-day filings omitted
- Shuffle stable for a given UTC date; different UTC dates may differ
- Each fake request shares condition/wind/humidity with actual and differs in temperature by at most 3°C
- Home HTML has no “Current atmospheric chit” / “Filed request” labels
- Name pool length 50; exactly 25 strings contain a space (initial form)
- First settled mismatch writes rival name, rival reason, and actual weather; a second hydrate with a different archive/seed still returns the saved values
- First settled match writes actual weather and a null rival; later loads do not call archive again
- Observatory on first settled load leaves the snapshot empty and retries

---

## 9. Out of scope

- Changing the denial sentence wording (`deniedReason`)
- Form 27B filing rules
- Stamp artwork
- Changing featured cities
