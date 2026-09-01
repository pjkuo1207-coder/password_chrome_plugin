const {
  generateConstrainedPassword,
  describeDetectedField,
  relaxGroupsToFitLength,
} = require('../src/core/constrainedGenerator');

const baseOptions = {
  length: 16,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  excludeAmbiguous: false,
};

describe('generateConstrainedPassword', () => {
  it('uses the plain options when there are no detected constraints', () => {
    expect(generateConstrainedPassword(baseOptions, null)).toHaveLength(16);
  });

  it('applies a detected maxLength', () => {
    const value = generateConstrainedPassword(baseOptions, {
      minLength: null,
      maxLength: 10,
      pattern: null,
    });
    expect(value).toHaveLength(10);
  });

  it('degrades to fewer character groups, keeping the length, when maxLength is too short to fit them all', () => {
    // maxLength=3 can't fit one char from each of the 4 enabled groups —
    // should shrink to fit rather than ignoring the length constraint.
    const value = generateConstrainedPassword(baseOptions, {
      minLength: null,
      maxLength: 3,
      pattern: null,
    });
    expect(value).toHaveLength(3);
  });

  it('disables symbols for an alphanumeric-only pattern regardless of quantifier/case-order', () => {
    const value = generateConstrainedPassword(baseOptions, {
      minLength: null,
      maxLength: null,
      pattern: '^[A-Za-z0-9]{8,20}$',
    });
    expect(value).not.toMatch(/[!@#$%^&*()\-_=+[\]{}]/);
  });

  it('conforms to a narrow custom-charset pattern like a hex-only field', () => {
    const pattern = '^[A-Fa-f0-9]{8}$';
    const regex = new RegExp(pattern);
    const value = generateConstrainedPassword(baseOptions, {
      minLength: null,
      maxLength: null,
      pattern,
    });
    expect(value).toHaveLength(8);
    expect(regex.test(value)).toBe(true);
  });

  it('falls back to the base options only when even the relaxed/base generation is infeasible', () => {
    const allDisabled = { length: 16, uppercase: false, lowercase: false, numbers: false, symbols: false };
    expect(() => generateConstrainedPassword(allDisabled, null)).toThrow();
  });
});

describe('relaxGroupsToFitLength', () => {
  it('drops groups (symbols first) until the length fits', () => {
    const relaxed = relaxGroupsToFitLength({ ...baseOptions, length: 3 });
    expect(relaxed.symbols).toBe(false);
    expect(relaxed.lowercase).not.toBe(false);
  });

  it('leaves options unchanged when they already fit', () => {
    const relaxed = relaxGroupsToFitLength({ ...baseOptions, length: 16 });
    expect(relaxed).toEqual({ ...baseOptions, length: 16 });
  });

  it('leaves a customCharset option untouched — there is nothing to relax', () => {
    const options = { length: 2, customCharset: 'AB' };
    expect(relaxGroupsToFitLength(options)).toBe(options);
  });
});

describe('describeDetectedField', () => {
  it('treats minLength: 0 as a real value, not absence of one', () => {
    expect(describeDetectedField({ minLength: 0, maxLength: null })).toMatch(/length 0–\?/);
  });

  it('describes a field with no length constraints generically', () => {
    expect(describeDetectedField({ minLength: null, maxLength: null })).toBe(
      'Detected a password field on this page.'
    );
  });

  it('shows ? for whichever bound is unknown', () => {
    expect(describeDetectedField({ minLength: null, maxLength: 12 })).toBe(
      'Detected a password field (length ?–12) — options adjusted to match.'
    );
  });
});
