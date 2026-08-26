# RPN Scientific Calculator — User's Manual

## What is RPN?

Reverse Polish Notation enters numbers first, then the operation. Instead of typing `3 + 4 =`, you type `3`, press **Enter**, type `4`, then press **+**. There's no `=` key and no need for parentheses — the order you enter numbers and operators determines the result.

Example: to compute `(3 + 4) × 2`:

```
3  Enter
4  Enter
+          → 7
2  Enter
×          → 14
```

## The display

The screen has two parts:

- **Stack rows (T, Z, Y)** — the calculator can hold more than one pending value at a time. These rows show what's stacked up above your current entry, labeled like a classic RPN calculator (X is always the working value on the bottom line).
- **x: entry line** — the number you're currently typing, or the top of the stack if nothing is being typed.

## Keyboard layout

The keys are arranged to match a classic HP-41-style RPN calculator: **Enter** and **±** sit in their own row directly under the scientific functions (with backspace next to them), and the arithmetic operators **− + × ÷** sit in the *left* column of the number pad, with the digits filling the columns to their right — for example the top numeric row reads `− 7 8 9`.

## Basic entry

| Action | How |
|---|---|
| Type a number | Tap the digit keys |
| Decimal point | `.` |
| Push a number onto the stack | **Enter ↑** |
| Change sign | **±** |
| Delete last digit typed | **⌫** (backspace) |
| Clear what you're typing | **CE** |
| Clear everything | **AC** |

Tip: pressing **Enter** with nothing typed duplicates the current value — handy for reusing a number twice in a row (e.g., `5 Enter Enter ×` gives `25`).

Note: you don't actually have to press Enter before an operator or function — typing a number and pressing `+` (or `sin`, `√x`, etc.) directly pushes it first automatically. Both the explicit push and the operator/result show up on the tape either way (see below).

## Operators

`+`, `−`, `×`, `÷`, and `yˣ` (y to the power of x) all work the same way: enter the first number, press Enter, enter the second number, then press the operator. Order matters for subtraction, division, and powers — the *first* number entered is always the base/left-hand side.

## Percent (%)

The **%** key (bottom-right) works like a classic HP-12C/11C percent key rather than a plain operator: enter the base value, press Enter, enter the percentage, then press **%**. It replaces the entry with the percentage *amount* and leaves the base value in place underneath, so you can chain straight into `+` or `−`.

```
200  Enter
15   %        → 15% of 200 = 30 (200 is still underneath)
+              → 230
```

This is handy for "add/subtract N%" style calculations (tips, discounts, tax) without re-typing the base number.

## Scientific functions

