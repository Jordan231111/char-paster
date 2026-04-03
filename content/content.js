"use strict";

let lastTargetElement = null;
let abortController = null;
let overlayHost = null;
const ZERO_DELAY_YIELD_INTERVAL = 32;

const EDITABLE_SELECTOR =
  'input:not([type="hidden"]), textarea, [contenteditable]:not([contenteditable="false"])';

document.addEventListener("focusin", rememberTargetFromEvent, true);
document.addEventListener("contextmenu", rememberTargetFromEvent, true);

browser.runtime.onMessage.addListener((msg) => {
  if (msg.action === "showOverlay") {
    showOverlay({
      initialText: msg.initialText,
      errorMessage: msg.errorMessage,
    });
    return Promise.resolve({ ok: true });
  }

  if (msg.action === "typeText") {
    return startTyping(msg.text, msg.delay);
  }

  if (msg.action === "stopTyping") {
    abortController?.abort();
    return Promise.resolve({ stopped: true });
  }

  return undefined;
});

function rememberTargetFromEvent(event) {
  if (isOverlayEvent(event)) {
    return;
  }

  const target = findEditableElement(event.target);
  if (!target) {
    return;
  }

  rememberTarget(target);
}

function rememberTarget(target) {
  if (!isSupportedEditable(target)) {
    return;
  }

  lastTargetElement = target;
  void browser.runtime.sendMessage({ action: "rememberEditableTarget" }).catch(() => {});
}

function findEditableElement(node) {
  const element = node instanceof Element ? node : node?.parentElement ?? null;
  return element?.closest(EDITABLE_SELECTOR) ?? null;
}

