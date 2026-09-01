const { generatePronounceable, generatePassphrase } = require('../core/generator');
const {
  addToHistory,
  getHistory,
  clearHistory,
  copyToClipboardWithAutoClear,
} = require('../core/storage');
const {
  generateConstrainedPassword,
  describeDetectedField,
} = require('../core/constrainedGenerator');
const { injectContentScript } = require('../core/inject');

const els = {
  output: document.getElementById('passwordOutput'),
  copyBtn: document.getElementById('copyBtn'),
  detectStatus: document.getElementById('detectStatus'),
  generateBtn: document.getElementById('generateBtn'),
  fillBtn: document.getElementById('fillBtn'),
  modeRadios: document.querySelectorAll('input[name="mode"]'),
  options: document.getElementById('passwordOptions'),
  lengthRange: document.getElementById('lengthRange'),
  lengthValue: document.getElementById('lengthValue'),
  optUppercase: document.getElementById('optUppercase'),
  optLowercase: document.getElementById('optLowercase'),
  optNumbers: document.getElementById('optNumbers'),
  optSymbols: document.getElementById('optSymbols'),
  optExcludeAmbiguous: document.getElementById('optExcludeAmbiguous'),
  historyList: document.getElementById('historyList'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
};

// Populated by detectPageRules() when the active tab has a password field.
// Only used in 'password' mode — pronounceable/passphrase output has a
// different, non-charset structure that constraint-fitting doesn't map onto.
let detectedConstraints = null;
let activeTabId = null;

function currentMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function generate() {
  const mode = currentMode();
  let value;

  if (mode === 'pronounceable') {
    value = generatePronounceable();
  } else if (mode === 'passphrase') {
    value = generatePassphrase();
  } else {
    const baseOptions = {
      length: Number(els.lengthRange.value),
      uppercase: els.optUppercase.checked,
      lowercase: els.optLowercase.checked,
      numbers: els.optNumbers.checked,
      symbols: els.optSymbols.checked,
      excludeAmbiguous: els.optExcludeAmbiguous.checked,
    };
    try {
      value = generateConstrainedPassword(baseOptions, detectedConstraints);
    } catch {
      // Only reachable when baseOptions itself is invalid — the user
      // unchecked every character-type checkbox. Leave the previous output
      // and history alone rather than clearing them.
      setDetectStatus('Enable at least one character type (uppercase, lowercase, numbers, or symbols).');
      return;
    }
  }

  els.output.value = value;
  addToHistory(value).then(renderHistory);
}

async function renderHistory() {
  const history = await getHistory();
  els.historyList.innerHTML = '';
  history.forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = entry.password;
    els.historyList.appendChild(li);
  });
}

function setDetectStatus(text) {
  if (text) {
    els.detectStatus.textContent = text;
    els.detectStatus.hidden = false;
  } else {
    els.detectStatus.hidden = true;
  }
}

// Looks for a password field on the active tab and, if found, tightens the
// 'password' mode options to fit its minlength/maxlength/pattern so the
// generated value won't be rejected by the site's own validation. Always
// ends by calling generate() exactly once, whichever way detection goes —
// callers must not also call generate() themselves.
async function detectPageRules() {
  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.scripting) {
    generate();
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      generate();
      return;
    }
    activeTabId = tab.id;

    await injectContentScript(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SMARTPASS_DETECT_RULES' });
    const rules = response?.rules || [];

    if (rules.length === 0) {
      detectedConstraints = null;
      els.fillBtn.hidden = true;
      setDetectStatus(null);
    } else {
      detectedConstraints = rules[0];
      els.fillBtn.hidden = false;
      setDetectStatus(describeDetectedField(rules[0]));
    }
  } catch {
    // Injection/messaging fails on restricted pages (chrome://, the Web
    // Store, PDF viewer) — that's expected, just fall back to manual mode.
    detectedConstraints = null;
    els.fillBtn.hidden = true;
    setDetectStatus(null);
  }

  generate();
}

els.generateBtn.addEventListener('click', generate);

els.copyBtn.addEventListener('click', async () => {
  if (!els.output.value) return;

  // Route the copy through the content script when possible: its JS
  // context lives with the tab, not the popup, so the 30s auto-clear timer
  // survives the popup closing — which Chrome does the moment the user
  // clicks away, i.e. almost immediately after copying to go paste it
  // somewhere. A setTimeout scheduled in the popup's own context (the
  // fallback below) would simply never fire in that — the common — case.
  if (activeTabId) {
    try {
      await injectContentScript(activeTabId);
      const response = await chrome.tabs.sendMessage(activeTabId, {
        type: 'SMARTPASS_COPY_PASSWORD',
        password: els.output.value,
      });
      if (response?.copied) return;
    } catch {
      // Falls through to the direct-write fallback below.
    }
  }

  try {
    await copyToClipboardWithAutoClear(els.output.value);
  } catch {
    setDetectStatus('Could not copy to the clipboard — try selecting and copying the text manually.');
  }
});

els.fillBtn.addEventListener('click', async () => {
  if (!activeTabId || !els.output.value) return;
  try {
    const response = await chrome.tabs.sendMessage(activeTabId, {
      type: 'SMARTPASS_FILL_PASSWORD',
      password: els.output.value,
    });
    if (!response?.filled) {
      setDetectStatus('Could not find the password field anymore — try Generate again, or copy it manually.');
    }
  } catch {
    setDetectStatus('Could not reach the page to fill the field — try copying it manually instead.');
  }
});

els.lengthRange.addEventListener('input', () => {
  els.lengthValue.textContent = els.lengthRange.value;
});

els.modeRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    els.options.style.display = currentMode() === 'password' ? 'flex' : 'none';
  });
});

els.clearHistoryBtn.addEventListener('click', () => {
  clearHistory().then(renderHistory);
});

renderHistory();
detectPageRules();
