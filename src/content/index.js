// Injected on-demand via chrome.scripting.executeScript (activeTab + scripting
// permissions) rather than declared statically in manifest.json — this keeps
// the extension off every page by default and avoids requesting <all_urls>.

const { findPasswordInputs, parseInputConstraints } = require('../core/domParser');

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SMARTPASS_DETECT_RULES') {
    sendResponse({ rules: detectPasswordFieldRules() });
  } else if (message?.type === 'SMARTPASS_FILL_PASSWORD') {
    sendResponse({ filled: fillFocusedPasswordField(message.password) });
  }
  return true;
});
