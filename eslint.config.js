// Lint rules: the recommended JavaScript, React and React Hooks rules, plus a few that keep code
// small and honest (no unused code, no console.log left behind). Run: npm run lint
import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  { ignores: ['dist/', 'node_modules/', 'pdfwise-backup*/'] },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
    },
  },
  {
    // Browser app
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off', // plain JS project: props are documented at the component
    },
  },
  {
    // Node: server, build scripts, tests
    files: ['server/**/*.js', 'scripts/**/*.{js,mjs}', 'tests/**/*.mjs', '*.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-console': 'off' }, // server logs and build-script output
  },
  {
    // The service worker template runs in a worker, with build-time placeholders.
    files: ['scripts/sw-template.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, __PRECACHE_CORE__: 'readonly', __PRECACHE_REST__: 'readonly' },
    },
  },
]
