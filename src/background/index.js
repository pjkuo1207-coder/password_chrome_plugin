// Service worker (Manifest V3). Hosts the two triggers that act on a page
// without the popup being open: the right-click context menu and the
// "generate-and-copy" keyboard shortcut. Both delegate the actual DOM work
// to content/index.js, injected on demand — see that file's header comment
// for why it's not statically declared in manifest.json.

const { generateConstrainedPassword } = require('../core/constrainedGenerator');
const { addToHistory } = require('../core/storage');
const { injectContentScript } = require('../core/inject');

const CONTEXT_MENU_FILL_ID = 'smartpass-fill';
const CONTEXT_MENU_COPY_ID = 'smartpass-copy';

function createContextMenus() {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_FILL_ID,
    title: 'SmartPass：產生密碼並填入此欄位',
    contexts: ['editable'],
  });
  chrome.contextMenus.create({
    id: CONTEXT_MENU_COPY_ID,
    title: 'SmartPass：產生密碼並複製',
    contexts: ['page', 'selection', 'editable'],
  });
}

// Content script must already be injected before this is called. A missing
// or unresponsive listener (no password field ever detected, tab navigated
// away) is a normal outcome here, not an error — the caller just gets no
// constraints back and generates a plain password instead.
async function detectConstraints(tabId) {
  const response = await chrome.tabs
    .sendMessage(tabId, { type: 'SMARTPASS_DETECT_RULES' })
    .catch(() => null);
  return response?.rules?.[0] || null;
}

async function generatePasswordForTab(tabId) {
  const constraints = await detectConstraints(tabId);
  return generateConstrainedPassword({}, constraints);
}

async function generateAndFill(tabId) {
  await injectContentScript(tabId);
  const password = await generatePasswordForTab(tabId);
  await addToHistory(password);
  return chrome.tabs.sendMessage(tabId, { type: 'SMARTPASS_FILL_PASSWORD', password });
}

async function generateAndCopy(tabId) {
  await injectContentScript(tabId);
  const password = await generatePasswordForTab(tabId);
  await addToHistory(password);
  return chrome.tabs.sendMessage(tabId, { type: 'SMARTPASS_COPY_PASSWORD', password });
}

// Guarded so this file can be `require`d from tests without a chrome global.
if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(createContextMenus);

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return;
    // Injection legitimately fails on restricted pages (chrome://, the Web
    // Store, PDF viewer); there's no popup open here to surface an error to,
    // so just log for debugging rather than throwing from an event handler.
    if (info.menuItemId === CONTEXT_MENU_FILL_ID) {
      await generateAndFill(tab.id).catch((err) => console.warn('[SmartPass] fill failed', err));
    } else if (info.menuItemId === CONTEXT_MENU_COPY_ID) {
      await generateAndCopy(tab.id).catch((err) => console.warn('[SmartPass] copy failed', err));
    }
  });

  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'generate-and-copy') return;
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) return;
    await generateAndCopy(activeTab.id).catch((err) => console.warn('[SmartPass] copy failed', err));
  });
}

module.exports = {
  CONTEXT_MENU_FILL_ID,
  CONTEXT_MENU_COPY_ID,
  createContextMenus,
  generateAndFill,
  generateAndCopy,
};
