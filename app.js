"use strict";

/**
 * RPN Scientific Calculator
 * Core stack engine kept dependency-free so it can be unit-tested with plain node.
 */
const RPN = (() => {
  let stack = [];
  let entry = ""; // string being typed, "" means no pending entry
  let angleMode = "deg"; // "deg" | "rad"

  function hasPending() {
    return entry !== "";
  }

  function pendingValue() {
    return parseFloat(entry);
  }

  function pushPendingIfAny() {
    if (hasPending()) {
      stack.push(pendingValue());
      entry = "";
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
  }

  function enter() {
    if (hasPending()) {
      stack.push(pendingValue());
      entry = "";
    } else if (stack.length > 0) {
      // classic RPN behavior: bare Enter duplicates X register
      stack.push(stack[stack.length - 1]);
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
  }

  function pushConst(name) {
    pushPendingIfAny();
    if (name === "pi") stack.push(Math.PI);
    else if (name === "e") stack.push(Math.E);
  }

  // HP-12C/11C style percent: x becomes y*(x/100); y is left untouched so it
  // can be chained straight into + or - (e.g. "200 Enter 15 % +" -> 230).
  function percent() {
    pushPendingIfAny();
    if (stack.length < 2) return;
    const x = stack[stack.length - 1];
    const y = stack[stack.length - 2];
    stack[stack.length - 1] = y * (x / 100);
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
    setAngleMode,
    getAngleMode,
    getStack,
    getEntryDisplay,
    formatNumber,
    hasPending,
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
