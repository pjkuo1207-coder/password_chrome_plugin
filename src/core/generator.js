const CHARSETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numbers: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{}',
};

const AMBIGUOUS = /[Il1O0o]/g;

const VOWELS = 'aeiou';
const CONSONANTS = 'bcdfghjklmnpqrstvwxyz';

// 128 words so a default 6-word passphrase (see generatePassphrase) has
// ~52 bits of entropy (log2(128^6 * 900) ≈ 51.8) rather than the ~30 bits
// a smaller list would give — still short of a full diceware-grade list,
// but a meaningful floor for a "human-typeable" mode.
const WORDLIST = [
  'acorn', 'amber', 'anchor', 'antler', 'arbor', 'arctic', 'autumn', 'badge',
  'banjo', 'barley', 'basil', 'beacon', 'beaver', 'birch', 'bishop', 'blaze',
  'bloom', 'bolt', 'boulder', 'bramble', 'breeze', 'bridge', 'bristle', 'bronze',
  'brook', 'canyon', 'cardinal', 'cedar', 'cellar', 'chalk', 'charm', 'chisel',
  'cider', 'cinder', 'clover', 'cobalt', 'comet', 'compass', 'copper', 'coral',
  'cotton', 'crag', 'cranberry', 'crater', 'crescent', 'cricket', 'crimson', 'crystal',
  'dawn', 'delta', 'dune', 'eagle', 'ember', 'emerald', 'falcon', 'feather',
  'fern', 'ferrous', 'fjord', 'flare', 'flint', 'forest', 'forge', 'fossil',
  'garnet', 'glacier', 'goldfinch', 'granite', 'gravel', 'hamlet', 'harbor', 'harvest',
  'hazel', 'heron', 'hollow', 'hornbeam', 'hyacinth', 'ivory', 'ivy', 'jade',
  'jasper', 'juniper', 'kestrel', 'kettle', 'lagoon', 'lantern', 'larch', 'lark',
  'lavender', 'ledge', 'lichen', 'lilac', 'lumen', 'magpie', 'maple', 'marble',
  'meadow', 'mesa', 'mica', 'mint', 'mistral', 'moss', 'nectar', 'nettle',
  'nutmeg', 'oasis', 'obsidian', 'onyx', 'opal', 'orchard', 'osprey', 'otter',
  'paddock', 'parsley', 'pebble', 'pepper', 'pewter', 'pine', 'plaza', 'plum',
  'poplar', 'prairie', 'quail', 'quartz', 'quill', 'raven', 'reed', 'ridge',
];

function getRandomValues(length) {
  return globalThis.crypto.getRandomValues(new Uint32Array(length));
}

// Plain `Uint32 % max` is very slightly biased toward lower values whenever
// max doesn't evenly divide 2^32. The bias is astronomically small for our
// charset sizes, but rejection sampling removes it entirely at near-zero
// extra cost, so there's no reason not to.
function randomInt(max) {
  const range = Math.floor(0x100000000 / max) * max;
  let value;
  do {
    [value] = getRandomValues(1);
  } while (value >= range);
  return value % max;
}

function pickChar(charset) {
  return charset[randomInt(charset.length)];
}

/**
 * Generates a random password from a Web Crypto secure charset.
 * @param {object} [options]
 * @param {number} [options.length=16]
 * @param {boolean} [options.uppercase=true]
 * @param {boolean} [options.lowercase=true]
 * @param {boolean} [options.numbers=true]
 * @param {boolean} [options.symbols=true]
 * @param {boolean} [options.excludeAmbiguous=false] Exclude visually ambiguous chars (I, l, 1, O, 0).
 * @param {string|null} [options.customCharset] When set, generate purely from this exact string
 *   of characters instead of the uppercase/lowercase/numbers/symbols toggles (which are then
 *   ignored). Used for DOM-detected patterns whose character class was parsed exactly, e.g. a
 *   hex-only field (`[A-Fa-f0-9]`) — see core/domParser.js's parseCharacterClass.
 * @returns {string}
 */
