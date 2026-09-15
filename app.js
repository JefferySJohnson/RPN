"use strict";

/**
 * RPN Scientific Calculator
 * Core stack engine kept dependency-free so it can be unit-tested with plain node.
 */
const RPN = (() => {
  let stack = [];
  let entry = ""; // string being typed, "" means no pending entry
  let angleMode = "deg"; // "deg" | "rad"
  let history = []; // adding-machine tape: { label, value } or { marker: true, text }

  const OP_SYMBOLS = { add: "+", sub: "−", mul: "×", div: "÷", pow: "yˣ" };
  const UNARY_SYMBOLS = {
    sin: "sin", cos: "cos", tan: "tan",
    asin: "asin", acos: "acos", atan: "atan",
    ln: "ln", log10: "log", sqrt: "√x", square: "x²",
    inv: "1/x", exp: "eˣ",
  };

  // Basic US/imperial <-> metric conversions. `factor` converts the forward
  // direction (unit1 -> unit2) by multiplication; reverse divides by it.
  const CATEGORY_LABELS = { length: "Length", weight: "Weight", volume: "Volume", currency: "Currency" };
  const CONVERSIONS = {
    length: [
      { id: "in_cm", fwdLabel: "in→cm", revLabel: "cm→in", factor: 2.54 },
      { id: "ft_m", fwdLabel: "ft→m", revLabel: "m→ft", factor: 0.3048 },
      { id: "mi_km", fwdLabel: "mi→km", revLabel: "km→mi", factor: 1.609344 },
    ],
    weight: [
      { id: "lb_kg", fwdLabel: "lb→kg", revLabel: "kg→lb", factor: 0.45359237 },
      { id: "oz_g", fwdLabel: "oz→g", revLabel: "g→oz", factor: 28.3495231 },
    ],
    volume: [
      { id: "gal_l", fwdLabel: "gal→L", revLabel: "L→gal", factor: 3.785411784 },
      { id: "qt_l", fwdLabel: "qt→L", revLabel: "L→qt", factor: 0.946352946 },
      { id: "floz_ml", fwdLabel: "fl oz→mL", revLabel: "mL→fl oz", factor: 29.5735295625 },
    ],
    // Factors below are approximate fallback defaults, used only until a
    // live rate is fetched (see fetchCurrencyRates in the UI section) or a
    // previously-cached live rate is loaded from localStorage. Ballpark
    // travel use only - not for anything requiring precision.
    currency: [
      { id: "usd_eur", fwdLabel: "USD→EUR", revLabel: "EUR→USD", factor: 0.92 },
      { id: "usd_gbp", fwdLabel: "USD→GBP", revLabel: "GBP→USD", factor: 0.79 },
      { id: "eur_gbp", fwdLabel: "EUR→GBP", revLabel: "GBP→EUR", factor: 0.86 },
      { id: "usd_all", fwdLabel: "USD→ALL", revLabel: "ALL→USD", factor: 92 },
      { id: "eur_all", fwdLabel: "EUR→ALL", revLabel: "ALL→EUR", factor: 100 },
      { id: "usd_lkr", fwdLabel: "USD→LKR", revLabel: "LKR→USD", factor: 302 },
    ],
  };

  // Updates the live factor values for the currency category in place.
  // Called from the UI layer after a successful rate fetch, or when
  // restoring previously-cached rates on load.
  function setCurrencyFactors({ usdToEur, usdToGbp, eurToGbp, usdToAll, eurToAll, usdToLkr }) {
    const pairs = CONVERSIONS.currency;
    const usdEur = pairs.find((p) => p.id === "usd_eur");
    const usdGbp = pairs.find((p) => p.id === "usd_gbp");
    const eurGbp = pairs.find((p) => p.id === "eur_gbp");
    const usdAll = pairs.find((p) => p.id === "usd_all");
    const eurAll = pairs.find((p) => p.id === "eur_all");
    const usdLkr = pairs.find((p) => p.id === "usd_lkr");
    if (usdEur && typeof usdToEur === "number" && !Number.isNaN(usdToEur)) usdEur.factor = usdToEur;
    if (usdGbp && typeof usdToGbp === "number" && !Number.isNaN(usdToGbp)) usdGbp.factor = usdToGbp;
    if (eurGbp && typeof eurToGbp === "number" && !Number.isNaN(eurToGbp)) eurGbp.factor = eurToGbp;
    if (usdAll && typeof usdToAll === "number" && !Number.isNaN(usdToAll)) usdAll.factor = usdToAll;
    if (eurAll && typeof eurToAll === "number" && !Number.isNaN(eurToAll)) eurAll.factor = eurToAll;
    if (usdLkr && typeof usdToLkr === "number" && !Number.isNaN(usdToLkr)) usdLkr.factor = usdToLkr;
  }

  function logEntry(label, value) {
    history.push({ label: label || "", value: formatNumber(value) });
  }

  function logMarker(text) {
    history.push({ marker: true, text });
  }

  function hasPending() {
    return entry !== "";
  }

  function pendingValue() {
    return parseFloat(entry);
  }

  function pushPendingIfAny() {
    if (hasPending()) {
      const val = pendingValue();
      stack.push(val);
      entry = "";
      logEntry("", val);
    }
  }

  function inputDigit(d) {
    if (entry === "0") entry = d;
    else entry += d;
  }

  function inputDecimal() {
    if (entry === "") entry = "0.";
    else if (!entry.includes(".")) entry += ".";
  }

  function backspace() {
    if (entry.length > 0) {
      entry = entry.slice(0, -1);
    } else if (stack.length > 0) {
      // nothing typed: allow editing top of stack by pulling it back down
      entry = String(stack.pop());
      entry = entry.slice(0, -1);
    }
  }

  function toggleSign() {
    if (hasPending()) {
      entry = entry.startsWith("-") ? entry.slice(1) : "-" + entry;
    } else if (stack.length > 0) {
      stack[stack.length - 1] *= -1;
    }
  }

  function clearEntry() {
    entry = "";
  }

  function clearAll() {
    entry = "";
    stack = [];
    logMarker("C");
  }

  function enter() {
    if (hasPending()) {
      pushPendingIfAny();
    } else if (stack.length > 0) {
      // classic RPN behavior: bare Enter duplicates X register
      stack.push(stack[stack.length - 1]);
      logEntry("", stack[stack.length - 1]);
    }
  }

  function drop() {
    pushPendingIfAny();
    stack.pop();
  }

  function swap() {
    pushPendingIfAny();
    if (stack.length >= 2) {
      const a = stack.pop();
      const b = stack.pop();
      stack.push(a, b);
    }
  }

  function binaryOp(op) {
    pushPendingIfAny();
    if (stack.length < 2) return;
    const y = stack.pop();
    const x = stack.pop();
    let result;
    switch (op) {
      case "add": result = x + y; break;
      case "sub": result = x - y; break;
      case "mul": result = x * y; break;
      case "div": result = y === 0 ? NaN : x / y; break;
      case "pow": result = Math.pow(x, y); break;
      default: result = NaN;
    }
    stack.push(result);
    logEntry(OP_SYMBOLS[op] || op, result);
  }

  function toRad(v) {
    return angleMode === "deg" ? (v * Math.PI) / 180 : v;
  }

  function fromRad(v) {
    return angleMode === "deg" ? (v * 180) / Math.PI : v;
  }

  function unaryFn(name) {
    pushPendingIfAny();
    if (stack.length < 1) return;
    const x = stack.pop();
    let result;
    switch (name) {
      case "sin": result = Math.sin(toRad(x)); break;
      case "cos": result = Math.cos(toRad(x)); break;
      case "tan": result = Math.tan(toRad(x)); break;
      case "asin": result = fromRad(Math.asin(x)); break;
      case "acos": result = fromRad(Math.acos(x)); break;
      case "atan": result = fromRad(Math.atan(x)); break;
      case "ln": result = Math.log(x); break;
      case "log10": result = Math.log10(x); break;
      case "sqrt": result = Math.sqrt(x); break;
      case "square": result = x * x; break;
      case "inv": result = x === 0 ? NaN : 1 / x; break;
      case "exp": result = Math.exp(x); break;
      default: result = x;
    }
    stack.push(result);
    logEntry(UNARY_SYMBOLS[name] || name, result);
  }

  function pushConst(name) {
    pushPendingIfAny();
    if (name === "pi") { stack.push(Math.PI); logEntry("π", Math.PI); }
    else if (name === "e") { stack.push(Math.E); logEntry("e", Math.E); }
  }

  // HP-12C/11C style percent: x becomes y*(x/100); y is left untouched so it
  // can be chained straight into + or - (e.g. "200 Enter 15 % +" -> 230).
  function percent() {
    pushPendingIfAny();
    if (stack.length < 2) return;
    const x = stack[stack.length - 1];
    const y = stack[stack.length - 2];
    const result = y * (x / 100);
    stack[stack.length - 1] = result;
    logEntry("%", result);
  }

  function getConversionCategories() {
    return Object.keys(CONVERSIONS).map((id) => ({ id, label: CATEGORY_LABELS[id] || id }));
  }

  function getConversions(category) {
    return (CONVERSIONS[category] || []).map(({ id, fwdLabel, revLabel }) => ({ id, fwdLabel, revLabel }));
  }

  // direction: "fwd" (unit1 -> unit2, multiply) or "rev" (unit2 -> unit1, divide)
  function convert(category, id, direction) {
    pushPendingIfAny();
    if (stack.length < 1) return;
    const pair = (CONVERSIONS[category] || []).find((p) => p.id === id);
    if (!pair) return;
    const x = stack.pop();
    const result = direction === "rev" ? x / pair.factor : x * pair.factor;
    stack.push(result);
    logEntry(direction === "rev" ? pair.revLabel : pair.fwdLabel, result);
  }

  function setAngleMode(mode) {
    angleMode = mode;
  }

  function getAngleMode() {
    return angleMode;
  }

  function getStack() {
    return stack.slice();
  }

  function getHistory() {
    return history.slice();
  }

  function clearTape() {
    history = [];
  }

  function getEntryDisplay() {
    if (hasPending()) return entry;
    if (stack.length > 0) return formatNumber(stack[stack.length - 1]);
    return "0";
  }

  function formatNumber(n) {
    if (Number.isNaN(n)) return "Error";
    if (!Number.isFinite(n)) return n > 0 ? "Infinity" : "-Infinity";
    if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
    const s = n.toPrecision(10).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    // avoid scientific notation for reasonable magnitudes
    if (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-9 && n !== 0)) return n.toExponential(6);
    return s;
  }

  function peekX() {
    pushPendingIfAny();
    if (stack.length === 0) return null;
    return stack[stack.length - 1];
  }

  function setX(value, label) {
    pushPendingIfAny();
    if (stack.length > 0) stack.pop();
    stack.push(value);
    logEntry(label || "", value);
  }

  function logNote(label, value) {
    logEntry(label, value);
  }

  function noteMarker(text) {
    logMarker(text);
  }

  function logAmortText(text, style) {
    history.push({ amortText: true, text, style: style || "summary" });
  }

  function logAmortRow(cols, isHeader) {
    history.push({ amortRow: true, cols, isHeader: !!isHeader });
  }

  return {
    inputDigit,
    inputDecimal,
    backspace,
    toggleSign,
    clearEntry,
    clearAll,
    enter,
    drop,
    swap,
    binaryOp,
    unaryFn,
    pushConst,
    percent,
    getConversionCategories,
    getConversions,
    convert,
    setCurrencyFactors,
    setAngleMode,
    getAngleMode,
    getStack,
    getEntryDisplay,
    formatNumber,
    hasPending,
    getHistory,
    clearTape,
    peekX,
    setX,
    logNote,
    noteMarker,
    logAmortText,
    logAmortRow,
  };
})();

