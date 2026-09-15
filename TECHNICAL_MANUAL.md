# RPN Scientific Calculator — Technical Manual

## Overview

A dependency-free, single-page Progressive Web App implementing a stack-based (RPN) scientific calculator. No build step, no framework, no bundler — static files served as-is.

## File structure

```
index.html      UI markup
styles.css      Styling
app.js          RPN stack engine + UI wiring + service worker registration
manifest.json   PWA manifest (icons, name, display mode)
sw.js           Service worker — offline caching
icon-192.png    App icon, 192×192
icon-512.png    App icon, 512×512
netlify.toml    Netlify headers config
```

## Architecture

`app.js` is split into two parts:

1. **`RPN` module** (IIFE) — pure calculator logic, no DOM access. Holds all state and exposes an API. Exported via `module.exports` when run under Node, so it can be unit-tested headlessly (no browser/jsdom required).
2. **UI wiring** (`if (typeof window !== "undefined")` block) — reads from `RPN`, renders the DOM, and attaches event listeners. This split keeps the calculator's math independent of any rendering concerns.

### State

```js
let stack = [];       // array of numbers; index 0 is bottom, last index is top (X)
let entry = "";        // string currently being typed; "" = nothing pending
let angleMode = "deg"; // "deg" | "rad", affects sin/cos/tan and their inverses
```

`entry` is a string (not a number) so partial input like `"3."` or `"-"` can be displayed and edited without premature parsing.

### Register model

Classic RPN calculators expose X (working register), Y, Z, T. Here, X is either:
- the live `entry` string being typed, or
- `stack[stack.length - 1]` if nothing is being typed.

Y/Z/T map to the next items down the stack. The UI's `render()` function in the browser block computes which stack slice to label as Y/Z/T based on whether `entry` is pending — see the `above` / `visible` logic in `app.js`.

### Core operations

| Function | Behavior |
|---|---|
| `inputDigit(d)` | Appends a digit to `entry` (replaces a lone leading `"0"`) |
| `inputDecimal()` | Adds `.` to `entry` if not already present |
| `enter()` | Pushes `entry` onto `stack` via `pushPendingIfAny()` and clears it; if `entry` is empty, duplicates the top of `stack` (matches physical RPN calculator behavior) |
| `backspace()` | Removes the last character of `entry`; if `entry` is empty, pops the stack and reloads it into `entry` minus its last digit (allows editing an already-pushed value) |
| `toggleSign()` | Negates `entry` if pending, otherwise negates the top of `stack` |
| `binaryOp(op)` | Auto-pushes any pending `entry` first, then pops **y** (top) then **x** (next), computes `x op y`, pushes the result. This ordering is what makes non-commutative operations (subtraction, division, power) behave correctly: the first number typed is always the left-hand operand. |
| `unaryFn(name)` | Auto-pushes pending `entry`, pops one value, applies the function, pushes result |
| `pushConst(name)` | Pushes `Math.PI` or `Math.E` directly |
| `drop()` / `swap()` | Stack manipulation without arithmetic |
| `percent()` | HP-12C/11C style percent, not a symmetric binary op — see below |

`percent()` is intentionally *not* implemented via `binaryOp()`. A normal binary op pops both operands and pushes one result. Percent instead reads `x = stack[len-1]` (the percentage) and `y = stack[len-2]` (the base), computes `y * (x/100)`, and writes that back into the top slot only — `y` is left in place, one level down. That's what lets `200 Enter 15 % +` chain into `230` without re-entering `200`: after `%`, the stack holds `[200, 30]`, so `+` immediately combines them.

### Number formatting

`formatNumber()`:
- Returns `"Error"` for `NaN` (e.g., division by zero, `asin` out of domain)
- Returns `"Infinity"` / `"-Infinity"` for non-finite results
- Integers under `1e15` render without decimals
- Other values are trimmed to 10 significant digits, with trailing zeros stripped
- Magnitudes ≥ `1e15` or non-zero values < `1e-9` fall back to exponential notation

### Angle mode

