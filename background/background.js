"use strict";

const lastEditableFrameByTab = new Map();

// Create context menu item that ONLY appears on editable fields (inputs, textareas, contenteditable)
browser.menus.create({
  id: "char-paster-type",
  title: "Char Paster — Type text here",
  contexts: ["editable"],
  icons: {
    "16": "icons/icon-48.svg",
    "32": "icons/icon-96.svg",
  },
});

browser.menus.create({
  id: "char-paster-clipboard",
  parentId: "char-paster-type",
  title: "Paste from clipboard (char by char)",
  contexts: ["editable"],
});

browser.menus.create({
  id: "char-paster-custom",
  parentId: "char-paster-type",
  title: "Type custom text...",
  contexts: ["editable"],
});

// When a menu item is clicked, tell the content script in the correct tab + frame
browser.menus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  const frameId = info.frameId ?? 0;
  lastEditableFrameByTab.set(tab.id, frameId);

  if (info.menuItemId === "char-paster-clipboard") {
    await pasteClipboardIntoTab(tab.id, frameId);
    return;
  }

  if (info.menuItemId === "char-paster-custom") {
    await browser.tabs.sendMessage(tab.id, { action: "showOverlay" }, { frameId });
  }
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.action === "rememberEditableTarget") {
    if (sender.tab?.id) {
      lastEditableFrameByTab.set(sender.tab.id, sender.frameId ?? 0);
    }
    return Promise.resolve({ ok: true });
  }

  if (message.action === "typeTextInTab") {
    return sendToRememberedFrame(message.tabId, {
      action: "typeText",
      text: message.text,
      delay: message.delay,
    });
  }

  if (message.action === "stopTypingInTab") {
    return sendToRememberedFrame(message.tabId, { action: "stopTyping" });
  }

  return undefined;
});

async function pasteClipboardIntoTab(tabId, frameId) {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      await browser.tabs.sendMessage(
        tabId,
        {
          action: "showOverlay",
          initialText: "",
          errorMessage: "Clipboard is empty.",
        },
        { frameId }
      );
      return;
    }

    const response = await browser.tabs.sendMessage(
      tabId,
      {
        action: "typeText",
        text,
        delay: 10,
      },
      { frameId }
    );

    if (!response?.success) {
      await browser.tabs.sendMessage(
        tabId,
        {
          action: "showOverlay",
          initialText: text,
          errorMessage: response?.error || "Could not type into that field directly.",
        },
        { frameId }
      );
    }
  } catch (error) {
    await browser.tabs.sendMessage(
      tabId,
      {
        action: "showOverlay",
        initialText: "",
        errorMessage: "Clipboard access was blocked. Paste into the overlay instead.",
      },
      { frameId }
    );
  }
}

async function sendToRememberedFrame(tabId, message) {
  if (typeof tabId !== "number") {
    return { success: false, error: "No active tab found." };
  }

  const frameId = lastEditableFrameByTab.get(tabId);
  if (typeof frameId !== "number") {
    return {
      success: false,
      error: "Focus or right-click a text field on the page first.",
    };
  }

  try {
    return await browser.tabs.sendMessage(tabId, message, { frameId });
  } catch (error) {
    return {
      success: false,
      error: "Could not reach the selected text field. Focus it again and retry.",
    };
  }
}
