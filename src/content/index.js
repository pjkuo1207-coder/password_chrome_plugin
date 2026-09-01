// Injected on-demand via chrome.scripting.executeScript (activeTab + scripting
// permissions) rather than declared statically in manifest.json — this keeps
// the extension off every page by default and avoids requesting <all_urls>.

const { findPasswordInputs, parseInputConstraints } = require('../core/domParser');
const { copyToClipboardWithAutoClear } = require('../core/storage');

// Detection and fill must agree on which field they're talking about — a
// page can have more than one password field (e.g. "current password" and
// "new password", each with different minlength/maxlength/pattern), and
// detecting the first one's rules while filling whichever field happens to
// be focused would silently apply the wrong field's constraints.
function getTargetPasswordField() {
  const active = document.activeElement;
  if (active && active.tagName === 'INPUT' && active.type === 'password') {
    return active;
  }
  return findPasswordInputs(document)[0] || null;
}

function detectPasswordFieldRules() {
  const target = getTargetPasswordField();
  return target ? [parseInputConstraints(target)] : [];
}

function fillFocusedPasswordField(value) {
  const target = getTargetPasswordField();
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

  // History is recorded once, by whichever code actually generated the
  // password (popup.js's generate(), or background/index.js's
  // generateAndFill/generateAndCopy) — not here. A fill/copy action re-uses
  // an already-generated (and already-recorded) password, so recording it
  // again here would double-write the 5-slot history for one generation.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'SMARTPASS_DETECT_RULES') {
      sendResponse({ rules: detectPasswordFieldRules() });
    } else if (message?.type === 'SMARTPASS_FILL_PASSWORD') {
      sendResponse({ filled: fillFocusedPasswordField(message.password) });
    } else if (message?.type === 'SMARTPASS_COPY_PASSWORD') {
      copyToClipboardWithAutoClear(message.password)
        .then(() => sendResponse({ copied: true }))
        .catch(() => sendResponse({ copied: false }));
      return true; // keep the message channel open for the async response
    }
    return true;
  });
}

module.exports = { detectPasswordFieldRules, fillFocusedPasswordField };