`toRad()` / `fromRad()` convert based on `angleMode` before/after calling `Math.sin/cos/tan/asin/acos/atan`. Only affects trig functions; everything else is unit-agnostic.

### Unit conversions

`CONVERSIONS` is a plain object keyed by category (`length`, `weight`, `volume`), each holding an array of conversion pairs: `{ id, fwdLabel, revLabel, factor }`. `factor` always converts the forward direction (unit1 → unit2) by multiplication; the reverse direction divides by the same factor, so each pair only needs one number:

```js
length: [
  { id: "in_cm", fwdLabel: "in→cm", revLabel: "cm→in", factor: 2.54 },
  { id: "ft_m", fwdLabel: "ft→m", revLabel: "m→ft", factor: 0.3048 },
  { id: "mi_km", fwdLabel: "mi→km", revLabel: "km→mi", factor: 1.609344 },
],
```

`convert(category, id, direction)` follows the exact same shape as `unaryFn()`: auto-push any pending entry via `pushPendingIfAny()`, pop one value, transform it, push the result, log it to the tape. The only difference is which lookup table supplies the transform and label. `direction` is `"fwd"` (multiply by `factor`) or `"rev"` (divide by `factor`); an unrecognized category or id is a safe no-op rather than a crash — it simply returns without touching the stack.

Two read-only accessors expose the table to the UI without letting it reach into `CONVERSIONS` directly:
- `getConversionCategories()` → `[{ id, label }]` for the category pills (`CATEGORY_LABELS` supplies the display name)
- `getConversions(category)` → `[{ id, fwdLabel, revLabel }]` for that category's button grid (factor is intentionally omitted — the UI only ever needs the id and labels to build buttons and dispatch clicks)

Adding a new conversion pair or an entirely new category is a data-only change: extend `CONVERSIONS` (and `CATEGORY_LABELS` for a new category) and the UI picks it up automatically, since `renderConvertCategories()`/`renderConvertGrid()` build their buttons from `getConversionCategories()`/`getConversions()` rather than any hardcoded list.

### Live currency rates

Currency is a `CONVERSIONS` category like the others (`usd_eur`, `usd_gbp`, `eur_gbp`, `usd_all`, `eur_all`, `usd_lkr`), but its `factor` values are overwritten at runtime instead of staying fixed. `setCurrencyFactors()` patches the matching pairs' `factor` in place given a bag of `usdToX` rates.

Two data sources are fetched in parallel by `fetchCurrencyRates()`: Frankfurter (ECB reference rates) supplies EUR/GBP, and open.er-api.com supplies ALL and LKR, since neither is an ECB reference-rate currency. The two calls are independent - if the exotic-currency call fails, EUR/GBP still update normally, and vice versa. Successful rates are cached in `localStorage` (`rpn-currency-rates`) with a timestamp, restored on load via `loadCachedCurrency()`, and shown as an age indicator (`renderCurrencyStatus()`) that flags itself past 24 hours old or on a fetch error. The refresh is always a manual tap (the "⟳ Refresh" button) - there's no background polling.

### Financial (TVM) engine

A second, independent module - `FIN`, defined right after `RPN`'s closing IIFE - implements the classic 5-register time-value-of-money solver (N, I/YR, PV, PMT, FV) used by HP-12C/10bII-style financial calculators, plus an amortization-schedule generator built on top of it. It's independent of `RPN` on purpose: the TVM registers are their own store (`regs`, `pYr`, `begin`), not stack values, so nothing here touches `stack` or `entry` directly - the UI layer is what bridges the two (see "Finance panel" below).

**The core relationship.** All five registers satisfy one equation per period:

```
PV·(1+i)ⁿ + PMT·(1+i·S)·[(1+i)ⁿ−1]/i + FV = 0
```

where `i` is the periodic rate (`I/YR / 100 / P/YR`) and `S` is `1` in Begin mode (annuity due - payment at the start of the period) or `0` in End mode (ordinary annuity - the normal case for a mortgage). `tvmResidual()` evaluates the left-hand side for a candidate `i`; the closed-form solvers for N, PV, PMT, and FV are each that equation rearranged algebraically, with an `i ≈ 0` branch (`Math.abs(i) < 1e-12`) to sidestep division by zero, since the formula degenerates to `PV + PMT·n + FV = 0` at a zero rate.