function generatePassword(options = {}) {
  const {
    length = 16,
    uppercase = true,
    lowercase = true,
    numbers = true,
    symbols = true,
    excludeAmbiguous = false,
    customCharset = null,
  } = options;

  let groups;
  if (customCharset) {
    groups = [customCharset];
  } else {
    groups = [];
    if (uppercase) groups.push(CHARSETS.uppercase);
    if (lowercase) groups.push(CHARSETS.lowercase);
    if (numbers) groups.push(CHARSETS.numbers);
    if (symbols) groups.push(CHARSETS.symbols);
  }

  if (groups.length === 0) {
    throw new Error('At least one character set must be enabled');
  }

  const cleanedGroups = excludeAmbiguous
    ? groups.map((g) => g.replace(AMBIGUOUS, ''))
    : groups;

  // A group that becomes empty (e.g. a customCharset consisting entirely of
  // ambiguous characters, stripped by excludeAmbiguous) would make
  // randomInt(0) below loop forever rather than just producing a bad
  // password — fail loudly and immediately instead.
  if (cleanedGroups.some((group) => group.length === 0)) {
    throw new Error('excludeAmbiguous removed every character from a selected character set');
  }

  const fullCharset = cleanedGroups.join('');

  if (length < cleanedGroups.length) {
    throw new Error(
      `length must be at least ${cleanedGroups.length} to include every selected character set`
    );
  }

  // Guarantee at least one char from each selected group, then fill the rest.
  const passwordChars = cleanedGroups.map((group) => pickChar(group));
  for (let i = passwordChars.length; i < length; i += 1) {
    passwordChars.push(pickChar(fullCharset));
  }

  // Fisher-Yates shuffle using Web Crypto randomness so guaranteed chars
  // aren't always at the front of the string.
  for (let i = passwordChars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join('');
}

/**
 * Generates a pronounceable password by alternating consonant/vowel syllables.
 * @param {object} [options]
 * @param {number} [options.length=12]
 * @param {boolean} [options.capitalize=true] Capitalize the first letter.
 * @param {boolean} [options.appendNumber=true] Append a random 2-digit number.
 * @returns {string}
 */
function generatePronounceable(options = {}) {
  const { length = 12, capitalize = true, appendNumber = true } = options;

  // When a numeric suffix is appended, reserve 2 chars for it so the total
  // output actually matches `length` (floored at 2 letters so a very short
  // request still produces something pronounceable rather than empty).
  const targetLength = appendNumber ? Math.max(length - 2, 2) : length;
  let result = '';
  let useConsonant = true;
  while (result.length < targetLength) {
    result += useConsonant ? pickChar(CONSONANTS) : pickChar(VOWELS);
    useConsonant = !useConsonant;
  }
  result = result.slice(0, targetLength);

  if (capitalize) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }
  if (appendNumber) {
    result += String(randomInt(90) + 10);
  }
  return result;
}

/**
 * Generates a passphrase of randomly selected words from the built-in wordlist.
 * @param {object} [options]
 * @param {number} [options.wordCount=6]
 * @param {string} [options.separator='-']
 * @param {boolean} [options.capitalize=true] Capitalize each word.
 * @param {boolean} [options.appendNumber=true] Append a random number to the last word.
 * @returns {string}
 */
function generatePassphrase(options = {}) {
  const {
    wordCount = 6,
    separator = '-',
    capitalize = true,
    appendNumber = true,
  } = options;

  const words = [];
  for (let i = 0; i < wordCount; i += 1) {
    let word = WORDLIST[randomInt(WORDLIST.length)];
    if (capitalize) {
      word = word.charAt(0).toUpperCase() + word.slice(1);
    }
    words.push(word);
  }
  if (appendNumber) {
    words.push(String(randomInt(900) + 100));
  }
  return words.join(separator);
}

module.exports = {
  generatePassword,
  generatePronounceable,
  generatePassphrase,
  CHARSETS,
  WORDLIST,
};
