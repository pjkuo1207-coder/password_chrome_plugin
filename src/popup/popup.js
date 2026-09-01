const {
  generatePassword,
  generatePronounceable,
  generatePassphrase,
} = require('../core/generator');
const {
  addToHistory,
  getHistory,
  clearHistory,
  copyToClipboardWithAutoClear,
} = require('../core/storage');

const els = {
  output: document.getElementById('passwordOutput'),
  copyBtn: document.getElementById('copyBtn'),
  generateBtn: document.getElementById('generateBtn'),
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
    value = generatePassword({
      length: Number(els.lengthRange.value),
      uppercase: els.optUppercase.checked,
      lowercase: els.optLowercase.checked,
      numbers: els.optNumbers.checked,
      symbols: els.optSymbols.checked,
      excludeAmbiguous: els.optExcludeAmbiguous.checked,
    });
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

els.generateBtn.addEventListener('click', generate);

els.copyBtn.addEventListener('click', () => {
  if (!els.output.value) return;
  copyToClipboardWithAutoClear(els.output.value);
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
generate();