**Solving for I/YR is the one register with no closed form.** `solveIPeriodic()` brackets a root and bisects: the upper bound is sized dynamically from N (`10 ** (250 / n) - 1`, capped at 10) so that `(1+i)ⁿ` never overflows a double and silently produces `NaN` - a fixed bound like `10` (1000%/period) works for a 1-year loan but overflows for a 30-year monthly one (`n = 360`). 200 bisection iterations comfortably exceed the precision a calculator display needs; if the residual doesn't change sign across the bracket, `solve('iYr')` reports "no solution" rather than returning garbage.

**`solve(target)`** is the single entry point the UI calls: it checks the other four registers are set (a register holding `0` counts as set; only `null`/`undefined` counts as missing), runs the matching solver, stores the result back into `regs`, and returns `{ value }` or `{ error }`. Sign convention is left to the user, same as a real financial calculator - PV positive/PMT negative for a loan you receive and pay down, or PMT negative/FV positive for a savings goal, etc.

**`generateAmortRows({ summarize })`** is a separate, friendlier function that does *not* use `solve()`'s sign convention - it works off `Math.abs(PV)` and `Math.abs(PMT)` so a schedule prints as plain positive dollars regardless of which sign convention was used to solve for PMT. It walks period-by-period (`interest = balance × i; principal = payment − interest; balance −= principal` for End mode; the Begin-mode variant applies the payment before that period's interest instead), and forces the *last* row to land exactly on the FV target (`principal = balance − fvTarget`) rather than letting floating-point drift leave a fraction of a cent unaccounted for - the same trick real amortization tables use. `summarize: "year"` sums every `P/YR` rows into one, so a 30-year monthly mortgage collapses to 30 rows instead of 360. `N` is capped at `MAX_AMORT_PERIODS` (1200 - 100 years monthly) as a safety limit against an accidental typo generating an enormous schedule.

### Tape / history

`history` is an array of `{ label, value }` entries (numbers pushed, operation results) or `{ marker: true, text }` entries (currently just the `"C"` marker `clearAll()` writes). Two things log to it:

- **`pushPendingIfAny()`** — the shared helper called by `binaryOp`, `unaryFn`, `pushConst`, `percent`, `convert`, `drop`, and `swap` before they touch the stack — logs the pushed value with an empty label whenever it actually pushes something. This is what makes the tape show a number even when the user never explicitly pressed Enter (e.g., typing `4` then `+` directly).
- Each operation function (`binaryOp`, `unaryFn`, `pushConst`, `percent`, `convert`) additionally calls `logEntry()` itself once it has a result, using a small lookup (`OP_SYMBOLS`, `UNARY_SYMBOLS`, or the matched conversion pair's `fwdLabel`/`revLabel`) to turn the internal op/function/conversion name into the same symbol shown on its button (e.g. `sub` → `−`, `sqrt` → `√x`, `in_cm`/`fwd` → `in→cm`).

`clearAll()` calls `logMarker("C")` but does **not** clear `history` — the tape is meant to behave like a physical adding-machine tape that keeps printing across register clears. Clearing the visible tape is a separate, explicit action: `clearTape()` empties `history` outright and is only ever called from the UI's "Clear tape" button, never internally.

`getHistory()` returns a shallow copy of the array for rendering/export; callers can't mutate internal state through it.

Two additional shapes support the amortization generator: `{ amortText: true, text, style }` for the optional label/summary lines above a schedule (`style: "title"` renders bold, `"summary"` renders normal weight), and `{ amortRow: true, cols, isHeader }` for the five-column Payment/Interest/Principal/Balance rows themselves, including the column-title row (`isHeader: true`). These are appended via `RPN.logAmortText()`/`RPN.logAmortRow()` rather than `logEntry()`, and get their own rendering/export handling (see "Tape rendering and export" below) since a five-column row doesn't fit the plain `{ label, value }` shape.

## UI layer

- Buttons are plain `<button>` elements with `data-action` (and secondary `data-digit` / `data-op` / `data-fn` / `data-const`) attributes. A single delegated `click` listener on `.keys` dispatches to `handleAction()`, which calls the matching `RPN` method then re-renders.
- Keyboard input is handled by a `keydown` listener mapping standard keys (digits, `.`, Enter/Space, Backspace, Esc, Delete, `+ - * / ^ %`) to the same `RPN` calls.
- `render()` is the only function that touches the DOM for calculator state — it's called after every action, keeping state and view in sync without a framework. It also calls `renderTape()` at the end of every render pass.

### Viewport height and scrolling

`html, body` use `min-height: 100%` (not `height: 100%`). This matters more than it looks: `body` also centers its content with `display: flex; align-items: center`. If `html`/`body` were pinned to an explicit `height: 100%` and the calculator's content (keypad + expanded tray) was taller than the viewport — easy to hit on a phone, especially with the tray open — the page had no room to grow, so the overflow was clipped symmetrically off both the top and bottom with no way to scroll to it, since as far as the browser was concerned the page *was* exactly 100% tall already. Switching to `min-height` lets `body` grow past the viewport when its content needs more room, which restores normal page scrolling as a fallback — centering still applies when content fits, and simply has no visible effect (there's no extra space to center within) once content is taller than the screen. `body`'s own `min-height` is declared twice, `100vh` then `100dvh`; browsers that don't understand `dvh` just keep the `vh` value, and ones that do get the more accurate dynamic-viewport figure.

