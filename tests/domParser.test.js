/**
 * @jest-environment jsdom
 */
const {
  parseInputConstraints,
  suggestRuleFromConstraints,
  findPasswordInputs,
} = require('../src/core/domParser');

function makeInput({ minlength, maxlength, pattern, type = 'password' } = {}) {
  const el = document.createElement('input');
  el.type = type;
  if (minlength !== undefined) el.setAttribute('minlength', minlength);
  if (maxlength !== undefined) el.setAttribute('maxlength', maxlength);
  if (pattern !== undefined) el.setAttribute('pattern', pattern);
  return el;
}

describe('parseInputConstraints', () => {
  it('reads minlength/maxlength/pattern off an input', () => {
    const el = makeInput({ minlength: 8, maxlength: 20, pattern: '[a-zA-Z0-9]+' });
    expect(parseInputConstraints(el)).toEqual({
      minLength: 8,
      maxLength: 20,
      pattern: '[a-zA-Z0-9]+',
    });
  });

  it('returns nulls when attributes are absent', () => {
    const el = makeInput();
    expect(parseInputConstraints(el)).toEqual({
      minLength: null,
      maxLength: null,
      pattern: null,
    });
  });
});

describe('suggestRuleFromConstraints', () => {
  it('caps length to maxLength', () => {
    const options = suggestRuleFromConstraints({ minLength: null, maxLength: 10, pattern: null }, {
      length: 16,
    });
    expect(options.length).toBe(10);
  });

  it('raises length to minLength', () => {
    const options = suggestRuleFromConstraints({ minLength: 20, maxLength: null, pattern: null }, {
      length: 16,
    });
    expect(options.length).toBe(20);
  });

  it('disables symbols for alphanumeric-only patterns', () => {
    const options = suggestRuleFromConstraints({
      minLength: null,
      maxLength: null,
      pattern: '^[a-zA-Z0-9]+$',
    });
    expect(options.symbols).toBe(false);
  });

  it('disables symbols for a length-quantified alphanumeric-only pattern', () => {
    const options = suggestRuleFromConstraints({
      minLength: null,
      maxLength: null,
      pattern: '^[a-zA-Z0-9]{8,20}$',
    });
    expect(options.symbols).toBe(false);
  });

  it('disables symbols regardless of the character class ordering', () => {
    const options = suggestRuleFromConstraints({
      minLength: null,
      maxLength: null,
      pattern: '^[A-Za-z0-9]+$',
    });
    expect(options.symbols).toBe(false);
  });

  it('does not disable symbols when the pattern explicitly allows them', () => {
    const options = suggestRuleFromConstraints({
      minLength: null,
      maxLength: null,
      pattern: '^[a-zA-Z0-9!@#]{8,20}$',
    });
    expect(options.symbols).toBeUndefined();
  });
});

describe('findPasswordInputs', () => {
  it('finds inputs of type=password', () => {
    document.body.innerHTML = '';
    document.body.appendChild(makeInput());
    document.body.appendChild(makeInput({ type: 'text' }));
    expect(findPasswordInputs(document)).toHaveLength(1);
  });
});