// ---------------------------------------------------------------------
// Financial (Time Value of Money) engine
//
// The classic 5-register TVM solver used by HP-12C/10bII-style financial
// calculators: N (number of periods), I/YR (nominal annual rate, as a
// percent), PV (present value), PMT (payment per period), FV (future
// value). Given any four, it solves the fifth. P/YR (payments per year)
// and Begin/End (annuity due vs. ordinary annuity) are settings, not
// solved-for values.
//
// Sign convention: these formulas honor whatever signs are entered -
// money paid out is naturally negative, money received is positive, same
// as any financial calculator. The amortization generator below is a
// separate, friendlier tool that works off magnitudes only, so printing
// a payment schedule doesn't require thinking about sign conventions.
// ---------------------------------------------------------------------
const FIN = (() => {
  let regs = { n: null, iYr: null, pv: null, pmt: null, fv: null };
  let pYr = 12;
  let begin = false;

  function setReg(id, value) {
    if (id === "pYr") {
      if (typeof value === "number" && value > 0) pYr = value;
      return;
    }
    if (id in regs) regs[id] = value;
  }

  function getRegs() {
    return Object.assign({}, regs, { pYr });
  }

  function setBegin(v) {
    begin = !!v;
  }

  function getSettings() {
    return { pYr, begin };
  }

  function clearFin() {
    regs = { n: null, iYr: null, pv: null, pmt: null, fv: null };
  }

  function periodicRate(iYrVal) {
    return iYrVal / 100 / pYr;
  }

  function tvmResidual(i, n, pv, pmt, fv, beginFlag) {
    if (Math.abs(i) < 1e-12) return pv + pmt * n + fv;
    const s = beginFlag ? 1 + i : 1;
    return pv * Math.pow(1 + i, n) + pmt * s * ((Math.pow(1 + i, n) - 1) / i) + fv;
  }

  function solveNFromI(i, pv, pmt, fv, beginFlag) {
    if (Math.abs(i) < 1e-12) {
      if (pmt === 0) return null;
      return -(pv + fv) / pmt;
    }
    const s = beginFlag ? 1 + i : 1;
    const k = (s * pmt) / i;
    const numerator = k - fv;
    const denominator = pv + k;
    if (numerator === 0 || denominator === 0 || numerator / denominator <= 0) return null;
    return Math.log(numerator / denominator) / Math.log(1 + i);
  }

  function solvePVFromI(i, n, pmt, fv, beginFlag) {
    const s = beginFlag ? 1 + i : 1;
    if (Math.abs(i) < 1e-12) return -(fv + pmt * n);
    const factor = Math.pow(1 + i, n);
    return -(fv + pmt * s * ((factor - 1) / i)) / factor;
  }

  function solveFVFromI(i, n, pv, pmt, beginFlag) {
    const s = beginFlag ? 1 + i : 1;
    if (Math.abs(i) < 1e-12) return -(pv + pmt * n);
    const factor = Math.pow(1 + i, n);
    return -(pv * factor + pmt * s * ((factor - 1) / i));
  }

  function solvePMTFromI(i, n, pv, fv, beginFlag) {
    const s = beginFlag ? 1 + i : 1;
    if (Math.abs(i) < 1e-12) return -(fv + pv) / n;
    const factor = Math.pow(1 + i, n);
    return (-(fv + pv * factor) * i) / (s * (factor - 1));
  }

  // No closed form for the rate - bisection on a bracket sized to the
  // period count so (1+i)^n never overflows a double.
  function solveIPeriodic(n, pv, pmt, fv, beginFlag) {
    const lo = -0.999999;
    const maxExp = 250 / Math.max(1, Math.abs(n));
    const hi = Math.min(10, Math.pow(10, maxExp) - 1);
    const f = (i) => tvmResidual(i, n, pv, pmt, fv, beginFlag);
    const fLoStart = f(lo);
    const fHiStart = f(hi);
    if (!Number.isFinite(fLoStart) || !Number.isFinite(fHiStart) || fLoStart * fHiStart > 0) return null;
    let a = lo;
    let b = hi;
    let fa = fLoStart;
    for (let iter = 0; iter < 200; iter++) {
      const mid = (a + b) / 2;
      const fMid = f(mid);
      if (fMid === 0 || b - a < 1e-15) return mid;
      if (fa < 0 === fMid < 0) {
        a = mid;
        fa = fMid;
      } else {
        b = mid;
      }
    }
    return (a + b) / 2;
  }

  const REG_LABELS = { n: "N", iYr: "I/YR", pv: "PV", pmt: "PMT", fv: "FV" };

  function solve(target) {
    const need = ["n", "iYr", "pv", "pmt", "fv"].filter((r) => r !== target);
    const missing = need.filter((r) => regs[r] === null || regs[r] === undefined);
    if (missing.length) {
      return { error: "Need " + missing.map((r) => REG_LABELS[r]).join(", ") + " set first" };
    }
    let result;
    if (target === "iYr") {
      const iSolved = solveIPeriodic(regs.n, regs.pv, regs.pmt, regs.fv, begin);
      result = iSolved === null ? null : iSolved * pYr * 100;
    } else {
      const i = periodicRate(regs.iYr);
      switch (target) {
        case "n":
          result = solveNFromI(i, regs.pv, regs.pmt, regs.fv, begin);
          break;
        case "pv":
          result = solvePVFromI(i, regs.n, regs.pmt, regs.fv, begin);
          break;
        case "fv":
          result = solveFVFromI(i, regs.n, regs.pv, regs.pmt, begin);
          break;
        case "pmt":
          result = solvePMTFromI(i, regs.n, regs.pv, regs.fv, begin);
          break;
        default:
          result = null;
      }
    }
    if (result === null || result === undefined || !Number.isFinite(result)) {
      return { error: "No solution found for those values" };
    }
    regs[target] = result;
    return { value: result };
  }

  const MAX_AMORT_PERIODS = 1200; // 100 years monthly - generous safety cap

  function generateAmortRows(opts) {
    opts = opts || {};
    const need = ["n", "iYr", "pv", "pmt"].filter((r) => regs[r] === null || regs[r] === undefined);
    if (need.length) {
      return { error: "Need " + need.map((r) => REG_LABELS[r]).join(", ") + " set first (solve PMT if you haven't)" };
    }
    const totalPeriods = Math.max(1, Math.round(regs.n));
    if (totalPeriods > MAX_AMORT_PERIODS) {
      return { error: "N is too large for a schedule (max " + MAX_AMORT_PERIODS + " periods)" };
    }
    const i = periodicRate(regs.iYr);
    const balance0 = Math.abs(regs.pv);
    const payMag = Math.abs(regs.pmt);
    const fvTarget = regs.fv !== null && regs.fv !== undefined ? Math.abs(regs.fv) : 0;

    const rows = [];
    let balance = balance0;
    for (let t = 1; t <= totalPeriods; t++) {
      let interest;
      let principal;
      let newBalance;
      if (begin) {
        const postPay = balance - payMag;
        interest = postPay * i;
        newBalance = postPay + interest;
        principal = balance - newBalance;
      } else {
        interest = balance * i;
        principal = payMag - interest;
        newBalance = balance - principal;
      }
      if (t === totalPeriods) {
        // land exactly on the target balance, absorbing float drift into
        // the last period the way real amortization tables do
        principal = balance - fvTarget;
        interest = payMag - principal;
        newBalance = fvTarget;
      }
      rows.push({ period: t, payment: payMag, interest, principal, balance: newBalance });
      balance = newBalance;
    }

    if (opts.summarize === "year") {
      const yearRows = [];
      for (let start = 0; start < rows.length; start += pYr) {
        const chunk = rows.slice(start, start + pYr);
        const yearNum = Math.floor(start / pYr) + 1;
        yearRows.push({
          period: yearNum,
          payment: chunk.reduce((s, r) => s + r.payment, 0),
          interest: chunk.reduce((s, r) => s + r.interest, 0),
          principal: chunk.reduce((s, r) => s + r.principal, 0),
          balance: chunk[chunk.length - 1].balance,
        });
      }
      return { rows: yearRows, totalPeriods, unit: "year" };
    }
    return { rows, totalPeriods, unit: "month" };
  }

  return {
    setReg,
    getRegs,
    setBegin,
    getSettings,
    clearFin,
    solve,
    generateAmortRows,
  };
})();

