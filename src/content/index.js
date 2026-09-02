// Injected on-demand via chrome.scripting.executeScript (activeTab + scripting
// permissions) rather than declared statically in manifest.json — this keeps
// the extension off every page by default and avoids requesting <all_urls>.

const { findPasswordInputs, parseInputConstraints } = require('../core/domParser');
const { copyToClipboardWithAutoClear } = require('../core/storage');

// Detection must agree with fill about which *password* field it's talking
// about — a page can have more than one (e.g. "current password" and "new
// password", each with different minlength/maxlength/pattern) — so this
// stays password-specific: it's only ever used to size a generated password
// to match a site's own validation.
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

// Fill, unlike detection, isn't password-specific — the context menu's
// "fill this field" entry (contexts: ['editable']) is meant to work on any
// text-like field the user right-clicked, e.g. a "confirm password" input a
// site left as type="text", or a plain text field the user wants a random
// string in. Only falls back to searching for a password field when nothing
// fillable is actually focused (e.g. triggered without a specific target).
const FILLABLE_INPUT_TYPES = new Set(['text', 'password', 'email', 'search', 'tel', 'url', 'number']);

function isFillableField(el) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && FILLABLE_INPUT_TYPES.has((el.type || 'text').toLowerCase());
}

function getFillTarget() {
  const active = document.activeElement;
  if (isFillableField(active)) return active;
  return findPasswordInputs(document)[0] || null;
}

function fillFocusedPasswordField(value) {
  const target = getFillTarget();
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
