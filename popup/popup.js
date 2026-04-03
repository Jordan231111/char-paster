"use strict";

const textInput = document.getElementById("text-input");
const speedSlider = document.getElementById("speed");
const speedVal = document.getElementById("speed-val");
const typeBtn = document.getElementById("type-btn");
const stopBtn = document.getElementById("stop-btn");
const statusEl = document.getElementById("status");

speedSlider.addEventListener("input", () => {
  speedVal.textContent = `${speedSlider.value} ms`;
});

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
  statusEl.hidden = false;
}

function setTyping(active) {
  typeBtn.disabled = active;
  stopBtn.disabled = !active;
  textInput.disabled = active;
  speedSlider.disabled = active;
}

typeBtn.addEventListener("click", async () => {
  const text = textInput.value;
  if (!text) {
    showStatus("Nothing to type.", "error");
    return;
  }

  const delay = parseInt(speedSlider.value, 10);

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showStatus("No active tab found.", "error");
      return;
    }

    setTyping(true);
    showStatus(`Typing ${text.length} characters...`, "info");

    const response = await browser.runtime.sendMessage({
      action: "typeTextInTab",
      tabId: tab.id,
      text,
      delay,
    });

    if (response?.success) {
      showStatus(`Done — typed ${response.count} characters.`, "success");
    } else if (response?.aborted) {
      showStatus(response.error, "info");
    } else {
      showStatus(response?.error || "Failed to type text.", "error");
    }
  } catch (err) {
    showStatus(`Error: ${err.message}`, "error");
  } finally {
    setTyping(false);
  }
});

stopBtn.addEventListener("click", async () => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await browser.runtime.sendMessage({
        action: "stopTypingInTab",
        tabId: tab.id,
      });
    }
  } catch {
    // tab may have closed
  }
  showStatus("Stopped.", "info");
  setTyping(false);
});
