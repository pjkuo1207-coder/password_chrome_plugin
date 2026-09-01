/**
 * @jest-environment jsdom
 */

function setupDom() {
  document.body.innerHTML = `
    <input type="text" id="passwordOutput" />
    <button id="copyBtn"></button>
    <p id="detectStatus" hidden></p>
    <input type="radio" name="mode" value="password" checked />
    <input type="radio" name="mode" value="pronounceable" />
    <input type="radio" name="mode" value="passphrase" />
    <div id="passwordOptions"></div>
    <input type="range" id="lengthRange" min="8" max="64" value="16" />
    <span id="lengthValue"></span>
    <input type="checkbox" id="optUppercase" checked />
    <input type="checkbox" id="optLowercase" checked />
    <input type="checkbox" id="optNumbers" checked />
    <input type="checkbox" id="optSymbols" checked />
    <input type="checkbox" id="optExcludeAmbiguous" />
    <button id="generateBtn"></button>
    <button id="fillBtn" hidden></button>
    <ul id="historyList"></ul>
    <button id="clearHistoryBtn"></button>
  `;
}

function mockChrome({ rules = [], sendMessageImpl } = {}) {
  const store = {};
  const chrome = {
    storage: {
      local: {
        get: jest.fn((key) => Promise.resolve({ [key]: store[key] })),
        set: jest.fn((obj) => {
          Object.assign(store, obj);
          return Promise.resolve();
        }),
        remove: jest.fn((key) => {
          delete store[key];
          return Promise.resolve();
        }),
      },
    },
    tabs: {
      query: jest.fn().mockResolvedValue([{ id: 1 }]),
      sendMessage: jest.fn(
        sendMessageImpl ||
          ((tabId, message) => {
            if (message.type === 'SMARTPASS_DETECT_RULES') return Promise.resolve({ rules });
            if (message.type === 'SMARTPASS_FILL_PASSWORD') return Promise.resolve({ filled: true });
            return Promise.resolve({});
          })
      ),
    },
    scripting: {
      executeScript: jest.fn().mockResolvedValue(undefined),
    },
  };
  global.chrome = chrome;
  return chrome;
}

// detectPageRules() chains several promise-based awaits (tabs.query,
// executeScript, sendMessage, then generate()'s own addToHistory().then(...))
// before the DOM settles — a handful of microtask ticks drains all of them.
async function flush() {
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

describe('popup', () => {
  beforeEach(() => {
    jest.resetModules();
    setupDom();
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('generates exactly once and writes exactly one history entry when no field is detected', async () => {
    const chrome = mockChrome({ rules: [] });
    require('../src/popup/popup');
    await flush();

    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(document.getElementById('passwordOutput').value).toHaveLength(16);
    expect(document.getElementById('fillBtn').hidden).toBe(true);
  });

  it('generates exactly once, applying detected constraints, when a password field is found', async () => {
    const chrome = mockChrome({ rules: [{ minLength: null, maxLength: 6, pattern: null }] });
    require('../src/popup/popup');
    await flush();

    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(document.getElementById('passwordOutput').value.length).toBeLessThanOrEqual(6);
    expect(document.getElementById('fillBtn').hidden).toBe(false);
    expect(document.getElementById('detectStatus').hidden).toBe(false);
  });

  it('shows feedback when Fill field can no longer find the password field', async () => {
    mockChrome({
      sendMessageImpl: (tabId, message) => {
        if (message.type === 'SMARTPASS_DETECT_RULES') {
          return Promise.resolve({ rules: [{ minLength: null, maxLength: 20, pattern: null }] });
        }
        if (message.type === 'SMARTPASS_FILL_PASSWORD') {
          return Promise.resolve({ filled: false });
        }
        return Promise.resolve({});
      },
    });
    require('../src/popup/popup');
    await flush();

    document.getElementById('fillBtn').dispatchEvent(new Event('click'));
    await flush();

    const status = document.getElementById('detectStatus');
    expect(status.hidden).toBe(false);
    expect(status.textContent).toMatch(/could not find the password field/i);
  });

  it('routes Copy through the content script (so the auto-clear timer outlives the popup) and does not double-write history', async () => {
    const chrome = mockChrome({
      sendMessageImpl: (tabId, message) => {
        if (message.type === 'SMARTPASS_DETECT_RULES') return Promise.resolve({ rules: [] });
        if (message.type === 'SMARTPASS_COPY_PASSWORD') return Promise.resolve({ copied: true });
        return Promise.resolve({});
      },
    });
    require('../src/popup/popup');
    await flush();

    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);

    document.getElementById('copyBtn').dispatchEvent(new Event('click'));
    await flush();

    const copyCall = chrome.tabs.sendMessage.mock.calls.find(
      ([, message]) => message.type === 'SMARTPASS_COPY_PASSWORD'
    );
    expect(copyCall).toBeDefined();
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it('shows a friendly message instead of crashing when every character type is disabled', async () => {
    mockChrome({ rules: [] });
    require('../src/popup/popup');
    await flush();

    const previousValue = document.getElementById('passwordOutput').value;
    ['optUppercase', 'optLowercase', 'optNumbers', 'optSymbols'].forEach((id) => {
      document.getElementById(id).checked = false;
    });
    document.getElementById('generateBtn').dispatchEvent(new Event('click'));
    await flush();

    expect(document.getElementById('passwordOutput').value).toBe(previousValue);
    const status = document.getElementById('detectStatus');
    expect(status.hidden).toBe(false);
    expect(status.textContent).toMatch(/enable at least one character type/i);
  });
});