### Tape rendering and export

`renderTape()` rebuilds the `#tape` element from `RPN.getHistory()` on every render: each `{ label, value }` entry becomes a `.tape-row` (label left, value right), each `{ marker }` entry becomes a centered `.tape-marker` line, each `{ amortText }` entry becomes a left-aligned `.tape-amort-text` line (bold if `style: "title"`), and each `{ amortRow }` entry becomes a five-column `.tape-amort-row` grid (dimmed/bold for the `isHeader` column-title row) - a purpose-built layout distinct from the plain two-column rows, since a payment/interest/principal/balance row doesn't fit a single label+value pair. The panel auto-scrolls to the bottom afterward.

`exportTape()` (wired to the "Export .txt" button) mirrors that same branching in plain text: `${label.padEnd(6)}${value.padStart(12)}` per line for ordinary entries, `--- text ---` for markers, the raw text for `amortText` lines, and each `amortRow`'s columns right-padded to a fixed width for `amortRow` lines, so an exported amortization schedule still lines up as a readable table. It joins everything into one string and triggers a download via a `Blob` + temporary `<a download>` element (no server round-trip). The filename is timestamped (`rpn-tape-YYYYMMDD-HHMMSS.txt`) so repeated exports don't overwrite each other. The "Clear tape" button just calls `RPN.clearTape()` followed by `renderTape()`.

### Tape/Convert/Finance tab switcher

The tape panel, the conversion grid, and the finance panel occupy the same footprint in the layout rather than each getting their own space, so switching tabs doesn't resize the window. `switchTab(tab)` toggles a `.hidden` class (`display: none`) on four elements: `#tape`, `#tapeActions` (the Export/Clear buttons), `#convertPanel`, and `#financePanel`, showing exactly one pairing at a time — `#tape` + `#tapeActions` for the Tape tab, `#convertPanel` alone for Convert, `#financePanel` alone for Finance — while also updating which `.tab-btn` carries the `.active` class. Switching to Finance also calls `renderFinRegisters()`, since the register values can change without going through the main `render()` loop (a Store doesn't touch the calculator stack).

