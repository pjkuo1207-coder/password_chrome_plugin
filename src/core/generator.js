const CHARSETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numbers: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{}',
};

const AMBIGUOUS = /[Il1O0o]/g;

const VOWELS = 'aeiou';
const CONSONANTS = 'bcdfghjklmnpqrstvwxyz';

const WORDLIST = [
  'anchor', 'basil', 'canyon', 'delta', 'ember', 'falcon', 'garnet', 'harbor',
  'inlet', 'jasper', 'kilo', 'lumen', 'meadow', 'nectar', 'onyx', 'pebble',
  'quartz', 'ridge', 'saffron', 'timber', 'umber', 'violet', 'willow', 'xenon',
  'yonder', 'zephyr', 'amber', 'birch', 'cedar', 'dune', 'ferrous', 'glacier',
];

function getRandomValues(length) {
  return globalThis.crypto.getRandomValues(new Uint32Array(length));
}

function randomInt(max) {
  return getRandomValues(1)[0] % max;
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
  } = options;

  const groups = [];
  if (uppercase) groups.push(CHARSETS.uppercase);
  if (lowercase) groups.push(CHARSETS.lowercase);
  if (numbers) groups.push(CHARSETS.numbers);
  if (symbols) groups.push(CHARSETS.symbols);

  if (groups.length === 0) {
    throw new Error('At least one character set must be enabled');
  }

  const cleanedGroups = excludeAmbiguous
    ? groups.map((g) => g.replace(AMBIGUOUS, ''))
    : groups;
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

  const targetLength = appendNumber ? Math.max(length - 2, 4) : length;
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
 * @param {number} [options.wordCount=4]
 * @param {string} [options.separator='-']
 * @param {boolean} [options.capitalize=true] Capitalize each word.
 * @param {boolean} [options.appendNumber=true] Append a random number to the last word.
 * @returns {string}
 */
function generatePassphrase(options = {}) {
  const {
    wordCount = 4,
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
