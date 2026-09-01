/**
 * Injects the content script into a tab. Shared by the popup and the
 * background service worker so the injection call shape only needs to
 * change in one place. Safe to call more than once per tab — content/
 * index.js guards its own listener registration against duplicate
 * injection (see the __smartpassLoaded flag there).
 * @param {number} tabId
 */
async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}

module.exports = { injectContentScript };