`renderConvertCategories()` and `renderConvertGrid()` build their buttons from `RPN.getConversionCategories()` / `RPN.getConversions(activeCategory)` rather than any hardcoded markup, so they only need to run once at startup and again whenever `activeCategory` changes (a category pill is clicked) — unlike `renderTape()`, they're not part of the main `render()` loop, since the conversion grid's *contents* never depend on calculator state, only on which category is selected. Clicking a conversion button calls `RPN.convert(category, id, direction)` (reading the three values off the button's `data-*` attributes) and then the normal `render()`, so the result shows up in both the entry line and, once you flip back to the Tape tab, the log.

### Finance panel

`FIN_REGS` (`[{ id: "n", label: "N" }, ...]`) drives `renderFinRegisters()` the same way `getConversionCategories()`/`getConversions()` drive the Convert grid: the five TVM rows (plus a sixth, non-solvable P/YR row) are built from that table rather than hardcoded markup, each with a formatted value (`formatMoney`, `formatPercent`, or `formatN` depending on the register) and a Store/Solve button pair carrying `data-reg`.

A single delegated click listener on `#financePanel` handles both button classes:

- **`.fin-store`** reads the calculator's current **x** value via `RPN.peekX()` (which commits any pending typed entry but, unlike most `RPN` calls, does *not* pop the stack - storing into a register is meant to leave the display alone) and writes it into that register with `FIN.setReg()`.
- **`.fin-solve`** calls `FIN.solve(reg)` and, on success, calls `RPN.setX()` to both store the answer in the register and replace the calculator's **x** with it - the same "feed the result back into the main display" pattern `convert()` uses.

Both paths call `renderFinRegisters()` to refresh the panel and `showFinStatus()` to post a one-line confirmation or error into `#finStatus` (e.g. "Need N, I/YR, PV, FV set first" when a Solve is attempted without enough registers). `RPN.logNote()`/`RPN.setX()`'s built-in `logEntry()` call mean every Store and Solve also leaves a normal tape entry, so a finance session is reconstructable from the tape like any other sequence of operations.

`runAmortize(summarize)` calls `FIN.generateAmortRows()`, builds the header/summary text from the current registers and settings (including the optional `#finLabel` text input as a title line), and writes the whole schedule to the tape via `RPN.logAmortText()`/`RPN.logAmortRow()` before switching back to the Tape tab to show it.

### Collapsible tray

`index.html` wraps `#tape` and `#convertPanel` together in a single `#trayBody` element, separate from the tab/action buttons in `.tape-header`. `setTrayCollapsed(collapsed)` toggles a `.collapsed` class on `#tapePanel` (`.tape-panel.collapsed .tray-body { display: none; }` in `styles.css`), swaps the toggle button's glyph between `▾`/`▸`, and persists the choice to `localStorage` under `rpn-tray-collapsed`. Wrapping tape and convert together, rather than collapsing each tab separately, means the fold state is independent of which tab is selected — you can collapse the tray while on either tab and it stays collapsed when you switch.

`initTray()` runs once at startup: if `localStorage` has a saved value, it wins; otherwise the starting state is decided by `window.matchMedia("(max-height: 950px)").matches` — short viewports (roughly phone-in-portrait or tablet-in-landscape territory) start collapsed, taller ones start expanded. `localStorage` access is wrapped in `try/catch` in both directions since it can throw in private-browsing contexts; a failure there just means the preference doesn't persist, not a crash.

### Theming

All colors are CSS custom properties declared on `:root` in `styles.css` — `--bg`, `--bg-glow` (the radial-gradient highlight behind the header), `--panel`, `--display-bg`, `--accent`/`--on-accent`, `--accent-2`/`--on-accent-2`, `--entry-accent`, `--text`, `--key-text`, `--text-dim`, `--key-bg`/`--key-bg-hover`, `--num-bg`, `--sci-bg`/`--sci-text`, `--fn-bg`, and `--danger`. Every color-related rule in the file reads one of these variables instead of a literal hex value, so a "theme" is just a block that redeclares the same variable names with different values — no other CSS had to change to support theming.

Three theme blocks — `[data-theme="light"]` (labeled "Blue" in the UI), `[data-theme="crimson-dark"]` (labeled "Crimson"), `[data-theme="amber"]` — sit right after `:root` and override the variables whenever that attribute is present on `<html>`. The default ("Classic") theme is simply the bare `:root` values with no `data-theme` attribute at all, so existing saved state with nothing set still renders exactly as before the feature was added. Note the `data-theme` attribute values (`light`, `crimson-dark`) no longer match their current on-screen labels ("Blue", "Crimson") — they're leftover internal ids from when Blue was a light theme and Crimson had a separate light and dark variant; renaming the ids would mean a one-time migration for anyone with an old value already saved in `localStorage`, which isn't worth it for an internal identifier nobody but the code ever sees.

`app.js` defines a `THEMES` array of `{ id, label }` pairs and a `setTheme(id)` function that sets or removes `document.documentElement.dataset.theme`, updates the toggle button's label, and persists the choice to `localStorage` under `rpn-theme` — the same pattern (including the `try/catch` around `localStorage`) used for the tray's collapsed state. `initTheme()` runs once at startup and applies the saved theme, defaulting to `"classic"` if nothing is stored. Clicking the **Theme** button (`#themeToggle`, next to the DEG/RAD pill) advances to the next entry in `THEMES`, wrapping from Amber back to Classic.

**Why `--key-text` and `--entry-accent` are separate from `--text` and `--accent-2`:** Classic and Amber keep the key faces (`--key-bg`) the same brightness family as the panel/body (dark theme = dark everything), so `.key`/`.pill` can safely reuse `--text` for their label color and `.entry-label` can reuse `--accent-2`. Blue and Crimson break that assumption on purpose — each is a dark, saturated body color (navy / maroon) with *white* keys — so a single dark-vs-light `--text` value can't serve both the panel labels and the key labels, and a single `--accent-2` (used as the Enter key's dark background) can't also work as light-on-dark label text for the "x:" prefix on the display. `--key-text` decouples key/pill label color from general panel text; `--entry-accent` decouples the "x:" label's color from the Enter key's background color. For Classic and Amber, both new variables are just set equal to their `--text`/`--accent-2` counterparts, so nothing about them changed visually.

