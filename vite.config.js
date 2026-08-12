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
          if (/[\\/]node_modules[\\/](@firebase|firebase|idb)[\\/]/.test(id)) return "firebase";
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
          return "vendor";
        },
      },
    },
  },
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
