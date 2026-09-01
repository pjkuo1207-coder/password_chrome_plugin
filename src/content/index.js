// Injected on-demand via chrome.scripting.executeScript (activeTab + scripting
// permissions) rather than declared statically in manifest.json — this keeps
// the extension off every page by default and avoids requesting <all_urls>.

const { findPasswordInputs, parseInputConstraints } = require('../core/domParser');
const { addToHistory, copyToClipboardWithAutoClear } = require('../core/storage');

function detectPasswordFieldRules() {
  return findPasswordInputs(document).map((el) => parseInputConstraints(el));
}

function fillFocusedPasswordField(value) {
  const active = document.activeElement;
  const target =
    active && active.tagName === 'INPUT' && active.type === 'password'
      ? active
      : findPasswordInputs(document)[0];

  if (!target) return false;

  target.value = value;
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// A page can only ever be injected with one live copy of this listener.
// chrome.scripting.executeScript re-injects (and re-runs top-level code)
// every time it's called, so without this guard each popup open, hotkey
// press, or context-menu click on the same tab would register another
// onMessage listener and every future message would be handled N times.
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage && !window.__smartpassLoaded) {
  window.__smartpassLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'SMARTPASS_DETECT_RULES') {
      sendResponse({ rules: detectPasswordFieldRules() });
    } else if (message?.type === 'SMARTPASS_FILL_PASSWORD') {
      const filled = fillFocusedPasswordField(message.password);
      if (filled) addToHistory(message.password);
      sendResponse({ filled });
    } else if (message?.type === 'SMARTPASS_COPY_PASSWORD') {
      Promise.all([
        copyToClipboardWithAutoClear(message.password),
        addToHistory(message.password),
      ])
        .then(() => sendResponse({ copied: true }))
        .catch(() => sendResponse({ copied: false }));
      return true; // keep the message channel open for the async response
    }
    return true;
  });
}

module.exports = { detectPasswordFieldRules, fillFocusedPasswordField };
