/**
 * @jest-environment jsdom
 */
const {
  parseInputConstraints,
  suggestRuleFromConstraints,
  findPasswordInputs,
  parseCharacterClass,
  applyPatternQuantifier,
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

describe('parseCharacterClass', () => {
  it('expands a simple range', () => {
    expect(parseCharacterClass('[a-c]')).toBe('abc');
  });

  it('handles a mix of ranges and literal characters', () => {
    const result = parseCharacterClass('[a-cXY]');
    expect([...result].sort().join('')).toBe('XYabc');
  });

  it('handles a backslash-escaped literal instead of treating it as a range', () => {
    expect(parseCharacterClass('[a\\-z]')).toBe('a-z');
  });

  it('deduplicates repeated/overlapping characters', () => {
    expect(parseCharacterClass('[a-ca-c]')).toBe('abc');
  });

  it('returns null for a negated class', () => {
    expect(parseCharacterClass('[^abc]')).toBeNull();
  });

  it('returns null when there is no bracket at all', () => {
    expect(parseCharacterClass('^\\d{4}$')).toBeNull();
  });
});

describe('applyPatternQuantifier', () => {
  it('sets an exact length from a {n} quantifier', () => {
    expect(applyPatternQuantifier('^[A-F0-9]{8}$', { length: 16 }).length).toBe(8);
  });

  it('clamps an out-of-range length into a {min,max} quantifier', () => {
    expect(applyPatternQuantifier('^[a-z]{8,20}$', { length: 30 }).length).toBe(20);
    expect(applyPatternQuantifier('^[a-z]{8,20}$', { length: 3 }).length).toBe(8);
  });

  it('leaves options untouched when there is no quantifier', () => {
    expect(applyPatternQuantifier('^[a-z]+$', { length: 16 }).length).toBe(16);
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

  it('builds a custom charset from a simple bracket pattern', () => {
    const options = suggestRuleFromConstraints({
      minLength: null,
      maxLength: null,
      pattern: '^[a-zA-Z0-9]+$',
    });
    expect(options.customCharset).toHaveLength(62);
    expect(options.customCharset).not.toMatch(/[^a-zA-Z0-9]/);
  });

  it('builds an exact charset for a narrow class like hex digits, and reads its {n} length', () => {
    const options = suggestRuleFromConstraints({
      minLength: null,
      maxLength: null,
      pattern: '^[A-Fa-f0-9]{8}$',
    });
    expect([...options.customCharset].sort().join('')).toBe(
      [...'ABCDEFabcdef0123456789'].sort().join('')
    );
    expect(options.length).toBe(8);
  });

  it('does not build a custom charset for a negated class', () => {
    const options = suggestRuleFromConstraints({
      minLength: null,
      maxLength: null,
      pattern: '^[^<>]+$',
    });
    expect(options.customCharset).toBeUndefined();
  });

  it('derives length from a {min,max} quantifier with no maxlength attribute at all', () => {
    const options = suggestRuleFromConstraints(
      { minLength: null, maxLength: null, pattern: '^[a-zA-Z0-9]{8,20}$' },
      { length: 30 }
    );
    expect(options.length).toBe(20);
  });

  it('leaves options unchanged for an unparseable pattern rather than guessing', () => {
    const options = suggestRuleFromConstraints(
      { minLength: null, maxLength: null, pattern: '^\\w{8,20}$' },
      { length: 16 }
    );
    expect(options.customCharset).toBeUndefined();
    expect(options.length).toBe(16);
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
