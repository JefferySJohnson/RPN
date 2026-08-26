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
  const CATEGORY_LABELS = { length: "Length", weight: "Weight", volume: "Volume" };
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
  };

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
    setAngleMode,
    getAngleMode,
    getStack,
    getEntryDisplay,
    formatNumber,
    hasPending,
    getHistory,
    clearTape,
  };
})();

// Export for node-based unit testing; no-op in the browser.
if (typeof module !== "undefined" && module.exports) {
  module.exports = RPN;
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
  }

  function switchTab(tab) {
    panelTabsEl.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    if (tab === "convert") {
      tapeEl.classList.add("hidden");
      tapeActionsEl.classList.add("hidden");
      convertPanelEl.classList.remove("hidden");
    } else {
      tapeEl.classList.remove("hidden");
      tapeActionsEl.classList.remove("hidden");
      convertPanelEl.classList.add("hidden");
    }
  }

  function renderTape() {
    const hist = RPN.getHistory();
    tapeEl.innerHTML = "";
    hist.forEach((entry) => {
      const row = document.createElement("div");
      if (entry.marker) {
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
    const lines = hist.map((e) =>
      e.marker ? `--- ${e.text} ---` : `${(e.label || "").padEnd(6)}${String(e.value).padStart(12)}`
    );
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

  convertGridEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".convert-btn");
    if (!btn) return;
    RPN.convert(btn.dataset.cat, btn.dataset.id, btn.dataset.dir);
    render();
  });

  renderConvertCategories();
  renderConvertGrid();

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