function isSupportedEditable(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

function isOverlayEvent(event) {
  return Boolean(
    overlayHost &&
      typeof event.composedPath === "function" &&
      event.composedPath().includes(overlayHost)
  );
}

function getRememberedTarget() {
  if (lastTargetElement?.isConnected) {
    return lastTargetElement;
  }

  const activeTarget = findEditableElement(document.activeElement);
  if (activeTarget) {
    lastTargetElement = activeTarget;
    return activeTarget;
  }

  return null;
}

function normalizeDelay(delay) {
  const parsed = Number.parseInt(delay, 10);
  if (!Number.isFinite(parsed)) {
    return 15;
  }

  return Math.max(0, parsed);
}

async function startTyping(text, delay) {
  abortController?.abort();
  abortController = new AbortController();

  try {
    const count = await typeText(
      getRememberedTarget(),
      String(text ?? ""),
      normalizeDelay(delay),
      abortController.signal
    );
    return { success: true, count };
  } catch (error) {
    if (error instanceof TypingAbortedError) {
      return {
        success: false,
        aborted: true,
        count: error.typed,
        error: error.message,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function showOverlay({ initialText = "", errorMessage = "" } = {}) {
  removeOverlay();

  const targetElement = getRememberedTarget();
  if (!targetElement) {
    return;
  }

  overlayHost = document.createElement("char-paster-host");
  overlayHost.style.cssText =
    "all:initial !important;position:fixed !important;top:0 !important;left:0 !important;" +
    "width:100vw !important;height:100vh !important;z-index:2147483647 !important;" +
    "pointer-events:none !important;font-size:16px !important;";

  const shadow = overlayHost.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = OVERLAY_CSS;
  shadow.appendChild(style);

  const backdrop = document.createElement("div");
  backdrop.id = "backdrop";
  backdrop.className = "backdrop";

  const panel = document.createElement("div");
  panel.id = "panel";
  panel.className = "panel";

  const header = document.createElement("div");
  header.className = "header";

  const title = document.createElement("h2");
  title.textContent = "Char Paster";

  const closeBtn = document.createElement("button");
  closeBtn.id = "close-btn";
  closeBtn.className = "close-btn";
  closeBtn.type = "button";
  closeBtn.title = "Close";
  closeBtn.textContent = "×";

  header.append(title, closeBtn);

  const notice = document.createElement("div");
  notice.id = "cp-notice";
  notice.className = "notice error";
  notice.hidden = !errorMessage;
  notice.textContent = errorMessage;

  const label = document.createElement("label");
  label.htmlFor = "cp-text";
  label.textContent = "Text to type:";

  const textArea = document.createElement("textarea");
  textArea.id = "cp-text";
  textArea.rows = 5;
  textArea.placeholder = "Paste your text here (no restrictions in this box)...";
  textArea.autofocus = true;
  textArea.value = initialText;

  const charCount = document.createElement("div");
  charCount.className = "char-count";

  const countEl = document.createElement("span");
  countEl.id = "cp-count";
  countEl.textContent = String(initialText.length);
  charCount.append(countEl, document.createTextNode(" characters"));

  const speedRow = document.createElement("div");
  speedRow.className = "speed-row";

  const speedLabel = document.createElement("label");
  speedLabel.htmlFor = "cp-speed";
  speedLabel.textContent = "Speed:";

  const speedInput = document.createElement("input");
  speedInput.id = "cp-speed";
  speedInput.type = "range";
  speedInput.min = "0";
  speedInput.max = "200";
  speedInput.value = "0";

  const speedVal = document.createElement("span");
  speedVal.id = "cp-speed-val";
  speedVal.textContent = "0 ms";

  speedRow.append(speedLabel, speedInput, speedVal);

  const btnRow = document.createElement("div");
  btnRow.id = "btn-row";
  btnRow.className = "btn-row";

  const typeBtn = document.createElement("button");
  typeBtn.id = "cp-type";
  typeBtn.className = "btn primary";
  typeBtn.type = "button";
  typeBtn.textContent = "Type It";

  const cancelBtn = document.createElement("button");
  cancelBtn.id = "cp-cancel";
  cancelBtn.className = "btn secondary";
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";

  btnRow.append(typeBtn, cancelBtn);

  const progRow = document.createElement("div");
  progRow.id = "progress-row";
  progRow.className = "progress-row";
  progRow.hidden = true;

  const progressBar = document.createElement("div");
  progressBar.className = "progress-bar";

  const fillEl = document.createElement("div");
  fillEl.id = "cp-fill";
  fillEl.className = "progress-fill";
  progressBar.appendChild(fillEl);

  const progressText = document.createElement("div");
  progressText.className = "progress-text";

  const progEl = document.createElement("span");
  progEl.id = "cp-progress";
  progEl.textContent = "0";

  const totalEl = document.createElement("span");
  totalEl.id = "cp-total";
  totalEl.textContent = "0";

  progressText.append(
    progEl,
    document.createTextNode(" / "),
    totalEl
  );

  const stopBtn = document.createElement("button");
  stopBtn.id = "cp-stop";
  stopBtn.className = "btn stop";
  stopBtn.type = "button";
  stopBtn.textContent = "Stop";

  progRow.append(progressBar, progressText, stopBtn);

  const doneRow = document.createElement("div");
  doneRow.id = "done-row";
  doneRow.className = "done-row";
  doneRow.hidden = true;

  const doneText = document.createElement("span");
  doneText.id = "done-text";
  doneText.className = "done-text";

  const doneClose = document.createElement("button");
  doneClose.id = "cp-done-close";
  doneClose.className = "btn secondary";
  doneClose.type = "button";
  doneClose.textContent = "Close";

  doneRow.append(doneText, doneClose);

  panel.append(
    header,
    notice,
    label,
    textArea,
    charCount,
    speedRow,
    btnRow,
    progRow,
    doneRow
  );
  backdrop.appendChild(panel);
  shadow.appendChild(backdrop);
  document.documentElement.appendChild(overlayHost);

  const close = () => {
    abortController?.abort();
    removeOverlay();
  };

  const setDoneState = (kind, message) => {
    doneRow.hidden = false;
    doneRow.classList.remove("done-error", "done-info");
    if (kind === "error") {
      doneRow.classList.add("done-error");
    } else if (kind === "info") {
      doneRow.classList.add("done-info");
    }
    doneText.textContent = message;
  };

  textArea.addEventListener("input", () => {
    countEl.textContent = String(textArea.value.length);
  });

  speedInput.addEventListener("input", () => {
    speedVal.textContent = `${speedInput.value} ms`;
  });

  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);
  doneClose.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      close();
    }
  });

  stopBtn.addEventListener("mousedown", (event) => event.preventDefault());
  stopBtn.addEventListener("click", () => abortController?.abort());

  typeBtn.addEventListener("click", async () => {
    const text = textArea.value;
    if (!text) {
      textArea.focus();
      return;
    }

    const delay = normalizeDelay(speedInput.value);

    btnRow.hidden = true;
    doneRow.hidden = true;
    progRow.hidden = false;
    totalEl.textContent = String(text.length);
    fillEl.style.width = "0%";
    progEl.textContent = "0";

    abortController?.abort();
    abortController = new AbortController();

    rememberTarget(targetElement);
    focusTarget(targetElement);

    const onProgress = (typed, total) => {
      const pct = total === 0 ? 0 : Math.round((typed / total) * 100);
      fillEl.style.width = `${pct}%`;
      progEl.textContent = String(typed);
    };

    try {
      const count = await typeText(
        targetElement,
        text,
        delay,
        abortController.signal,
        onProgress
      );
      progRow.hidden = true;
      setDoneState("success", `Done — typed ${count} characters.`);
    } catch (error) {
      progRow.hidden = true;
      if (error instanceof TypingAbortedError) {
        setDoneState("info", error.message);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        setDoneState("error", `Error: ${message}`);
      }
    }
  });

  setTimeout(() => textArea.focus(), 50);
}

function removeOverlay() {
  if (overlayHost) {
    overlayHost.remove();
    overlayHost = null;
  }
}

class TypingAbortedError extends Error {
  constructor(typed, total) {
    super(`Stopped after ${typed} of ${total} characters.`);
    this.name = "TypingAbortedError";
    this.typed = typed;
    this.total = total;
  }
}

async function typeText(target, text, delay, signal, onProgress) {
  let currentTarget = target;
  if (!currentTarget) {
    throw new Error("No target element. Focus or right-click a text field first.");
  }

  let typed = 0;
  const total = text.length;

  for (const char of text) {
    throwIfAborted(signal, typed, total);

    if (!currentTarget.isConnected) {
      const recoveredTarget = getRememberedTarget();
      if (!recoveredTarget || !recoveredTarget.isConnected) {
        throw new Error("The target field is no longer in the page.");
      }
      currentTarget = recoveredTarget;
    }

    const targetState = getTargetState(currentTarget);
    focusTarget(currentTarget);

    const inserted = typeOneChar(currentTarget, char, targetState);
    if (!inserted && !(targetState.isSingleLineInput && isNewline(char))) {
      throw new Error(`Could not insert character ${typed + 1}.`);
    }

    typed += 1;
    if (onProgress) {
      onProgress(typed, total);
    }

    if (delay > 0) {
      await sleep(delay, signal);
    } else if (typed % ZERO_DELAY_YIELD_INTERVAL === 0) {
      await sleep(0, signal);
    }
  }

  throwIfAborted(signal, typed, total);
  return typed;
}

function throwIfAborted(signal, typed, total) {
  if (signal?.aborted) {
    throw new TypingAbortedError(typed, total);
  }
}

function getTargetState(target) {
  const isInput =
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  const isEditable = target instanceof HTMLElement && target.isContentEditable;

  if (!isInput && !isEditable) {
    throw new Error("Target is not an editable field.");
  }

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    if (target.disabled) {
      throw new Error("Target field is disabled.");
    }

    if (target.readOnly) {
      throw new Error("Target field is read-only.");
    }
  }

  return {
    isInput,
    isEditable,
    isTextArea: target instanceof HTMLTextAreaElement,
    isSingleLineInput: target instanceof HTMLInputElement,
  };
}

