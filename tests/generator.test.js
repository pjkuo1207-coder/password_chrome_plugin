const {
  generatePassword,
  generatePronounceable,
  generatePassphrase,
  CHARSETS,
} = require('../src/core/generator');

describe('generatePassword', () => {
  it('defaults to a 16-character password', () => {
    expect(generatePassword()).toHaveLength(16);
  });

  it('respects the requested length', () => {
    expect(generatePassword({ length: 32 })).toHaveLength(32);
  });

  it('only uses characters from enabled charsets', () => {
    const password = generatePassword({
      length: 40,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: false,
    });
    const allowed = CHARSETS.uppercase + CHARSETS.lowercase + CHARSETS.numbers;
    expect([...password].every((c) => allowed.includes(c))).toBe(true);
  });

  it('excludes ambiguous characters when requested', () => {
    const password = generatePassword({ length: 200, excludeAmbiguous: true });
    expect(password).not.toMatch(/[Il1O0o]/);
  });

  it('throws if no character sets are enabled', () => {
    expect(() =>
      generatePassword({ uppercase: false, lowercase: false, numbers: false, symbols: false })
    ).toThrow();
  });

  it('throws if length is too short to fit every selected set', () => {
    expect(() => generatePassword({ length: 2 })).toThrow();
  });

  it('produces different output across calls (randomness sanity check)', () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generatePassword()));
    expect(passwords.size).toBeGreaterThan(1);
  });
});

describe('generatePronounceable', () => {
  it('alternates consonant/vowel and appends a 2-digit number by default', () => {
    const value = generatePronounceable();
    expect(value).toMatch(/^[A-Z][a-z]+\d{2}$/);
  });

  it('respects a custom length before the numeric suffix', () => {
    const value = generatePronounceable({ length: 10, appendNumber: false });
    expect(value).toHaveLength(10);
  });
});

describe('generatePassphrase', () => {
  it('joins the requested number of words with the separator', () => {
    const value = generatePassphrase({ wordCount: 3, appendNumber: false, separator: '_' });
    expect(value.split('_')).toHaveLength(3);
  });

  it('appends a numeric suffix by default', () => {
    const value = generatePassphrase();
    const parts = value.split('-');
    expect(parts[parts.length - 1]).toMatch(/^\d+$/);
  });
});
