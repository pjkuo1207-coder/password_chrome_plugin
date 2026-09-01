const { generateConstrainedPassword, describeDetectedField } = require('../src/core/popupLogic');

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

  it('falls back to the base options when the constrained options are infeasible', () => {
    // maxLength=3 can't fit one char from each of the 4 enabled groups.
    const value = generateConstrainedPassword(baseOptions, {
      minLength: null,
      maxLength: 3,
      pattern: null,
    });
    expect(value).toHaveLength(16);
  });

  it('disables symbols for an alphanumeric-only pattern regardless of quantifier/case-order', () => {
    const value = generateConstrainedPassword(baseOptions, {
      minLength: null,
      maxLength: null,
      pattern: '^[A-Za-z0-9]{8,20}$',
    });
    expect(value).not.toMatch(/[!@#$%^&*()\-_=+[\]{}]/);
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
