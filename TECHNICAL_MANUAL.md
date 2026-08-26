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
| `enter()` | Pushes `entry` onto `stack` and clears it; if `entry` is empty, duplicates the top of `stack` (matches physical RPN calculator behavior) |
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

## UI layer

- Buttons are plain `<button>` elements with `data-action` (and secondary `data-digit` / `data-op` / `data-fn` / `data-const`) attributes. A single delegated `click` listener on `.keys` dispatches to `handleAction()`, which calls the matching `RPN` method then re-renders.
- Keyboard input is handled by a `keydown` listener mapping standard keys (digits, `.`, Enter/Space, Backspace, Esc, Delete, `+ - * / ^ %`) to the same `RPN` calls.
- `render()` is the only function that touches the DOM for calculator state — it's called after every action, keeping state and view in sync without a framework.

### Key grid order

The `.keys` grid in `index.html` is a 4-column CSS grid with no explicit `grid-row`/`grid-column` placement (aside from `.key.enter`, which spans 2 columns) — button order in the markup is button order on screen. The layout mirrors an HP-41-style keypad:

1. Utility row: Drop, x⇄y, CE, AC
2. Trig/reciprocal: sin, cos, tan, 1/x
3. Logs/roots: ln, log, √x, x²
4. Constants/exponents: π, e, eˣ, yˣ
5. **Enter** (2-col span), **±**, **⌫** — the entry-control row, positioned directly under the scientific rows rather than at the bottom
6. Four numeric rows, each with the operator in the *leftmost* column and digits filling the rest: `÷ 7 8 9`, `× 4 5 6`, `− 1 2 3`, `+ 0 . %`

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
const RPN = require('./app.js');
RPN.clearAll();
RPN.inputDigit('3'); RPN.enter();
RPN.inputDigit('4'); RPN.binaryOp('add');
console.log(RPN.getStack()); // [7]
```

A test pass covering basic arithmetic, non-commutative operand order, trig with angle mode, implicit-push behavior (functions/operators auto-push a pending `entry`), swap/drop, divide-by-zero error formatting, bare-Enter duplication, and backspace editing was run against this module during development — all cases passed.

## Extending it

- **New functions:** add a `case` to `unaryFn()` or `binaryOp()` in the `RPN` module, then add a corresponding button in `index.html` with the matching `data-fn`/`data-op` value. No other wiring needed — the delegated click handler and keyboard map already route by `dataset`.
- **Memory registers (M+, MR, MC):** would need a new `memory` variable in the `RPN` module plus three new methods, following the same pattern as the existing stack operations.
- **History/undo:** not currently implemented; would require snapshotting `stack`/`entry` before each mutating call.