// Export for node-based unit testing; no-op in the browser.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { RPN, FIN };
}

// ---- UI wiring (browser only) ----
if (typeof window !== "undefined") {
  const stackEl = document.getElementById("stack");
  const entryEl = document.getElementById("entry");
  const angleBtn = document.getElementById("angleMode");
  const tapeEl = document.getElementById("tape");
  const exportTapeBtn = document.getElementById("exportTape");
  const clearTapeBtn = document.getElementById("clearTape");
  const tapeActionsEl = document.getElementById("tapeActions");
  const panelTabsEl = document.getElementById("panelTabs");
  const convertPanelEl = document.getElementById("convertPanel");
  const convertCategoriesEl = document.getElementById("convertCategories");
  const convertGridEl = document.getElementById("convertGrid");
  const currencyStatusEl = document.getElementById("currencyStatus");
  const currencyStatusTextEl = document.getElementById("currencyStatusText");
  const currencyRefreshBtn = document.getElementById("currencyRefreshBtn");
  const tapePanelEl = document.getElementById("tapePanel");
  const trayToggleBtn = document.getElementById("trayToggle");
  const themeToggleBtn = document.getElementById("themeToggle");
  const financePanelEl = document.getElementById("financePanel");
  const finRegistersEl = document.getElementById("finRegisters");
  const finBeginToggleBtn = document.getElementById("finBeginToggle");
  const finClearBtn = document.getElementById("finClear");
  const finStatusEl = document.getElementById("finStatus");
  const finLabelInput = document.getElementById("finLabel");
  const finAmortMonthBtn = document.getElementById("finAmortMonth");
  const finAmortYearBtn = document.getElementById("finAmortYear");

  const THEME_STORAGE_KEY = "rpn-theme";
  const THEMES = [
    { id: "classic", label: "Classic" },
    { id: "light", label: "Blue" },
    { id: "crimson-dark", label: "Crimson" },
    { id: "amber", label: "Amber" },
  ];

  function setTheme(id) {
    const theme = THEMES.find((t) => t.id === id) || THEMES[0];
    if (theme.id === "classic") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme.id);
    }
    themeToggleBtn.textContent = theme.label;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme.id);
    } catch (err) {
      // localStorage unavailable (private browsing, etc.) - fine, just won't persist
    }
  }

  function initTheme() {
    let saved = null;
    try {
      saved = localStorage.getItem(THEME_STORAGE_KEY);
    } catch (err) {
      saved = null;
    }
    setTheme(saved || "classic");
  }

  const TRAY_STORAGE_KEY = "rpn-tray-collapsed";
  // Short viewports (phones in portrait, tablets in landscape) start with
  // the tray collapsed to leave room for the full keypad; tall viewports
  // (desktop, most tablets in portrait) start expanded.
  const SHORT_VIEWPORT_QUERY = "(max-height: 950px)";

  function setTrayCollapsed(collapsed) {
    tapePanelEl.classList.toggle("collapsed", collapsed);
    trayToggleBtn.textContent = collapsed ? "▸" : "▾";
    trayToggleBtn.setAttribute("aria-label", collapsed ? "Expand tray" : "Collapse tray");
    try {
      localStorage.setItem(TRAY_STORAGE_KEY, collapsed ? "1" : "0");
    } catch (err) {
      // localStorage unavailable (private browsing, etc.) - fine, just won't persist
    }
  }

  function initTray() {
    let collapsed;
    let saved = null;
    try {
      saved = localStorage.getItem(TRAY_STORAGE_KEY);
    } catch (err) {
      saved = null;
    }
    if (saved !== null) {
      collapsed = saved === "1";
    } else {
      collapsed = window.matchMedia(SHORT_VIEWPORT_QUERY).matches;
    }
    setTrayCollapsed(collapsed);
  }

  // ---- Live currency rates (USD/EUR/GBP/ALL/LKR) ----
  // Rates come from Frankfurter (ECB data, no API key), updated roughly once
  // a day. That's fine for ballpark travel conversions - this is not meant
  // to be precise. Rates are cached in localStorage with a timestamp so the
  // panel can always show how old the data is, and a refresh is always a
  // manual tap, never a silent background timer.
  const CURRENCY_STORAGE_KEY = "rpn-currency-rates";
  const CURRENCY_STALE_MS = 24 * 60 * 60 * 1000; // 24 hours
  let currencyTimestamp = null; // ms since epoch, or null if never fetched
  let currencyFetchError = false;

  function loadCachedCurrency() {
    let saved = null;
    try {
      const raw = localStorage.getItem(CURRENCY_STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (err) {
      saved = null;
    }
    if (saved && typeof saved.timestamp === "number") {
      RPN.setCurrencyFactors(saved);
      currencyTimestamp = saved.timestamp;
    }
  }

  function saveCachedCurrency(data) {
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      // localStorage unavailable (private browsing, etc.) - fine, just won't persist
    }
  }

  function formatRelativeTime(ms) {
    const mins = Math.round(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  }

  function renderCurrencyStatus() {
    if (activeCategory !== "currency") {
      currencyStatusEl.classList.add("hidden");
      return;
    }
    currencyStatusEl.classList.remove("hidden");

    if (currencyTimestamp === null) {
      currencyStatusTextEl.textContent = currencyFetchError
        ? "No live rates yet (offline) — using approximate defaults"
        : "Fetching live rates…";
      currencyStatusEl.classList.add("stale");
      return;
    }

    const age = Date.now() - currencyTimestamp;
    let text = `Rates updated ${formatRelativeTime(age)}`;
    if (currencyFetchError) text += " (offline — showing last saved rates)";
    currencyStatusTextEl.textContent = text;
    currencyStatusEl.classList.toggle("stale", currencyFetchError || age > CURRENCY_STALE_MS);
  }

  // Frankfurter (ECB data) covers EUR/GBP but not ALL or LKR - those aren\'t
  // ECB reference-rate currencies. open.er-api.com is a second, no-key
  // source that does carry them, pulled in parallel so the existing
  // EUR/GBP behavior is unaffected if this second call fails.
  function fetchCurrencyRates() {
    currencyRefreshBtn.disabled = true;
    currencyRefreshBtn.classList.add("spinning");

    const majors = fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP")
      .then((resp) => {
        if (!resp.ok) throw new Error("bad response");
        return resp.json();
      })
      .then((data) => {
        const usdToEur = data.rates && data.rates.EUR;
        const usdToGbp = data.rates && data.rates.GBP;
        if (typeof usdToEur !== "number" || typeof usdToGbp !== "number") {
          throw new Error("missing rates");
        }
        return { usdToEur, usdToGbp };
      });

    const exotics = fetch("https://open.er-api.com/v6/latest/USD")
      .then((resp) => {
        if (!resp.ok) throw new Error("bad response");
        return resp.json();
      })
      .then((data) => {
        const usdToAll = data.rates && data.rates.ALL;
        const usdToLkr = data.rates && data.rates.LKR;
        if (typeof usdToAll !== "number" || typeof usdToLkr !== "number") {
          throw new Error("missing rates");
        }
        return { usdToAll, usdToLkr };
      })
      .catch(() => null); // ALL/LKR are a bonus feed - don\'t fail the whole refresh if it\'s down

    Promise.all([majors, exotics])
      .then(([{ usdToEur, usdToGbp }, exoticRates]) => {
        const eurToGbp = usdToGbp / usdToEur;
        const factors = { usdToEur, usdToGbp, eurToGbp };
        if (exoticRates) {
          factors.usdToAll = exoticRates.usdToAll;
          factors.usdToLkr = exoticRates.usdToLkr;
          factors.eurToAll = exoticRates.usdToAll / usdToEur;
        }
        RPN.setCurrencyFactors(factors);
        currencyTimestamp = Date.now();
        currencyFetchError = false;
        saveCachedCurrency({ ...factors, timestamp: currencyTimestamp });
        renderConvertGrid();
      })
      .catch(() => {
        currencyFetchError = true;
        renderCurrencyStatus();
      })
      .finally(() => {
        currencyRefreshBtn.disabled = false;
        currencyRefreshBtn.classList.remove("spinning");
      });
  }

  // ---- Finance (TVM) panel ----
  const FIN_REGS = [
    { id: "n", label: "N" },
    { id: "iYr", label: "I/YR" },
    { id: "pv", label: "PV" },
    { id: "pmt", label: "PMT" },
    { id: "fv", label: "FV" },
  ];
  const FIN_LABELS = { n: "N", iYr: "I/YR", pv: "PV", pmt: "PMT", fv: "FV", pYr: "P/YR" };

  function formatMoney(n) {
    if (n === null || n === undefined) return "—";
    if (Number.isNaN(n)) return "Error";
    const sign = n < 0 ? "-" : "";
    return sign + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatPercent(n) {
    if (n === null || n === undefined) return "—";
    if (Number.isNaN(n)) return "Error";
    return n.toFixed(3) + "%";
  }

  function formatN(n) {
    if (n === null || n === undefined) return "—";
    if (Number.isNaN(n)) return "Error";
    return Number.isInteger(n) ? String(n) : n.toFixed(3);
  }

  function showFinStatus(text, isError) {
    finStatusEl.textContent = text;
    finStatusEl.classList.toggle("error", !!isError);
  }

  function renderFinRegisters() {
    const regs = FIN.getRegs();
    const settings = FIN.getSettings();
    finRegistersEl.innerHTML = "";
    FIN_REGS.forEach((r) => {
      const row = document.createElement("div");
      row.className = "fin-row";
      const val = regs[r.id];
      const displayVal = r.id === "iYr" ? formatPercent(val) : r.id === "n" ? formatN(val) : formatMoney(val);
      row.innerHTML =
        '<span class="fin-label">' + r.label + '</span>' +
        '<span class="fin-value">' + displayVal + '</span>' +
        '<button class="pill fin-store" data-reg="' + r.id + '" type="button">Store</button>' +
        '<button class="pill fin-solve" data-reg="' + r.id + '" type="button">Solve</button>';
      finRegistersEl.appendChild(row);
    });
    const pYrRow = document.createElement("div");
    pYrRow.className = "fin-row";
    pYrRow.innerHTML =
      '<span class="fin-label">P/YR</span>' +
      '<span class="fin-value">' + settings.pYr + '</span>' +
      '<button class="pill fin-store" data-reg="pYr" type="button">Store</button>' +
      '<span></span>';
    finRegistersEl.appendChild(pYrRow);
    finBeginToggleBtn.textContent = settings.begin ? "BEGIN" : "END";
  }

  function runAmortize(summarize) {
    const gen = FIN.generateAmortRows({ summarize });
    if (gen.error) {
      showFinStatus(gen.error, true);
      return;
    }
    const regs = FIN.getRegs();
    const settings = FIN.getSettings();
    const years = gen.totalPeriods / settings.pYr;
    const yearsStr = Number.isInteger(years) ? String(years) : years.toFixed(1);
    const summaryLine =
      formatMoney(Math.abs(regs.pv)) + " over " + gen.totalPeriods + " payments (" + yearsStr + " yr) at " +
      formatPercent(regs.iYr) + " APR, " + settings.pYr + "/yr, " + (settings.begin ? "Begin" : "End") +
      " — payment " + formatMoney(Math.abs(regs.pmt));
    const label = finLabelInput.value.trim();
    if (label) RPN.logAmortText(label, "title");
    RPN.logAmortText(summaryLine, "summary");
    RPN.logAmortRow(["#", "Payment", "Interest", "Principal", "Balance"], true);
    gen.rows.forEach((r) => {
      RPN.logAmortRow(
        [String(r.period), formatMoney(r.payment), formatMoney(r.interest), formatMoney(r.principal), formatMoney(r.balance)],
        false
      );
    });
    renderTape();
    switchTab("tape");
    showFinStatus("Added a " + gen.rows.length + "-row amortization schedule to the tape", false);
  }

  let activeCategory = RPN.getConversionCategories()[0]?.id || "length";

  function renderConvertCategories() {
    const cats = RPN.getConversionCategories();
    convertCategoriesEl.innerHTML = "";
    cats.forEach((cat) => {
      const btn = document.createElement("button");
      btn.className = "pill cat-btn" + (cat.id === activeCategory ? " active" : "");
      btn.type = "button";
      btn.textContent = cat.label;
      btn.dataset.cat = cat.id;
      convertCategoriesEl.appendChild(btn);
    });
  }

  function renderConvertGrid() {
    const pairs = RPN.getConversions(activeCategory);
    convertGridEl.innerHTML = "";
    pairs.forEach((p) => {
      const fwdBtn = document.createElement("button");
      fwdBtn.className = "convert-btn";
      fwdBtn.type = "button";
      fwdBtn.textContent = p.fwdLabel;
      fwdBtn.dataset.cat = activeCategory;
      fwdBtn.dataset.id = p.id;
      fwdBtn.dataset.dir = "fwd";
      convertGridEl.appendChild(fwdBtn);

      const revBtn = document.createElement("button");
      revBtn.className = "convert-btn";
      revBtn.type = "button";
      revBtn.textContent = p.revLabel;
      revBtn.dataset.cat = activeCategory;
      revBtn.dataset.id = p.id;
      revBtn.dataset.dir = "rev";
      convertGridEl.appendChild(revBtn);
    });
    renderCurrencyStatus();
  }

  function switchTab(tab) {
    panelTabsEl.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    tapeEl.classList.toggle("hidden", tab !== "tape");
    tapeActionsEl.classList.toggle("hidden", tab !== "tape");
    convertPanelEl.classList.toggle("hidden", tab !== "convert");
    financePanelEl.classList.toggle("hidden", tab !== "finance");
    if (tab === "finance") renderFinRegisters();
  }

  function renderTape() {
    const hist = RPN.getHistory();
    tapeEl.innerHTML = "";
    hist.forEach((entry) => {
      const row = document.createElement("div");
      if (entry.amortText) {
        row.className = "tape-amort-text " + (entry.style === "title" ? "amort-title" : "amort-summary");
        row.textContent = entry.text;
      } else if (entry.amortRow) {
        row.className = "tape-amort-row" + (entry.isHeader ? " amort-row-header" : "");
        row.innerHTML = entry.cols.map((c) => `<span>${c}</span>`).join("");
      } else if (entry.marker) {
        row.className = "tape-marker";
        row.textContent = entry.text;
      } else {
        row.className = "tape-row";
        row.innerHTML = `<span class="tape-label">${entry.label}</span><span class="tape-value">${entry.value}</span>`;
      }
      tapeEl.appendChild(row);
    });
    tapeEl.scrollTop = tapeEl.scrollHeight;
  }

  function exportTape() {
    const hist = RPN.getHistory();
    const lines = hist.map((e) => {
      if (e.amortText) return e.text;
      if (e.amortRow) return e.cols.map((c) => String(c).padStart(13)).join("");
      if (e.marker) return `--- ${e.text} ---`;
      return `${(e.label || "").padEnd(6)}${String(e.value).padStart(12)}`;
    });
    const text = lines.join("\n") + "\n";
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    a.href = url;
    a.download = `rpn-tape-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function render() {
    const stack = RPN.getStack();
    // Registers above X (Y, Z, T). If an entry is pending, the whole stack
    // sits above X; otherwise the stack's top element *is* X.
    const above = RPN.hasPending() ? stack : stack.slice(0, -1);
    const visible = above.slice(-3); // nearest-to-X last
    const labels = ["T", "Z", "Y"].slice(3 - visible.length);
    stackEl.innerHTML = "";
    visible.forEach((val, i) => {
      const row = document.createElement("div");
      row.className = "stack-row";
      row.innerHTML = `<span class="reg-label">${labels[i]}</span><span>${RPN.formatNumber(val)}</span>`;
      stackEl.appendChild(row);
    });
    entryEl.textContent = RPN.getEntryDisplay();
    angleBtn.textContent = RPN.getAngleMode() === "deg" ? "DEG" : "RAD";
    renderTape();
  }

  function handleAction(el) {
    const action = el.dataset.action;
    switch (action) {
      case "digit":
        RPN.inputDigit(el.dataset.digit);
        break;
      case "decimal":
        RPN.inputDecimal();
        break;
      case "sign":
        RPN.toggleSign();
        break;
      case "backspace":
        RPN.backspace();
        break;
      case "clear-entry":
        RPN.clearEntry();
        break;
      case "clear-all":
        RPN.clearAll();
        break;
      case "enter":
        RPN.enter();
        break;
      case "drop":
        RPN.drop();
        break;
      case "swap":
        RPN.swap();
        break;
      case "op":
        RPN.binaryOp(el.dataset.op);
        break;
      case "fn":
        RPN.unaryFn(el.dataset.fn);
        break;
      case "const":
        RPN.pushConst(el.dataset.const);
        break;
      case "percent":
        RPN.percent();
        break;
    }
    render();
  }

  document.querySelector(".keys").addEventListener("click", (e) => {
    const btn = e.target.closest(".key");
    if (btn) handleAction(btn);
  });

  angleBtn.addEventListener("click", () => {
    RPN.setAngleMode(RPN.getAngleMode() === "deg" ? "rad" : "deg");
    render();
  });

  exportTapeBtn.addEventListener("click", exportTape);

  clearTapeBtn.addEventListener("click", () => {
    RPN.clearTape();
    renderTape();
  });

  panelTabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (btn) switchTab(btn.dataset.tab);
  });

  convertCategoriesEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-btn");
    if (!btn) return;
    activeCategory = btn.dataset.cat;
    renderConvertCategories();
    renderConvertGrid();
  });

  currencyRefreshBtn.addEventListener("click", fetchCurrencyRates);

  convertGridEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".convert-btn");
    if (!btn) return;
    RPN.convert(btn.dataset.cat, btn.dataset.id, btn.dataset.dir);
    render();
  });

  financePanelEl.addEventListener("click", (e) => {
    const storeBtn = e.target.closest(".fin-store");
    if (storeBtn) {
      const reg = storeBtn.dataset.reg;
      const x = RPN.peekX();
      if (x === null || Number.isNaN(x)) {
        showFinStatus("Nothing to store — type a number first", true);
        return;
      }
      FIN.setReg(reg, x);
      RPN.logNote("→" + FIN_LABELS[reg], x);
      renderFinRegisters();
      render();
      showFinStatus("Stored " + x + " → " + FIN_LABELS[reg], false);
      return;
    }
    const solveBtn = e.target.closest(".fin-solve");
    if (solveBtn) {
      const reg = solveBtn.dataset.reg;
      const result = FIN.solve(reg);
      if (result.error) {
        showFinStatus(result.error, true);
        return;
      }
      RPN.setX(result.value, FIN_LABELS[reg]);
      renderFinRegisters();
      render();
      showFinStatus("Solved " + FIN_LABELS[reg] + " = " + RPN.formatNumber(result.value), false);
    }
  });

  finBeginToggleBtn.addEventListener("click", () => {
    FIN.setBegin(!FIN.getSettings().begin);
    renderFinRegisters();
  });

  finClearBtn.addEventListener("click", () => {
    FIN.clearFin();
    renderFinRegisters();
    RPN.noteMarker("FIN CLEAR");
    renderTape();
    showFinStatus("Cleared N, I/YR, PV, PMT, FV", false);
  });

  finAmortMonthBtn.addEventListener("click", () => runAmortize("month"));
  finAmortYearBtn.addEventListener("click", () => runAmortize("year"));

  trayToggleBtn.addEventListener("click", () => {
    setTrayCollapsed(!tapePanelEl.classList.contains("collapsed"));
  });

  themeToggleBtn.addEventListener("click", () => {
    let current = null;
    try {
      current = localStorage.getItem(THEME_STORAGE_KEY);
    } catch (err) {
      current = null;
    }
    const idx = THEMES.findIndex((t) => t.id === (current || "classic"));
    const next = THEMES[(idx + 1) % THEMES.length];
    setTheme(next.id);
  });

  loadCachedCurrency();
  renderConvertCategories();
  renderConvertGrid();
  renderFinRegisters();
  initTray();
  initTheme();
  fetchCurrencyRates();

  // Keyboard support
  window.addEventListener("keydown", (e) => {
    const k = e.key;
    if (/^[0-9]$/.test(k)) RPN.inputDigit(k);
    else if (k === ".") RPN.inputDecimal();
    else if (k === "Enter" || k === " ") RPN.enter();
    else if (k === "Backspace") RPN.backspace();
    else if (k === "Escape") RPN.clearEntry();
    else if (k === "Delete") RPN.clearAll();
    else if (k === "+") RPN.binaryOp("add");
    else if (k === "-") RPN.binaryOp("sub");
    else if (k === "*") RPN.binaryOp("mul");
    else if (k === "/") RPN.binaryOp("div");
    else if (k === "^") RPN.binaryOp("pow");
    else if (k === "%") RPN.percent();
    else return;
    e.preventDefault();
    render();
  });

  render();

  // Register service worker for offline / installable PWA support
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  // Custom install prompt
  let deferredPrompt = null;
  const installBtn = document.getElementById("installBtn");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.remove("hidden");
  });
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add("hidden");
  });
  window.addEventListener("appinstalled", () => {
    installBtn.classList.add("hidden");
  });
}
