import tseslint from 'typescript-eslint';

export default tseslint.config(
  {ignores: ['**/dist/**', '**/.output/**', '**/.wxt/**', '**/node_modules/**']},
  ...tseslint.configs.recommended,
  {
    files: ['packages/**/*.ts', 'packages/**/*.tsx'],
    rules: {
      'no-restricted-globals': [
        'error',
        {name: 'chrome', message: 'packages/* must stay shell-agnostic. Move this to apps/*.'},
        {name: 'browser', message: 'packages/* must stay shell-agnostic. Move this to apps/*.'},
        {name: 'fetch', message: 'packages/* is pure/DOM-only shared code. Network APIs belong in apps/*.'},
        {name: 'process', message: 'packages/* is pure/DOM-only shared code. Node APIs belong in apps/*.'},
      ],
      '@typescript-eslint/consistent-type-assertions': ['error', {assertionStyle: 'never'}],
    },
  },
);
