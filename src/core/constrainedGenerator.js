const { generatePassword } = require('./generator');
const { suggestRuleFromConstraints } = require('./domParser');

const MAX_PATTERN_RETRY_ATTEMPTS = 20;
const ALL_GROUPS = ['uppercase', 'lowercase', 'numbers', 'symbols'];
// Priority order to drop groups in when the detected length is too short to
// fit one char from every enabled group — least to most "essential".
// lowercase is never dropped, so generation always has somewhere to land.
const DEGRADABLE_GROUPS = ['symbols', 'uppercase', 'numbers'];

/**
 * If `options.length` is too short to fit one character from every
 * currently-enabled group, progressively disables groups until it fits.
 * Used so a very short detected length (e.g. a legacy 3-4 char PIN field)
 * degrades to a shorter, simpler password instead of either throwing or —
 * the previous behavior — silently ignoring the length limit and falling
 * back to a much longer, non-conforming password.
 * @param {object} options
 * @returns {object}
 */
function relaxGroupsToFitLength(options) {
  if (options.customCharset) return options; // already a single group — nothing to relax
  const relaxed = { ...options };
  for (const group of DEGRADABLE_GROUPS) {
    const enabledCount = ALL_GROUPS.filter((g) => relaxed[g] !== false).length;
    if (enabledCount <= (relaxed.length ?? enabledCount)) break;
    relaxed[group] = false;
  }
  return relaxed;
}

/**
 * HTML's `pattern` attribute is implicitly fully-anchored even without
 * explicit ^/$, unlike a bare JS RegExp — this wraps it to match that.
 * Returns null (rather than throwing) if `pattern` isn't valid JS regex
 * syntax, since HTML pattern syntax isn't guaranteed to be a strict subset.
 * @param {string} pattern
 * @returns {RegExp|null}
 */
function compilePattern(pattern) {
  try {
    return new RegExp(`^(?:${pattern})$`);
  } catch {
    return null;
  }
}

/**
 * Generates a 'password'-mode value, honoring detected DOM constraints when
 * present:
 * - length is tightened to the minlength/maxlength/pattern-quantifier bounds
 *   (via suggestRuleFromConstraints)
 * - a parseable bracket character class in `pattern` (e.g. `[A-F0-9]`)
 *   overrides the charset entirely via generatePassword's `customCharset`
 * - if those options turn out infeasible for the length (e.g. maxLength
 *   shorter than the number of enabled groups), relaxGroupsToFitLength
 *   degrades gracefully instead of throwing or ignoring the length
 * - if `pattern` compiles as a RegExp, the result is validated against it
 *   and regeneration is retried (bounded) until it matches — a pattern with
 *   multiple bracket groups, lookaheads, or alternation isn't fully
 *   captured by parsing just the first bracket, so this catches more of
 *   those cases than a single blind generation would, though not all of
 *   them (best effort: the last attempt is returned even if it still
 *   doesn't match, since character-set selection alone can't model every
 *   possible pattern)
 * Only falls back to the caller's plain, unconstrained options if every
 * attempt above still throws outright — never leaves the caller with no
 * password at all.
 * @param {object} baseOptions generator options (see core/generator.js)
 * @param {{minLength: number|null, maxLength: number|null, pattern: string|null}|null} constraints
 * @returns {string}
 */
function generateConstrainedPassword(baseOptions, constraints) {
  if (!constraints) {
    return generatePassword(baseOptions);
  }

  const constrainedOptions = suggestRuleFromConstraints(constraints, baseOptions);

  let candidate;
  try {
    candidate = generatePassword(constrainedOptions);
  } catch {
    try {
      candidate = generatePassword(relaxGroupsToFitLength(constrainedOptions));
    } catch {
      return generatePassword(baseOptions);
    }
  }

  const regex = constraints.pattern ? compilePattern(constraints.pattern) : null;
  if (!regex || regex.test(candidate)) {
    return candidate;
  }

  for (let attempt = 0; attempt < MAX_PATTERN_RETRY_ATTEMPTS; attempt += 1) {
    let attemptValue;
    try {
      attemptValue = generatePassword(constrainedOptions);
    } catch {
      break;
    }
    if (regex.test(attemptValue)) return attemptValue;
    candidate = attemptValue;
  }
  return candidate;
}

/**
 * Human-readable status line shown under the popup's output field once DOM
 * detection finds a password field. `minLength`/`maxLength` of `0` are real,
 * meaningful values (not "absent"), so this checks against `null` rather
 * than truthiness.
 * @param {{minLength: number|null, maxLength: number|null}} constraints
 * @returns {string}
 */
function describeDetectedField({ minLength, maxLength }) {
  if (minLength === null && maxLength === null) {
    return 'Detected a password field on this page.';
  }
  return `Detected a password field (length ${minLength ?? '?'}–${maxLength ?? '?'}) — options adjusted to match.`;
}

module.exports = {
  generateConstrainedPassword,
  describeDetectedField,
  relaxGroupsToFitLength,
};
