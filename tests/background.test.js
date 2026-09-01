function createChromeMock() {
  const listeners = {};
  const chrome = {
    runtime: {
      onInstalled: {
        addListener: jest.fn((fn) => {
          listeners.installed = fn;
        }),
      },
    },
    contextMenus: {
      create: jest.fn(),
      onClicked: {
        addListener: jest.fn((fn) => {
          listeners.contextMenuClicked = fn;
        }),
      },
    },
    scripting: {
      executeScript: jest.fn().mockResolvedValue(undefined),
    },
    tabs: {
      sendMessage: jest.fn().mockResolvedValue({}),
      query: jest.fn().mockResolvedValue([{ id: 42 }]),
    },
    commands: {
      onCommand: {
        addListener: jest.fn((fn) => {
          listeners.command = fn;
        }),
      },
    },
  };
  return { chrome, listeners };
}

describe('background', () => {
  let chrome;
  let listeners;
  let bg;

  beforeEach(() => {
    jest.resetModules();
    ({ chrome, listeners } = createChromeMock());
    global.chrome = chrome;
    bg = require('../src/background/index');
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('registers both context menu items on install', () => {
    listeners.installed();
    expect(chrome.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: bg.CONTEXT_MENU_FILL_ID, contexts: ['editable'] })
    );
    expect(chrome.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: bg.CONTEXT_MENU_COPY_ID })
    );
  });

  it('injects the content script and sends a fill message for the fill menu item', async () => {
    await listeners.contextMenuClicked({ menuItemId: bg.CONTEXT_MENU_FILL_ID }, { id: 7 });

    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['content.js'],
    });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ type: 'SMARTPASS_FILL_PASSWORD' })
    );
  });

  it('injects the content script and sends a copy message for the copy menu item', async () => {
    await listeners.contextMenuClicked({ menuItemId: bg.CONTEXT_MENU_COPY_ID }, { id: 9 });

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ type: 'SMARTPASS_COPY_PASSWORD' })
    );
  });

  it('ignores context menu clicks with no tab id (e.g. restricted pages)', async () => {
    await listeners.contextMenuClicked({ menuItemId: bg.CONTEXT_MENU_FILL_ID }, {});
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('detects DOM constraints and applies them to the generated fill password', async () => {
    chrome.tabs.sendMessage = jest.fn((tabId, message) => {
      if (message.type === 'SMARTPASS_DETECT_RULES') {
        return Promise.resolve({ rules: [{ minLength: null, maxLength: 6, pattern: null }] });
      }
      return Promise.resolve({});
    });

    await listeners.contextMenuClicked({ menuItemId: bg.CONTEXT_MENU_FILL_ID }, { id: 3 });

    const fillCall = chrome.tabs.sendMessage.mock.calls.find(
      ([, message]) => message.type === 'SMARTPASS_FILL_PASSWORD'
    );
    expect(fillCall[1].password.length).toBeLessThanOrEqual(6);
  });

  it('falls back to a plain password if detecting constraints fails', async () => {
    chrome.tabs.sendMessage = jest.fn((tabId, message) => {
      if (message.type === 'SMARTPASS_DETECT_RULES') {
        return Promise.reject(new Error('no listener on this tab'));
      }
      return Promise.resolve({});
    });

    await listeners.contextMenuClicked({ menuItemId: bg.CONTEXT_MENU_COPY_ID }, { id: 5 });

    const copyCall = chrome.tabs.sendMessage.mock.calls.find(
      ([, message]) => message.type === 'SMARTPASS_COPY_PASSWORD'
    );
    expect(copyCall[1].password.length).toBeGreaterThan(0);
  });

  it('swallows injection/messaging failures instead of throwing from the handler', async () => {
    chrome.scripting.executeScript.mockRejectedValueOnce(new Error('cannot access chrome://'));
    await expect(
      listeners.contextMenuClicked({ menuItemId: bg.CONTEXT_MENU_FILL_ID }, { id: 1 })
    ).resolves.toBeUndefined();
  });

  it('generates and copies on the active tab for the generate-and-copy hotkey', async () => {
    await listeners.command('generate-and-copy');

    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ type: 'SMARTPASS_COPY_PASSWORD' })
    );
  });

  it('ignores commands other than generate-and-copy', async () => {
    await listeners.command('_execute_action');
    expect(chrome.tabs.query).not.toHaveBeenCalled();
  });
});