One deliberate exception: `.tape`'s paper background and ink colors are hardcoded rather than wired to theme variables, so the paper tape always looks the same regardless of the active theme — matching how real adding-machine paper doesn't change color with the machine's case.

**Adding a new theme** is a data-only change: add another `[data-theme="..."]` block redeclaring the full variable set with new values, then add its `{ id, label }` to the `THEMES` array in `app.js`. No other wiring is needed — the toggle button and persistence logic already iterate over that array.

### Key grid order

The `.keys` grid in `index.html` is a 4-column CSS grid with no explicit `grid-row`/`grid-column` placement (aside from `.key.enter`, which spans 2 columns) — button order in the markup is button order on screen. The layout mirrors an HP-41-style keypad:

1. Utility row: Drop, x⇄y, CE, AC
2. Trig/reciprocal: sin, cos, tan, 1/x
3. Logs/roots: ln, log, √x, x²
4. Constants/exponents: π, e, eˣ, yˣ
5. **Enter** (2-col span), **±**, **⌫** — the entry-control row, positioned directly under the scientific rows rather than at the bottom
6. Four numeric rows, each with the operator in the *leftmost* column and digits filling the rest: `− 7 8 9`, `+ 4 5 6`, `× 1 2 3`, `÷ 0 . %`

Because placement is purely DOM order plus a plain grid flow, reordering keys is a matter of moving `<button>` elements in `index.html` — no CSS grid-line math required, except for the `.key.enter { grid-column: span 2; }` rule.

## PWA implementation

### Manifest (`manifest.json`)

Standard Web App Manifest: `standalone` display mode, portrait orientation, two icon sizes (192/512, marked `any maskable` so Android can safely crop them into adaptive icon shapes), and matching `background_color`/`theme_color` for a consistent splash/status-bar appearance.

### Service worker (`sw.js`)

Strategy: **cache-first with background refresh (stale-while-revalidate-ish)**.