function typeOneChar(target, char, targetState) {
  const eventData = getKeyboardEventData(char);

  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      ...eventData,
      bubbles: true,
      cancelable: true,
      composed: true,
    })
  );

  target.dispatchEvent(
    new KeyboardEvent("keypress", {
      ...eventData,
      charCode: char.charCodeAt(0),
      bubbles: true,
      cancelable: true,
      composed: true,
    })
  );

  let inserted = false;

  try {
    focusTarget(target);
    if (targetState.isEditable && isNewline(char)) {
      inserted = document.execCommand("insertLineBreak", false, null);
    } else if (!targetState.isSingleLineInput || !isNewline(char)) {
      inserted = document.execCommand("insertText", false, char);
    }
  } catch {
    inserted = false;
  }

  if (!inserted && targetState.isInput) {
    inserted = insertIntoTextControl(target, char, targetState);
  }

  if (!inserted && targetState.isEditable) {
    inserted = insertIntoContentEditable(target, char);
  }

  target.dispatchEvent(
    new KeyboardEvent("keyup", {
      ...eventData,
      bubbles: true,
      cancelable: true,
      composed: true,
    })
  );

  return inserted;
}

function getKeyboardEventData(char) {
  if (char === "\n" || char === "\r") {
    return { key: "Enter", code: "Enter", keyCode: 13, which: 13 };
  }

  if (char === "\t") {
    return { key: "Tab", code: "Tab", keyCode: 9, which: 9 };
  }

  if (char === " ") {
    return { key: " ", code: "Space", keyCode: 32, which: 32 };
  }

  if (/^[a-z]$/i.test(char)) {
    const upper = char.toUpperCase();
    const keyCode = upper.charCodeAt(0);
    return {
      key: char,
      code: `Key${upper}`,
      keyCode,
      which: keyCode,
    };
  }

  if (/^\d$/.test(char)) {
    const keyCode = char.charCodeAt(0);
    return {
      key: char,
      code: `Digit${char}`,
      keyCode,
      which: keyCode,
    };
  }

  return {
    key: char,
    code: "",
    keyCode: char.charCodeAt(0),
    which: char.charCodeAt(0),
  };
}

