import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'android', 'ios', 'functions/node_modules']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // A `const` read before its declaration throws at runtime rather than
      // reading undefined, and in a component that means a white screen. The
      // dangerous spot is anything evaluated during render — a hook dependency
      // array especially, since it looks deferred but is not. Functions are
      // exempt: they hoist, and calling one defined lower in the file is the
      // normal shape of this codebase.
      'no-use-before-define': ['error', { functions: false, classes: false, variables: true, allowNamedExports: true }],
      // `catch {}` is a deliberate shape here: browser APIs that are absent or
      // permission-blocked on some platforms should degrade quietly, not crash.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // Vercel serverless handlers — Node ESM, not browser.
  {
    files: ['api/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Firebase Cloud Functions — Node CommonJS, deployed separately with its own
  // package.json, so it never sees the browser globals or ESM syntax above.
  {
    files: ['functions/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
    },
  },
  // Service worker — no DOM, and `firebase` arrives as a global from the
  // compat bundles pulled in via importScripts().
  {
    files: ['public/**/*-sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, firebase: 'readonly' },
    },
  },
])
