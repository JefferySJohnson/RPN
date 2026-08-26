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

## Tape

Below the keypad is a running printout, styled like a paper adding-machine tape, of everything that's happened: every number pushed onto the stack and every operation's result, with the operator or function name on the left. Pressing **AC** doesn't erase the tape — it prints a `--- C ---` marker and keeps going, the same way clearing a physical adding machine doesn't tear off the paper.

Two buttons sit above the tape:

| Button | What it does |
|---|---|
| Export .txt | Downloads the entire tape as a plain-text file, named with the current date and time |
| Clear tape | Erases the on-screen tape (does not affect the calculator's stack) |

The exported file lists each line as the operation/label followed by its value, in the same top-to-bottom order they occurred — handy for keeping a record of a calculation after the fact.

## Installing it as an app

Once the calculator is deployed and you open it in a browser:

- **Desktop (Chrome/Edge):** click the install icon in the address bar, or use the **Install** button that appears in the calculator's header.
- **Android (Chrome):** tap **Install** when prompted, or use the browser menu → *Add to Home screen*.
- **iOS (Safari):** tap the Share icon → *Add to Home Screen* (Apple doesn't support the automatic install prompt, so this step is manual).

Once installed, it opens in its own window like a native app and keeps working without an internet connection.