- `install` — pre-caches the core asset list (`ASSETS`) into `rpn-calc-v1`, then `skipWaiting()` so the new worker activates immediately rather than waiting for all tabs to close.
- `activate` — deletes any cache whose name doesn't match the current `CACHE_NAME`, then `clients.claim()` so it starts controlling open tabs right away.
- `fetch` — for GET requests, returns the cached response immediately if present, while simultaneously fetching from the network in the background and updating the cache for next time. If there's no cache entry, it waits on the network fetch. If the network fails and nothing is cached, the request fails (expected for a fully offline-first app with no cached entry yet).

**Cache busting:** bump `CACHE_NAME` (e.g., `rpn-calc-v2`) any time `ASSETS` content changes, so `activate` clears the stale cache.

### Install prompt

`app.js` listens for `beforeinstallprompt`, stashes the event, and reveals an in-header **Install** button that calls `.prompt()` on click — this is why the button is hidden by default (`.hidden` class) and only shown once the browser signals installability. iOS Safari doesn't fire this event, so the user manual documents the manual "Add to Home Screen" path for iOS separately.

## Deployment (Netlify)

`netlify.toml`:
```toml
[build]
  publish = "."
```
No build command — these are static files served as-is.

Header rules:
- `sw.js` and `manifest.json` → `Cache-Control: no-cache`, so browsers always revalidate and pick up service-worker updates promptly instead of serving a stale worker from cache.
- `*.png` → long-lived immutable caching, since icon filenames don't change.

Any static host works (Vercel, GitHub Pages, S3+CloudFront, etc.) — Netlify is not a hard dependency, just what `netlify.toml` targets specifically.

## Testing

The `RPN` module's Node-exportability means it can be tested without a browser or DOM shim:

```js
const { RPN, FIN } = require('./app.js');
RPN.clearAll();
RPN.inputDigit('3'); RPN.enter();
RPN.inputDigit('4'); RPN.binaryOp('add');
console.log(RPN.getStack()); // [7]

FIN.setReg('n', 360); FIN.setReg('iYr', 6.5);
FIN.setReg('pv', 300000); FIN.setReg('fv', 0);
console.log(FIN.solve('pmt').value); // ~ -1896.20
```

A test pass covering basic arithmetic, non-commutative operand order, trig with angle mode, implicit-push behavior (functions/operators auto-push a pending `entry`), swap/drop, divide-by-zero error formatting, bare-Enter duplication, and backspace editing was run against this module during development — all cases passed.

## Extending it

- **New functions:** add a `case` to `unaryFn()` or `binaryOp()` in the `RPN` module, then add a corresponding button in `index.html` with the matching `data-fn`/`data-op` value. No other wiring needed — the delegated click handler and keyboard map already route by `dataset`.
- **Memory registers (M+, MR, MC):** would need a new `memory` variable in the `RPN` module plus three new methods, following the same pattern as the existing stack operations.
- **Undo:** the tape (`history`) is an append-only log for display/export, not a snapshot stack, so it can't drive undo as-is. True undo would need a separate stack of `stack`/`entry` snapshots taken before each mutating call.
- **CSV/XLSX export:** `exportTape()` already isolates all the formatting logic in one function — swapping the plain-text `join("\n")` for comma-separated rows (or a library like SheetJS for a real `.xlsx`) wouldn't touch the logging side at all.
- **More conversion categories/units:** purely a data change — add entries to `CONVERSIONS` (and `CATEGORY_LABELS` for a new category). No UI code changes needed; `renderConvertCategories()`/`renderConvertGrid()` read the table directly.
- **Currency conversion:** implemented - see "Live currency rates" above.
- **Financial functions beyond TVM:** the `FIN` module's 5-register solver and amortization generator cover loans, mortgages, and simple savings goals. True NPV/IRR (a list of uneven cash flows, rather than a fixed payment) is a genuinely different, bigger feature - it needs its own cash-flow-list input UI, not just a wider `FIN_REGS` table - as would bond pricing or depreciation schedules.
- **More themes:** add another `[data-theme="..."]` block in `styles.css` redeclaring the full variable set with new values, then add its `{ id, label }` to the `THEMES` array in `app.js`. No other code changes needed — the toggle button and `localStorage` persistence already iterate over that array.
