const HISTORY_KEY = 'smartpass_history';
const HISTORY_LIMIT = 5;
const CLIPBOARD_CLEAR_MS = 30000;

/**
 * Prepends a generated password to local history, capped at HISTORY_LIMIT entries.
 * Stored purely in chrome.storage.local — never synced, never sent over the network.
 * @param {string} password
 * @returns {Promise<Array<{password: string, createdAt: number}>>} the updated history
 */
async function addToHistory(password) {
  const { [HISTORY_KEY]: history = [] } = await chrome.storage.local.get(HISTORY_KEY);
  const updated = [{ password, createdAt: Date.now() }, ...history].slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ [HISTORY_KEY]: updated });
  return updated;
}

/**
 * @returns {Promise<Array<{password: string, createdAt: number}>>}
 */
async function getHistory() {
  const { [HISTORY_KEY]: history = [] } = await chrome.storage.local.get(HISTORY_KEY);
  return history;
}

async function clearHistory() {
  await chrome.storage.local.remove(HISTORY_KEY);
}

/**
 * Copies text to the clipboard and schedules it to be overwritten with an
 * empty string after a delay, so a generated password doesn't linger for
 * other apps to read indefinitely.
 * @param {string} text
 * @param {number} [clearAfterMs=CLIPBOARD_CLEAR_MS]
 * @returns {Promise<void>}
 */
async function copyToClipboardWithAutoClear(text, clearAfterMs = CLIPBOARD_CLEAR_MS) {
  await navigator.clipboard.writeText(text);
  setTimeout(async () => {
    try {
      const current = await navigator.clipboard.readText();
      if (current === text) {
        await navigator.clipboard.writeText('');
      }
    } catch {
      // Clipboard may be unreadable (permissions/focus) — nothing further to clean up.
    }
  }, clearAfterMs);
}

module.exports = {
  addToHistory,
  getHistory,
  clearHistory,
  copyToClipboardWithAutoClear,
  HISTORY_LIMIT,
  CLIPBOARD_CLEAR_MS,
};
