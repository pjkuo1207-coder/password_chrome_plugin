const { generatePassword } = require('./generator');
const { suggestRuleFromConstraints } = require('./domParser');

/**
 * Generates a 'password'-mode value, honoring detected DOM constraints when
 * present. Falls back to the caller's plain options if the constrained
 * options turn out infeasible (e.g. maxLength shorter than the number of
 * currently-enabled character groups) rather than throwing — a detected
 * field shouldn't be able to break password generation.
 * @param {object} baseOptions generator options built from the popup's controls
 * @param {{minLength: number|null, maxLength: number|null, pattern: string|null}|null} constraints
 * @returns {string}
 */
function generateConstrainedPassword(baseOptions, constraints) {
  if (!constraints) {
    return generatePassword(baseOptions);
  }
  const constrainedOptions = suggestRuleFromConstraints(constraints, baseOptions);
  try {
    return generatePassword(constrainedOptions);
  } catch {
    return generatePassword(baseOptions);
  }
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

module.exports = { generateConstrainedPassword, describeDetectedField };
