/**
 * Attempts to parse a simple, non-negated bracket character class (e.g.
 * `[A-F0-9]`, `[a-zA-Z0-9_-]`) out of a `pattern` attribute into an exact
 * set of characters `generatePassword`'s `customCharset` can draw from.
 * Handles the realistic subset of regex syntax real-world `pattern`
 * attributes actually use: literal characters, `x-y` ranges, and
 * `\`-escaped literals. Returns null — rather than guessing — for anything
 * it can't confidently parse: no bracket present, a negated class
 * (`[^...]`, which describes what's excluded, not an enumerable allowed
 * set), or a malformed range/escape. A pattern built from multiple bracket
 * groups (lookaheads, alternation) also only has its first bracket parsed,
 * which won't fully capture the intended charset — that's a known
 * limitation, not something this function tries to solve.
 * @param {string} pattern
 * @returns {string|null}
 */
function parseCharacterClass(pattern) {
  const bracketMatch = pattern.match(/\[([^\]]*)\]/);
  if (!bracketMatch) return null;
  const body = bracketMatch[1];
  if (body.startsWith('^')) return null;

  const chars = new Set();
  let i = 0;
  while (i < body.length) {
    if (body[i] === '\\') {
      if (i + 1 >= body.length) return null; // trailing backslash — malformed
      chars.add(body[i + 1]);
      i += 2;
      continue;
    }
    if (body[i + 1] === '-' && i + 2 < body.length) {
      const start = body.charCodeAt(i);
      const end = body.charCodeAt(i + 2);
      if (end < start || end - start > 1000) return null; // malformed or absurdly large range
      for (let code = start; code <= end; code += 1) {
        chars.add(String.fromCharCode(code));
      }
      i += 3;
      continue;
    }
    chars.add(body[i]);
    i += 1;
  }
  return chars.size > 0 ? [...chars].join('') : null;
}

/**
 * Pulls an exact/ranged length out of a `{n}` or `{n,m}` quantifier
 * immediately following a character class in `pattern`, if present, and
 * tightens `options.length` to it. Sites often express a length limit only
 * this way, with no separate maxlength attribute on the input at all —
 * e.g. `pattern="^[A-Za-z0-9]{8,20}$"`.
 * @param {string} pattern
 * @param {object} options
 * @returns {object} a new options object with `length` tightened, if a quantifier was found
 */
function applyPatternQuantifier(pattern, options) {
  const match = pattern.match(/\]\s*\{\s*(\d+)\s*(?:,\s*(\d+))?\s*\}/);
  if (!match) return options;
  const min = Number(match[1]);
  const max = match[2] !== undefined ? Number(match[2]) : min;
  const current = options.length ?? min;
  return { ...options, length: Math.min(Math.max(current, min), max) };
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
  let options = { ...defaults };
  const { minLength, maxLength, pattern } = constraints;

  if (typeof maxLength === 'number' && !Number.isNaN(maxLength) && maxLength > 0) {
    options.length = Math.min(options.length || maxLength, maxLength);
  }
  if (typeof minLength === 'number' && !Number.isNaN(minLength)) {
    options.length = Math.max(options.length || minLength, minLength);
  }

  if (pattern) {
    options = applyPatternQuantifier(pattern, options);
    const customCharset = parseCharacterClass(pattern);
    if (customCharset) {
      options.customCharset = customCharset;
    }
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
  parseCharacterClass,
  applyPatternQuantifier,
};
