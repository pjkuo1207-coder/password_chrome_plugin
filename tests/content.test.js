/**
 * @jest-environment jsdom
 */
const { detectPasswordFieldRules, fillFocusedPasswordField } = require('../src/content/index');

describe('detectPasswordFieldRules', () => {
  it('returns constraints for each password input on the page, ignoring other inputs', () => {
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
