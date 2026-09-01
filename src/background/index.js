// Service worker (Manifest V3). Kept intentionally thin: SmartPass does all
// generation/storage logic in the popup, close to the UI that triggers it.
// This worker exists to host cross-tab coordination as later phases need it
// (e.g. context-menu password insertion).

chrome.runtime.onInstalled.addListener(() => {
  // eslint-disable-next-line no-console
  console.log('[SmartPass] installed');
});
