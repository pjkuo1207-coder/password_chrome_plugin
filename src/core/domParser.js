const { CHARSETS } = require('./generator');

/**
 * Heuristic check for whether a `pattern` attribute's character class allows
 * only letters/digits. Only inspects the content of the first `[...]` class
 * rather than trying to fully parse the pattern, so it works regardless of
 * the surrounding anchors/quantifiers (`{8,20}`, `+`, `*`, ...) or the
 * ordering of ranges (`a-zA-Z0-9` vs `A-Za-z0-9`).
 * @param {string} pattern
 * @returns {boolean}
 */
function isAlphanumericOnlyPattern(pattern) {
  const bracketMatch = pattern.match(/\[([^\]]*)\]/);
  if (!bracketMatch) return false;
  const classContent = bracketMatch[1];

  // Strip alnum ranges like a-z / A-Z / 0-9 first — otherwise the '-' that
  // separates a range would look like a literal hyphen, which is itself one
  // of our symbol characters, and produce a false negative.
  const withoutRanges = classContent.replace(/[a-zA-Z0-9]-[a-zA-Z0-9]/g, '');
  const hasSymbol = [...CHARSETS.symbols].some((ch) => withoutRanges.includes(ch));
  const hasAlnum = /[a-zA-Z0-9]/.test(classContent);

  return hasAlnum && !hasSymbol;
}

/**
 * Reads length/pattern constraints off a password-like <input> element.
 * @param {HTMLInputElement} inputEl
 * @returns {{minLength: number|null, maxLength: number|null, pattern: string|null}}
 */
function parseInputConstraints(inputEl) {
  const minLengthAttr = inputEl.getAttribute('minlength');
  const maxLengthAttr = inputEl.getAttribute('maxlength');
  const pattern = inputEl.getAttribute('pattern');

  return {
    minLength: minLengthAttr !== null ? parseInt(minLengthAttr, 10) : null,
    maxLength: maxLengthAttr !== null ? parseInt(maxLengthAttr, 10) : null,
    pattern: pattern || null,
  };
}

/**
 * Maps a set of DOM constraints onto generator options, so the generated
 * password satisfies the site's own validation before it's ever submitted.
 * @param {{minLength: number|null, maxLength: number|null, pattern: string|null}} constraints
 * @param {object} [defaults] Base generator options to layer the constraints on top of.
 * @returns {object} generator options (see core/generator.js)
 */
function suggestRuleFromConstraints(constraints, defaults = {}) {
  const options = { ...defaults };
  const { minLength, maxLength, pattern } = constraints;

  if (typeof maxLength === 'number' && !Number.isNaN(maxLength) && maxLength > 0) {
    options.length = Math.min(options.length || maxLength, maxLength);
  }
  if (typeof minLength === 'number' && !Number.isNaN(minLength)) {
    options.length = Math.max(options.length || minLength, minLength);
  }

  if (pattern && isAlphanumericOnlyPattern(pattern)) {
    // Sites that forbid symbols commonly express it via an alphanumeric-only pattern.
    options.symbols = false;
  }

  return options;
}

/**
 * Finds candidate password input elements within a document/root.
 * @param {Document|Element} root
 * @returns {HTMLInputElement[]}
 */
function findPasswordInputs(root) {
  return Array.from(
    root.querySelectorAll('input[type="password"], input[autocomplete*="password"]')
  );
}

module.exports = {
  parseInputConstraints,
  suggestRuleFromConstraints,
  findPasswordInputs,
};
