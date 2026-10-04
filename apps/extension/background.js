chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  const { miraMicGranted, miraMicPrompted } = await chrome.storage.local.get([
    "miraMicGranted",
    "miraMicPrompted",
  ]);
  if (!miraMicGranted && !miraMicPrompted) {
    await chrome.storage.local.set({ miraMicPrompted: true });
    chrome.tabs.create({ url: chrome.runtime.getURL("request-mic.html") });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch {
    /* setPanelBehavior handles most builds */
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "mira:ensure-mic") {
    void (async () => {
      const { miraMicGranted } = await chrome.storage.local.get(["miraMicGranted"]);
      if (miraMicGranted) {
        sendResponse({ ok: true });
        return;
      }
      await chrome.tabs.create({ url: chrome.runtime.getURL("request-mic.html") });
      sendResponse({ ok: false, reason: "mic-needed" });
    })();
    return true;
  }

  if (message?.type === "mira:capture-visible-tab") {
    void (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
          format: "jpeg",
          quality: 80,
        });
        const url =
          tab?.url && (tab.url.startsWith("http://") || tab.url.startsWith("https://"))
            ? tab.url
            : undefined;
        sendResponse({ ok: true, dataUrl, url });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : "Could not capture tab",
        });
      }
    })();
    return true;
  }

  if (message?.type === "mira:open-tab" && typeof message.url === "string") {
    try {
      const url = new URL(message.url);
      if (url.protocol === "http:" || url.protocol === "https:") {
        chrome.tabs.create({ url: url.href });
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "Unsupported URL" });
      }
    } catch {
      sendResponse({ ok: false, error: "Invalid URL" });
    }
    return false;
  }

  if (message?.type === "mira:highlight" && message.rect) {
    void (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !tab.url || !(tab.url.startsWith("http://") || tab.url.startsWith("https://"))) {
          sendResponse({ ok: false, error: "No highlightable tab" });
          return;
        }
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["highlight-overlay.js"],
        });
        await chrome.tabs.sendMessage(tab.id, { type: "mira:highlight", rect: message.rect });
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : "Could not highlight tab",
        });
      }
    })();
    return true;
  }

  return false;
});
