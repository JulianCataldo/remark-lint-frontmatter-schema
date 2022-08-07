// eslint-disable-next-line tsdoc/syntax
/** @type {import("@types/eslint").Linter.Config} */

module.exports = {
  settings: {
    'import/resolver': {
      typescript: {}, // this loads <rootdir>/tsconfig.json to eslint
    },
  },
  env: {
    node: true,
    es2022: true,
    browser: true,
  },
  extends: ['eslint:recommended'],

  plugins: ['eslint-plugin-tsdoc'],

  rules: {
    'no-restricted-syntax': 0,
    'tsdoc/syntax': 'warn',
  },

  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  overrides: [
    {
      files: ['*.js', '*.mjs', '*.cjs'],
      extends: ['airbnb-base', 'prettier'],
      rules: {
        'no-restricted-syntax': 0,
        'import/extensions': 'off',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    {
      files: ['*.ts'],
      parser: '@typescript-eslint/parser',
      extends: [
        'airbnb-base',
        'plugin:@typescript-eslint/recommended',
        'prettier',
      ],
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
        ],
        '@typescript-eslint/no-non-null-assertion': 'off',
        'max-lines': [
          'error',
          { max: 100, skipComments: true, skipBlankLines: true },
        ],
        'import/extensions': [
          'error',
          'ignorePackages',
          {
            js: 'never',
            jsx: 'never',
            ts: 'never',
            tsx: 'never',
          },
        ],
      },
    },
  ],
};
