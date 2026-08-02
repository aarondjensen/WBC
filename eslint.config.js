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
  // ── The design scales are the only source of these numbers ──
  // Every one of these started as a loose literal at a call site, and loose
  // literals are how the app ended up with 19 font sizes, 15 corner radii, 29
  // alpha washes and 7 spellings of 4 transition durations — none of which
  // anyone chose, all of which someone typed. A 1px step is invisible on its
  // own and indistinguishable from a mistake, so nothing in review catches it;
  // this does.
  //
  // The fix is never a new number. It is the rung whose ROLE matches what you
  // are rendering — see the comments on each scale in theme.js. If a rung
  // genuinely does not exist for it, add one THERE, with a note on what it is
  // for, so the next person inherits a decision instead of a digit.
  //
  // Two files are exempt. theme.js is where the numbers live. main.jsx is the
  // crash boundary, and it shares NOTHING with the app on purpose — its own
  // hexes, its own font stack, no imports past React — so that the screen
  // shown when the app dies cannot be taken down by the module that killed it.
  // Importing the theme into it to satisfy a lint rule would trade that away.
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/theme.js', 'src/main.jsx'],
    rules: {
      'no-restricted-syntax': ['error',
        // Two selectors per scale, not one. A bare descendant match (`Property
        // Literal`) reaches every number in the value expression — the 0 in a
        // `d < 0 ?` test, the step count in `fsStep(size, 1)` — and flags
        // arithmetic that was never a size. A direct-child match alone misses
        // the other half: `cond ? 10 : 9` hides its literals one level down.
        // So: the value itself, plus the BRANCHES of any ternary in it. A
        // comparison operand sits under a BinaryExpression and matches neither.
        {
          selector: 'Property[key.name="fontSize"] > Literal[value=type(number)]',
          message: 'Use a rung off the FS type scale (FS.small, FS.body, …) rather than a raw px size — see theme.js.',
        },
        {
          selector: 'Property[key.name="fontSize"] ConditionalExpression > Literal[value=type(number)]',
          message: 'Use a rung off the FS type scale (FS.small, FS.body, …) rather than a raw px size — see theme.js.',
        },
        {
          selector: 'Property[key.name="borderRadius"] > Literal[value=type(number)][value!=0]',
          message: 'Use a rung off the R radius scale (R.sm, R.md, …) rather than a raw px radius — see theme.js.',
        },
        {
          // 0 is exempt here: a squared-off corner is the absence of a radius,
          // not a size someone picked off-scale.
          selector: 'Property[key.name="borderRadius"] ConditionalExpression > Literal[value=type(number)][value!=0]',
          message: 'Use a rung off the R radius scale (R.sm, R.md, …) rather than a raw px radius — see theme.js.',
        },
        {
          // `K.acc + "40"` — a colour token with a hand-typed alpha stapled on.
          selector: 'BinaryExpression[operator="+"] > Literal[value=/^[0-9a-fA-F]{2}$/]',
          message: 'Use a rung off the ALPHA ladder (K.acc + ALPHA.line) rather than a hand-typed hex alpha — see theme.js.',
        },
        {
          // Any transition carrying its own duration. The template-literal form
          // (`opacity ${MOTION}`) is a TemplateLiteral, so it never matches.
          selector: 'Property[key.name="transition"] > Literal[value=/[0-9](s|ms)\\b/]',
          message: 'Use MOTION for the duration: transition: `opacity ${MOTION}` — see theme.js.',
        },
      ],
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
