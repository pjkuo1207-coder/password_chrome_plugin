/**
 * @jest-environment jsdom
 */
const HISTORY_KEY = 'smartpass_history';

function mockChromeStorage(initial = {}) {
  const store = { ...initial };
  global.chrome = {
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
  };
  return store;
}

function mockClipboard({ readTextReturns } = {}) {
  const clipboard = {
    writeText: jest.fn().mockResolvedValue(undefined),
    readText: jest.fn().mockResolvedValue(readTextReturns),
  };
  Object.defineProperty(global.navigator, 'clipboard', {
    value: clipboard,
    configurable: true,
  });
  return clipboard;
}

const {
  addToHistory,
  getHistory,
  clearHistory,
  copyToClipboardWithAutoClear,
  HISTORY_LIMIT,
} = require('../src/core/storage');

describe('history', () => {
  it('prepends new passwords, newest first, capped at HISTORY_LIMIT', async () => {
    mockChromeStorage();
    for (let i = 0; i < HISTORY_LIMIT + 2; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await addToHistory(`pw-${i}`);
    }
    const history = await getHistory();
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history.map((h) => h.password)).toEqual(['pw-6', 'pw-5', 'pw-4', 'pw-3', 'pw-2']);
  });

  it('getHistory returns an empty array when nothing is stored', async () => {
    mockChromeStorage();
    expect(await getHistory()).toEqual([]);
  });

  it('clearHistory removes the stored entries', async () => {
    mockChromeStorage({ [HISTORY_KEY]: [{ password: 'x', createdAt: 1 }] });
    await clearHistory();
    expect(await getHistory()).toEqual([]);
  });
});

describe('copyToClipboardWithAutoClear', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes the password immediately, then clears it after the delay', async () => {
    const clipboard = mockClipboard({ readTextReturns: 'secret' });

    await copyToClipboardWithAutoClear('secret', 30000);
    expect(clipboard.writeText).toHaveBeenCalledWith('secret');

    await jest.advanceTimersByTimeAsync(30000);
    expect(clipboard.writeText).toHaveBeenLastCalledWith('');
  });

  it('does not clear the clipboard if its content changed in the meantime', async () => {
    const clipboard = mockClipboard({ readTextReturns: 'something-else-the-user-copied' });

    await copyToClipboardWithAutoClear('secret', 30000);
    await jest.advanceTimersByTimeAsync(30000);
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
  });
});