These apply to whatever is currently on the entry line (you don't need to press Enter first):

| Key | Function |
|---|---|
| sin / cos / tan | Trigonometric functions (uses the current angle mode) |
| ln | Natural log |
| log | Base-10 log |
| √x | Square root |
| x² | Square |
| 1/x | Reciprocal |
| eˣ | e raised to the power of x |
| π / e | Push the constant onto the stack |

## Angle mode

The **DEG / RAD** pill in the top-right toggles between degrees and radians for `sin`, `cos`, and `tan`. It's shown at all times so you always know which mode you're in.

## Stack management

| Key | What it does |
|---|---|
| Drop | Removes the top value from the stack without using it |
| x⇄y | Swaps the top two values — useful for fixing order before a non-commutative operation |

## Keyboard shortcuts

The calculator responds to your physical keyboard when the page has focus:

| Key | Action |
|---|---|
| 0–9 | Digits |
| `.` | Decimal point |
| Enter or Space | Push / duplicate |
| Backspace | Delete last digit |
| `+` `-` `*` `/` `^` | Operators (`^` is power) |
| `%` | Percent |
| Esc | Clear entry |
| Delete | Clear all |

## Errors

Dividing by zero or taking the log/root of an invalid value shows **Error** on the display. Press **CE** or **AC** to recover.

## Tape and Convert panel

Below the keypad is a panel with two tabs, **Tape** and **Convert**, sharing the same space so the app stays the same compact size no matter which one you're using.

### Tape

The Tape tab shows a running printout, styled like a paper adding-machine tape, of everything that's happened: every number pushed onto the stack and every operation's result, with the operator or function name on the left. Pressing **AC** doesn't erase the tape — it prints a `--- C ---` marker and keeps going, the same way clearing a physical adding machine doesn't tear off the paper.

Two buttons sit above the tape (only visible on this tab):

| Button | What it does |
|---|---|
| Export .txt | Downloads the entire tape as a plain-text file, named with the current date and time |
| Clear tape | Erases the on-screen tape (does not affect the calculator's stack) |

The exported file lists each line as the operation/label followed by its value, in the same top-to-bottom order they occurred — handy for keeping a record of a calculation after the fact.

### Convert

The Convert tab turns the current **x** value into a unit conversion calculator. Pick a category — **Length**, **Weight**, or **Volume** — and a grid of conversion buttons appears for that category, each one a pair like `in→cm` and `cm→in` sitting side by side.

| Category | Conversions available |
|---|---|
| Length | in ⇄ cm, ft ⇄ m, mi ⇄ km |
| Weight | lb ⇄ kg, oz ⇄ g |
| Volume | gal ⇄ L, qt ⇄ L, fl oz ⇄ mL |

Tapping a conversion button works just like a scientific function: it takes whatever's currently on the entry line (typing a number first isn't required — it'll auto-push, same as pressing `sin` or `√x`), converts it, and replaces **x** with the result. The conversion also gets logged to the tape with its label (e.g. `in→cm`), so switching back to the Tape tab shows a record of what was converted, even though the two tabs share one panel.

Currency conversion (live exchange rates) isn't included yet — it needs a network call to a rate source, which is a bigger addition than these fixed unit conversions. It's on the list for a future update.

## Installing it as an app

Once the calculator is deployed and you open it in a browser:

- **Desktop (Chrome/Edge):** click the install icon in the address bar, or use the **Install** button that appears in the calculator's header.
- **Mac (Safari):** open the calculator's URL in Safari, then go to **File → Add to Dock** (macOS Sonoma or later). This creates a standalone app icon in the Dock that opens the calculator in its own window, separate from your regular Safari windows — no address bar, no tabs.
- **Android (Chrome):** tap **Install** when prompted, or use the browser menu → *Add to Home screen*.
- **iOS (Safari):** tap the Share icon → *Add to Home Screen* (Apple doesn't support the automatic install prompt, so this step is manual).

Once installed, it opens in its own window like a native app and keeps working without an internet connection.

### Getting the window sized right (Mac)

The first time you open the Dock app, Safari may give it a full-size window, which is overkill for a calculator this size. Fix it once and it should stick:

1. Open the app from the Dock.
2. Drag the bottom-right corner of the window in until it's snug around the calculator.
3. Quit it properly with **Cmd+Q** — not just the red close button. A full quit is what saves the window size for next time; closing the window alone may not.
4. Reopen from the Dock and confirm it comes back at the same compact size.

This is a one-time fix. If for some reason the size doesn't stick on your version of macOS, see the Automator option below for a more forceful fix.

### Advanced: pin the window size with Automator

If step above doesn't hold, or you just want the window size guaranteed every launch no matter what, you can build a tiny Automator app that opens the calculator and explicitly resizes its window every time.

1. Open **Automator** (Cmd+Space, type "Automator").
2. Choose **New Document → Application** (not "Workflow" — Application is what makes it double-clickable).
3. In the actions search box on the left, find **Run AppleScript** and drag it into the empty workflow area on the right.
4. Replace the placeholder script with this:

    ```applescript
    tell application "RPN Scientific Calculator" to activate
    delay 1
    tell application "System Events"
    	tell process "RPN Scientific Calculator"
    		set position of front window to {100, 100}
    		set size of front window to {460, 820}
    	end tell
    end tell
    ```

5. Before saving, check three things and adjust as needed:
   - **The app name** in both `tell application` lines has to exactly match what your Dock app is actually called. Right-click its Dock icon → Options, or find the `.app` file (Safari usually saves these under `~/Applications`) and use that exact name.
   - `{100, 100}` is the window's top-left corner in pixels from your screen's top-left corner — change it to wherever you want the window to land.
   - `{460, 820}` is width × height in pixels. If the window comes up too short or too tall for your screen, adjust the second number.
   - If the script runs before the window has fully appeared, bump `delay 1` up to `delay 2`.
6. Save (Cmd+S), give it a name like "RPN Calculator," and save it to Applications or the Desktop.
7. Optionally, drag this new app onto your Dock in place of (or alongside) the original.

Run it once to confirm the window lands where you expect — the position and size numbers are the only part you're likely to need to tune for your own screen.