function insertIntoTextControl(target, char, targetState) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    return false;
  }

  if (targetState.isSingleLineInput && isNewline(char)) {
    return false;
  }

  const prototype =
    target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (!descriptor?.set) {
    return false;
  }

  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  const newValue = target.value.slice(0, start) + char + target.value.slice(end);
  descriptor.set.call(target, newValue);
  target.selectionStart = start + char.length;
  target.selectionEnd = start + char.length;

  target.dispatchEvent(
    new InputEvent("input", {
      data: char,
      inputType: isNewline(char) ? "insertLineBreak" : "insertText",
      bubbles: true,
      cancelable: false,
      composed: true,
    })
  );

  return true;
}

function insertIntoContentEditable(target, char) {
  if (!(target instanceof HTMLElement) || !target.isContentEditable) {
    return false;
  }

  const selection = ensureEditableSelection(target);
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();

  if (isNewline(char)) {
    const br = document.createElement("br");
    range.insertNode(br);
    range.setStartAfter(br);
  } else {
    const textNode = document.createTextNode(char);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
  }

  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);

  target.dispatchEvent(
    new InputEvent("input", {
      data: char,
      inputType: isNewline(char) ? "insertLineBreak" : "insertText",
      bubbles: true,
      cancelable: false,
      composed: true,
    })
  );

  return true;
}

function ensureEditableSelection(target) {
  const selection = window.getSelection();
  if (!selection) {
    return null;
  }

  if (
    selection.rangeCount > 0 &&
    target.contains(selection.anchorNode) &&
    target.contains(selection.focusNode)
  ) {
    return selection;
  }

  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

function focusTarget(target) {
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }

  lastTargetElement = target;
}

function isNewline(char) {
  return char === "\n" || char === "\r";
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

const OVERLAY_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .panel {
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
    width: 380px;
    max-width: 92vw;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: slideUp 0.2s ease;
  }

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h2 {
    font-size: 18px;
    font-weight: 700;
    color: #4a90d9;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 22px;
    cursor: pointer;
    color: #999;
    padding: 0 4px;
    line-height: 1;
  }

  .close-btn:hover { color: #333; }

  .notice {
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.4;
  }

  .notice.error {
    background: #fce8e6;
    color: #b3261e;
  }

  label {
    font-size: 13px;
    font-weight: 600;
    color: #444;
  }

  textarea {
    width: 100%;
    padding: 10px;
    border: 1.5px solid #ddd;
    border-radius: 8px;
    font-family: "SF Mono", "Fira Code", "Consolas", monospace;
    font-size: 13px;
    resize: vertical;
    background: #fafafa;
    color: #222;
    transition: border-color 0.15s;
  }

  textarea:focus {
    outline: none;
    border-color: #4a90d9;
    box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.15);
    background: #fff;
  }

  .char-count {
    font-size: 11px;
    color: #999;
    text-align: right;
    margin-top: -8px;
  }

  .speed-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .speed-row label { flex-shrink: 0; }
  .speed-row input[type="range"] { flex: 1; accent-color: #4a90d9; }
  .speed-row span { font-size: 12px; color: #666; min-width: 48px; }

  .btn-row, .progress-row, .done-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn {
    padding: 10px 18px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s, transform 0.1s;
  }

  .btn:active { transform: scale(0.97); }

  .primary {
    background: #4a90d9;
    color: #fff;
    flex: 1;
  }

  .primary:hover { background: #3a7bc8; }

  .secondary {
    background: #e8e8e8;
    color: #444;
  }

  .secondary:hover { background: #ddd; }

  .stop {
    background: #e74c3c;
    color: #fff;
    flex-shrink: 0;
  }

  .stop:hover { background: #c0392b; }

  .progress-row {
    flex-direction: column;
    gap: 8px;
  }

  .progress-bar {
    width: 100%;
    height: 6px;
    background: #eee;
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4a90d9, #67b8f7);
    border-radius: 3px;
    width: 0%;
    transition: width 0.1s linear;
  }

  .progress-text {
    font-size: 12px;
    color: #666;
    text-align: center;
  }

  .done-row {
    justify-content: space-between;
    background: #e6f4ea;
    padding: 10px 14px;
    border-radius: 8px;
  }

  .done-row.done-info {
    background: #e8f0fe;
  }

  .done-row.done-error {
    background: #fce8e6;
  }

  .done-text {
    font-size: 13px;
    color: #1e8e3e;
    font-weight: 500;
  }

  .done-row.done-info .done-text {
    color: #1a73e8;
  }

  .done-row.done-error .done-text {
    color: #b3261e;
  }
`;
