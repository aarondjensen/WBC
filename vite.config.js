import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // ── Splitting the vendor code out of the app's ──
        //
        // Everything used to ship as one 1.1MB file, which meant every deploy
        // — a copy change, a colour, a one-line fix — invalidated the whole
        // thing. A phone on a course with one bar re-downloaded React and the
        // entire Firebase SDK to pick up a reworded button.
        //
        // These three change on completely different clocks. Firebase moves
        // when its version does, React likewise, and the app moves constantly.
        // Split apart, a routine deploy re-downloads only the app chunk and
        // the other two come off disk — which is the difference between a
        // pull-to-refresh finishing in the car park and finishing on the 1st
        // tee.
        //
        // Split by SOURCE PATH rather than by named package: `firebase/app`,
        // `firebase/firestore` and `@firebase/*` all resolve into the same
        // node_modules tree, and listing package names by hand misses the
        // transitive half — which is most of it.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // ── Push and photo storage, on their own ──
          // Neither is imported statically anywhere: messaging is dynamic by
          // the MODULE LOAD POLICY in lib/notifications.js, and storage is
          // dynamic in lib/mediaUpload for its size. A dynamic import still
          // lands in whatever chunk it is ASSIGNED to, though, so folding both
          // in with `firebase` below undid the deferral and shipped them to
          // every phone anyway — the deliberate `import()` bought nothing.
          //
          // Split out they are fetched by the phone that registers for
          // notifications and the phone that posts a photo, and never by
          // somebody opening a leaderboard.
          if (/[\\/]node_modules[\\/](@firebase|firebase)[\\/]messaging[\\/]/.test(id)) return "firebase-messaging";
          if (/[\\/]node_modules[\\/](@firebase|firebase)[\\/]storage[\\/]/.test(id)) return "firebase-storage";
          // The callables SDK, same treatment for the same reason. It serves
          // two buttons on the account sheet — revoke an Apple token, release
          // a membership — and both call sites `await import()` it. Without a
          // name of its own it landed straight back in `firebase` below and
          // every phone fetched it to open a leaderboard.
          if (/[\\/]node_modules[\\/](@firebase|firebase)[\\/]functions[\\/]/.test(id)) return "firebase-functions";
          if (/[\\/]node_modules[\\/](@firebase|firebase|idb)[\\/]/.test(id)) return "firebase";
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
          return "vendor";
        },
      },
    },
  },
  // Force the automatic JSX runtime for the TEST transform. Without it the
  // component tests compile to classic `React.createElement` and every one of
  // them dies with "React is not defined", since no source file imports React
  // by name. The production build already uses the automatic runtime; this
  // makes the test transform agree with it.
  //
  // MnQ hit this first and carries the same three lines — worth knowing before
  // anybody deletes them as redundant, because the build stays green either way
  // and only the tests fall over.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    // Unit tests only. firestore.rules.test.mjs is an INTEGRATION test — it
    // needs the Firestore emulator listening on 127.0.0.1:8080 and fails with
    // ECONNREFUSED without it, which would make `npm test` red by default and
    // train everyone to ignore it.
    //
    // Run the rules suite deliberately, with the emulator up:
    //   firebase emulators:exec --only firestore "npx vitest run firestore.rules.test.mjs"
    //
    // `scripts/` is included for one test that needs no emulator and no
    // credential: import-history.smoke.test.js executes the import script under
    // plain `node` and reads its dry-run output. That script shipped broken on
    // Windows — it ran through vite-node, a transitive dependency whose binary
    // npm does not reliably link — and every test stayed green, because they all
    // ran under vitest, which resolves imports the script's own runtime could
    // not. A test of the LOGIC could never have caught it.
    include: ['src/**/*.{test,spec}.{js,jsx}', 'scripts/**/*.{test,spec}.{js,jsx}'],
    // ── `firebase/auth` means the BROWSER build here, as it does in the app ──
    // The package ships two: a browser build and a Node one whose
    // browser-only exports are stubs that throw
    // auth/operation-not-supported-in-this-environment. Vite picks the browser
    // build for every real bundle; vitest runs in Node and picks the other,
    // so a test of anything browser-shaped in Auth tests a stub.
    //
    // src/lib/authResolver.test.js is that test — it guards the internal field
    // firebase.js overrides to keep Sign in with Apple working inside an iPhone
    // home-screen app, and against the Node build the class it needs is an
    // error object. Aliased, tests see what a phone sees.
    // A file path, not a package specifier: @firebase/auth's exports map has
    // no ./dist/* entry, so the browser build is only reachable by pointing
    // straight at it.
    alias: [
      {
        find: /^firebase\/auth$/,
        replacement: fileURLToPath(new URL('./node_modules/@firebase/auth/dist/esm/index.js', import.meta.url)),
      },
    ],
  },
})
