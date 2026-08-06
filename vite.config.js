import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
