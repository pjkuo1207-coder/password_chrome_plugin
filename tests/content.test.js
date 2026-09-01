/**
 * @jest-environment jsdom
 */
const { detectPasswordFieldRules, fillFocusedPasswordField } = require('../src/content/index');

describe('detectPasswordFieldRules', () => {
  it('returns the target password field\'s constraints, ignoring other inputs', () => {
    document.body.innerHTML = `
      <input type="password" minlength="8" maxlength="20" pattern="[a-zA-Z0-9]+" />
      <input type="text" />
    `;
    expect(detectPasswordFieldRules()).toEqual([
      { minLength: 8, maxLength: 20, pattern: '[a-zA-Z0-9]+' },
    ]);
  });

  it('returns an empty array when there is no password field', () => {
    document.body.innerHTML = '<input type="text" />';
    expect(detectPasswordFieldRules()).toEqual([]);
  });

  it('detects the focused field\'s constraints when a page has multiple password fields', () => {
    // e.g. a "current password" field (loose/no rules) and a "new password"
    // field (strict rules) on the same form — detection must agree with
    // fillFocusedPasswordField about which one is the target, or a
    // generated password could satisfy the wrong field's constraints.
    document.body.innerHTML = `
      <input type="password" id="current" />
      <input type="password" id="new" minlength="12" maxlength="16" pattern="[A-Za-z0-9]+" />
    `;
    document.getElementById('new').focus();

    expect(detectPasswordFieldRules()).toEqual([
      { minLength: 12, maxLength: 16, pattern: '[A-Za-z0-9]+' },
    ]);
  });
});

describe('fillFocusedPasswordField', () => {
  it('fills the focused password input and dispatches input/change events', () => {
    document.body.innerHTML = '<input type="password" id="pw" />';
    const input = document.getElementById('pw');
    input.focus();

    const inputHandler = jest.fn();
    const changeHandler = jest.fn();
    input.addEventListener('input', inputHandler);
    input.addEventListener('change', changeHandler);

    const result = fillFocusedPasswordField('N3wP@ssw0rd');

    expect(result).toBe(true);
    expect(input.value).toBe('N3wP@ssw0rd');
    expect(inputHandler).toHaveBeenCalledTimes(1);
    expect(changeHandler).toHaveBeenCalledTimes(1);
  });

  it('falls back to the first password field on the page if none is focused', () => {
    document.body.innerHTML = '<input type="text" id="other" /><input type="password" id="pw" />';
    document.getElementById('other').focus();

    const result = fillFocusedPasswordField('fallback-pw');
    expect(result).toBe(true);
    expect(document.getElementById('pw').value).toBe('fallback-pw');
  });

  it('returns false when there is no password field on the page', () => {
    document.body.innerHTML = '<input type="text" />';
    expect(fillFocusedPasswordField('x')).toBe(false);
  });
});
