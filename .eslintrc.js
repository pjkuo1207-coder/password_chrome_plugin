module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    webextensions: true,
  },
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  globals: {
    module: 'readonly',
    require: 'readonly',
  },
  overrides: [
    {
      files: ['tests/**/*.js'],
      env: { jest: true, node: true },
    },
    {
      files: ['webpack.config.js', 'babel.config.js', 'jest.config.js'],
      env: { node: true },
    },
  ],
};
