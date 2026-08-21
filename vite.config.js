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
        //
        // ── The other half of this lives in vercel.json ──
        // Splitting the chunks only pays if the browser actually KEEPS the
        // ones that did not change, and that is a response header, not a
        // bundler setting. vercel.json sends /assets/* as
        // `max-age=31536000, immutable`, which is safe precisely because
        // every name here carries a content hash: the bytes behind a given
        // URL can never change, because a new build writes a new URL.
        //
        // index.html gets the opposite — `max-age=0, must-revalidate`. It is
        // the one file whose URL stays put while its contents change, it is
        // what names the current chunks, and it is what hasNewBundle diffs to
        // notice a deploy (see lib/usePullToRefresh). Caching it would pin a
        // phone to an old build AND blind the mechanism for escaping one.
        // The service worker and the manifest are the same case, and the
        // service worker is the one that is hard to undo: a stale copy keeps
        // serving the version it was, on a device with no address bar.
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
  },
})
